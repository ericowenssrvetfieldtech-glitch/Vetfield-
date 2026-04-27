#!/usr/bin/env node
/**
 * VetField Cart Hub Server
 * Runs on Raspberry Pi. Reads UWB serial port(s), detects shots, broadcasts to Toughbooks.
 *
 * Three UWB architectures supported:
 *
 *   1. ANCHOR MODE (UWB_MODE=anchor)
 *      Anchors fixed around a hole. Gateway sends "POS,<tag>,<x>,<y>,<z>,<q>"
 *      with tag positions already in course coordinates.
 *
 *   2. TAG MODE (UWB_MODE=tag)
 *      Single ranging tag, distance only. Estimated position from last-known
 *      direction.
 *
 *   3. CART MODE (UWB_MODE=cart) ← *** new, primary mode for production carts ***
 *      3-4 UWB antennas mounted at known offsets on the cart receive ranges
 *      from each ball tag. The hub:
 *        a. Trilaterates the ball position in CART FRAME (metres from cart center)
 *        b. Reads cart GPS (lat/lng) from gpsd
 *        c. Reads cart HEADING from a magnetometer/IMU on /dev/i2c-1 OR derives
 *           it from GPS course-over-ground when the cart is moving
 *        d. Rotates the cart-frame ball offset by heading and translates to GPS
 *        e. Projects onto the current hole's bounding box → normalised x,y in [0,1]
 *
 *      Serial line format from each cart antenna gateway:
 *        RANG,<ball_id>,<antenna_id>,<dist_m>,<quality>
 *
 *      Antenna offsets (relative to cart centre, +x forward, +y left, metres)
 *      are configured via env: ANT_OFFSET_<ID>=<x>,<y>
 *
 * Environment variables:
 *   UWB_MODE         "anchor" | "tag" | "cart"   (default: "cart")
 *   UWB_PORT         Serial device                (default: /dev/ttyUSB0)
 *   UWB_PORT_2       Second serial port           (optional)
 *   UWB_BAUD         Baud rate                    (default: 115200)
 *   IMU_DEVICE       I2C device for compass       (default: /dev/i2c-1)
 *   IMU_ENABLE       "true" to read magnetometer  (default: "false" — uses GPS course)
 *   COURSE_LAT0      Course origin GPS lat        (default: 0)
 *   COURSE_LNG0      Course origin GPS lng        (default: 0)
 *   COURSE_HEADING_DEG  Course +x axis heading    (default: 0 = north)
 *   FIELD_SIZE_M     Course bounding box metres   (default: 150)
 *   BALL_IDS         Comma-separated tag IDs      (default: "ball1,ball2")
 *   ANT_OFFSET_A1    Antenna A1 offset            e.g. "0.6,0.5"
 *   ANT_OFFSET_A2    Antenna A2 offset            e.g. "0.6,-0.5"
 *   ANT_OFFSET_A3    Antenna A3 offset            e.g. "-0.6,0.0"
 *   ANT_OFFSET_A4    Antenna A4 offset            optional
 *   WS_PORT          WebSocket port               (default: 8765)
 *   HTTP_PORT        Status HTTP port             (default: 8766)
 *   SIMULATE         "true" for synthetic mode    (default: false)
 */

const { WebSocketServer } = require("ws");
const http = require("http");

const WS_PORT      = parseInt(process.env.WS_PORT      || "8765", 10);
const HTTP_PORT    = parseInt(process.env.HTTP_PORT     || "8766", 10);
const SIMULATE     = process.env.SIMULATE === "true";
const UWB_MODE     = process.env.UWB_MODE  || "cart";
const UWB_BAUD     = parseInt(process.env.UWB_BAUD     || "115200", 10);
const FIELD_SIZE_M = parseFloat(process.env.FIELD_SIZE_M || "150");
const BALL_IDS     = (process.env.BALL_IDS || "ball1,ball2").split(",").map(s => s.trim());
const IMU_ENABLE   = process.env.IMU_ENABLE === "true";

const COURSE_LAT0       = parseFloat(process.env.COURSE_LAT0       || "0");
const COURSE_LNG0       = parseFloat(process.env.COURSE_LNG0       || "0");
const COURSE_HEADING_DEG = parseFloat(process.env.COURSE_HEADING_DEG || "0");

// ── UWB constants ─────────────────────────────────────────────────────────────
const SHOT_THRESHOLD_M = 0.8;
const SHOT_SETTLE_MS   = 1800;
const POLL_MS          = 80;
const MAX_BALL_AGE_MS  = 10000;
const RANGE_BUNDLE_MS  = 200;     // collect ranges from antennas within this window
const CART_FRESH_MS    = 1500;    // GPS/heading older than this are stale

// ── Antenna offsets (cart frame, metres) ─────────────────────────────────────
const antennaOffsets = {};
for (const key of Object.keys(process.env)) {
  const m = key.match(/^ANT_OFFSET_(.+)$/);
  if (m) {
    const [x, y] = process.env[key].split(",").map(Number);
    if (!isNaN(x) && !isNaN(y)) antennaOffsets[m[1]] = { x, y };
  }
}
// Default 3-antenna roof rack layout if nothing configured
if (Object.keys(antennaOffsets).length === 0) {
  antennaOffsets.A1 = { x:  0.6, y:  0.5 };  // front-left  of roof
  antennaOffsets.A2 = { x:  0.6, y: -0.5 };  // front-right
  antennaOffsets.A3 = { x: -0.6, y:  0.0 };  // rear-centre
}

// ── State ─────────────────────────────────────────────────────────────────────
let clients = new Set();
let cart = {
  lat: null,
  lng: null,
  headingDeg: null,        // 0 = north, clockwise to east
  speedMps: 0,
  lastUpdate: 0,
};
let sensorHealth = {
  uwb:  "init",
  gps:  "init",
  imu:  IMU_ENABLE ? "init" : "disabled",
  mode: UWB_MODE,
  uptime: 0,
  ballsTracked: 0,
  antennas: Object.keys(antennaOffsets),
};
const startTime = Date.now();

// Per-ball state
const balls = new Map();
function ensureBall(id) {
  if (!balls.has(id)) {
    balls.set(id, {
      lastPosition: null,
      restPosition: null,
      shotActive: false,
      settleTimer: null,
      lastUpdate: Date.now(),
      ranging: { antennas: new Map(), ts: 0 },
    });
  }
  return balls.get(id);
}

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[hub] client connected (${clients.size} total)`);
  ws.send(JSON.stringify({ type: "STATUS", payload: buildStatus() }));
  ws.send(JSON.stringify({ type: "CART", payload: buildCart() }));

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === "PING") ws.send(JSON.stringify({ type: "PONG", ts: msg.ts }));
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[hub] client disconnected (${clients.size} total)`);
  });
});

console.log(`[hub] WebSocket server on ws://0.0.0.0:${WS_PORT}`);

// ── HTTP status endpoint ──────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(buildStatus(), null, 2));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});
httpServer.listen(HTTP_PORT, () =>
  console.log(`[hub] HTTP status on http://0.0.0.0:${HTTP_PORT}/status`)
);

function buildStatus() {
  return {
    ...sensorHealth,
    clients: clients.size,
    uptime: Math.round((Date.now() - startTime) / 1000),
    cart: { lat: cart.lat, lng: cart.lng, headingDeg: cart.headingDeg, speedMps: cart.speedMps },
    simulate: SIMULATE,
    ballsTracked: balls.size,
    ballIds: Array.from(balls.keys()),
  };
}

function buildCart() {
  let canvas = null;
  if (cart.lat != null && cart.lng != null) {
    const local = gpsToLocalM(cart.lat, cart.lng);
    const course = localToCourse(local.east, local.north);
    canvas = normalise(course);
  }
  return {
    lat: cart.lat,
    lng: cart.lng,
    headingDeg: cart.headingDeg,
    speedMps: cart.speedMps,
    canvasX: canvas?.x ?? null,
    canvasY: canvas?.y ?? null,
    ts: Date.now(),
  };
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === 1) ws.send(payload);
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
function distM(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function metresToYards(m) { return Math.round(m * 1.09361); }
function deg2rad(d) { return d * Math.PI / 180; }

// Equirectangular projection: lat/lng → metres east/north of course origin
const EARTH_R = 6378137; // metres
function gpsToLocalM(lat, lng) {
  const dLat = deg2rad(lat - COURSE_LAT0);
  const dLng = deg2rad(lng - COURSE_LNG0);
  const meanLat = deg2rad((lat + COURSE_LAT0) / 2);
  return {
    east:  EARTH_R * dLng * Math.cos(meanLat),
    north: EARTH_R * dLat,
  };
}

// Convert (east, north) metres to course frame (x, y) using COURSE_HEADING_DEG.
// Course +x axis points along COURSE_HEADING_DEG (clockwise from north).
function localToCourse(east, north) {
  const a = deg2rad(COURSE_HEADING_DEG);
  return {
    x:  east * Math.cos(a) + north * Math.sin(a),
    y: -east * Math.sin(a) + north * Math.cos(a),
  };
}

// Normalise course-frame metres to canvas [0,1]
function normalise(pos) {
  return { x: pos.x / FIELD_SIZE_M, y: 1 - pos.y / FIELD_SIZE_M };
}

// Trilaterate ball position in cart frame from N antenna ranges.
// antennaOffsets are in cart frame metres (+x forward, +y left).
// Uses linearised least-squares.
function trilaterateCartFrame(ranges /* Map<antId, distM> */) {
  const pts = [];
  for (const [id, r] of ranges) {
    if (antennaOffsets[id]) pts.push({ ...antennaOffsets[id], r });
  }
  if (pts.length < 3) return null;

  // Reference: first point
  const [p0, ...rest] = pts;
  const A = [], b = [];
  for (const p of rest) {
    A.push([2 * (p.x - p0.x), 2 * (p.y - p0.y)]);
    b.push(p0.r * p0.r - p.r * p.r - (p0.x * p0.x - p.x * p.x) - (p0.y * p0.y - p.y * p.y));
  }
  // Solve A^T A x = A^T b
  let aa00 = 0, aa01 = 0, aa11 = 0, ab0 = 0, ab1 = 0;
  for (let i = 0; i < A.length; i++) {
    aa00 += A[i][0] * A[i][0];
    aa01 += A[i][0] * A[i][1];
    aa11 += A[i][1] * A[i][1];
    ab0  += A[i][0] * b[i];
    ab1  += A[i][1] * b[i];
  }
  const det = aa00 * aa11 - aa01 * aa01;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: ( aa11 * ab0 - aa01 * ab1) / det,
    y: (-aa01 * ab0 + aa00 * ab1) / det,
  };
}

// Map cart-frame ball offset to course-frame absolute position using cart GPS+heading
function cartFrameToCourse(ballCart) {
  if (cart.lat == null || cart.lng == null) return null;
  if (Date.now() - cart.lastUpdate > CART_FRESH_MS) return null;
  const heading = cart.headingDeg ?? 0;

  // Rotate cart-frame (forward=+x, left=+y) into ENU (east, north).
  // Cart forward vector in ENU = (sin(heading), cos(heading)) since heading is
  // clockwise from north.
  const h = deg2rad(heading);
  const east  =  ballCart.x * Math.sin(h) + ballCart.y * Math.cos(h);
  const north =  ballCart.x * Math.cos(h) - ballCart.y * Math.sin(h);

  const cartLocal = gpsToLocalM(cart.lat, cart.lng);
  const ballEast  = cartLocal.east  + east;
  const ballNorth = cartLocal.north + north;

  return localToCourse(ballEast, ballNorth);
}

// ── Shot detection ────────────────────────────────────────────────────────────
function onBallPositionCourse(ballId, pos, ballCart /* optional cart-frame metres */) {
  const now = Date.now();
  const curr = { ...pos, ts: now };
  const ball = ensureBall(ballId);
  ball.lastUpdate = now;
  sensorHealth.uwb = "ok";
  sensorHealth.ballsTracked = balls.size;

  if (!ball.restPosition) {
    ball.restPosition = curr;
    ball.lastPosition = curr;
    broadcast({
      type: "BALL_POSITION",
      payload: {
        ballId,
        ...normalise(curr),
        cartOffsetM: ballCart || null,
        ts: now,
      },
    });
    return;
  }

  const moved = distM(curr, ball.restPosition);
  if (!ball.shotActive && moved >= SHOT_THRESHOLD_M) {
    ball.shotActive = true;
    console.log(`[hub] [${ballId}] shot started — moved ${moved.toFixed(2)}m`);
  }

  if (ball.shotActive) {
    if (ball.settleTimer) clearTimeout(ball.settleTimer);
    ball.settleTimer = setTimeout(() => {
      const distance = distM(curr, ball.restPosition);
      const yards = metresToYards(distance);
      const norm = normalise(curr);
      console.log(`[hub] [${ballId}] shot ended — ${yards}y`);

      broadcast({
        type: "SHOT_DETECTED",
        payload: {
          ballId,
          player: null,
          hole: null,
          distance: yards,
          x: norm.x,
          y: norm.y,
          gps: cart.lat != null ? { lat: cart.lat, lng: cart.lng } : null,
          cart: { lat: cart.lat, lng: cart.lng, headingDeg: cart.headingDeg },
          ts: Date.now(),
        },
      });

      ball.restPosition = curr;
      ball.shotActive = false;
      ball.settleTimer = null;
    }, SHOT_SETTLE_MS);
  }

  broadcast({
    type: "BALL_POSITION",
    payload: { ballId, ...normalise(curr), cartOffsetM: ballCart || null, ts: now },
  });
  ball.lastPosition = curr;
}

// ── UWB serial reader ─────────────────────────────────────────────────────────
function startUWB() {
  const port = process.env.UWB_PORT || "/dev/ttyUSB0";

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch {
    console.warn("[hub] serialport package not found — UWB disabled");
    sensorHealth.uwb = "missing_package";
    return;
  }

  const sp = new SerialPort({ path: port, baudRate: UWB_BAUD });
  const parser = sp.pipe(new ReadlineParser({ delimiter: "\n" }));

  sp.on("open", () => { console.log(`[hub] UWB serial open: ${port}`); sensorHealth.uwb = "ok"; });
  sp.on("error", (e) => { console.error("[hub] UWB error:", e.message); sensorHealth.uwb = "error"; });

  parser.on("data", (line) => handleSerialLine(line));

  const port2 = process.env.UWB_PORT_2;
  if (port2) {
    const sp2 = new SerialPort({ path: port2, baudRate: UWB_BAUD });
    const parser2 = sp2.pipe(new ReadlineParser({ delimiter: "\n" }));
    sp2.on("open", () => console.log(`[hub] UWB serial 2 open: ${port2}`));
    sp2.on("error", (e) => console.error("[hub] UWB serial 2 error:", e.message));
    parser2.on("data", (line) => handleSerialLine(line));
  }
}

function handleSerialLine(line) {
  const parts = line.trim().split(",");

  // CART MODE — antennas on cart range to ball tags
  // RANG,<ball_id>,<antenna_id>,<dist_m>,<quality>
  if (parts[0] === "RANG" && parts.length >= 4) {
    const ballId = parts[1] || "ball1";
    const antId = parts[2];
    const dist = parseFloat(parts[3]);
    if (isNaN(dist)) return;
    if (UWB_MODE !== "cart" && UWB_MODE !== "tag") return;

    const ball = ensureBall(ballId);
    const now = Date.now();
    if (now - ball.ranging.ts > RANGE_BUNDLE_MS) ball.ranging.antennas.clear();
    ball.ranging.antennas.set(antId, dist);
    ball.ranging.ts = now;

    if (UWB_MODE === "cart" && ball.ranging.antennas.size >= 3) {
      const ballCart = trilaterateCartFrame(ball.ranging.antennas);
      if (!ballCart) return;
      const courseXY = cartFrameToCourse(ballCart);
      if (!courseXY) {
        // No GPS yet — fall back to cart-frame coordinates so the app still
        // shows the ball relative to the cart at the centre of the field.
        const fallback = { x: FIELD_SIZE_M / 2 + ballCart.x, y: FIELD_SIZE_M / 2 + ballCart.y };
        onBallPositionCourse(ballId, fallback, ballCart);
        return;
      }
      onBallPositionCourse(ballId, courseXY, ballCart);
    }
    return;
  }

  // ANCHOR MODE — fixed anchors give absolute course position
  // POS,<tag_id>,<x_m>,<y_m>,<z_m>,<quality>
  if (parts[0] === "POS" && parts.length >= 4 && UWB_MODE === "anchor") {
    const ballId = parts[1] || "ball1";
    const x = parseFloat(parts[2]);
    const y = parseFloat(parts[3]);
    if (!isNaN(x) && !isNaN(y)) onBallPositionCourse(ballId, { x, y });
    return;
  }

  // OnCore-style: UWB,<ball>,<x>,<y>,<z>,<speed>,<q>
  if (parts[0] === "UWB" && parts.length >= 4) {
    const ballId = parts[1] || "ball1";
    const x = parseFloat(parts[2]);
    const y = parseFloat(parts[3]);
    if (!isNaN(x) && !isNaN(y)) onBallPositionCourse(ballId, { x, y });
    return;
  }
}

// ── GPS (gpsd) ───────────────────────────────────────────────────────────────
function startGPS() {
  let gpsd;
  try { gpsd = require("node-gpsd"); } catch {
    console.warn("[hub] node-gpsd not found — GPS disabled");
    sensorHealth.gps = "missing_package";
    return;
  }

  const listener = new gpsd.Listener({ port: 2947, hostname: "localhost", parse: true });
  listener.connect(() => {
    console.log("[hub] GPS daemon connected");
    sensorHealth.gps = "ok";
    listener.watch();
  });
  listener.on("TPV", (data) => {
    if (data.lat != null && data.lon != null) {
      cart.lat = data.lat;
      cart.lng = data.lon;
      cart.lastUpdate = Date.now();
      if (typeof data.speed === "number") cart.speedMps = data.speed;
      // GPS course-over-ground (track) when moving > 0.5 m/s
      if (!IMU_ENABLE && typeof data.track === "number" && cart.speedMps > 0.5) {
        cart.headingDeg = data.track;
      }
      broadcast({ type: "CART", payload: buildCart() });
    }
  });
  listener.on("error", (e) => {
    console.warn("[hub] GPS error:", e);
    sensorHealth.gps = "error";
  });
}

// ── IMU compass (HMC5883L / QMC5883L on I2C) ────────────────────────────────
// Reads heading every 100ms from a 3-axis magnetometer if IMU_ENABLE=true.
// Falls back to GPS course-over-ground when disabled.
function startIMU() {
  if (!IMU_ENABLE) return;
  let i2c;
  try { i2c = require("i2c-bus"); } catch {
    console.warn("[hub] i2c-bus not found — IMU disabled");
    sensorHealth.imu = "missing_package";
    return;
  }

  const bus = i2c.openSync(1);
  const ADDR = 0x0d; // QMC5883L default; HMC5883L is 0x1e
  try {
    bus.writeByteSync(ADDR, 0x0b, 0x01); // SET/RESET period
    bus.writeByteSync(ADDR, 0x09, 0x1d); // 200Hz, 8G, OSR=512, continuous
    sensorHealth.imu = "ok";
    console.log("[hub] IMU configured at 0x0d");
  } catch (e) {
    console.warn("[hub] IMU init failed:", e.message);
    sensorHealth.imu = "error";
    return;
  }

  setInterval(() => {
    try {
      const buf = Buffer.alloc(6);
      bus.readI2cBlockSync(ADDR, 0x00, 6, buf);
      const x = buf.readInt16LE(0);
      const y = buf.readInt16LE(2);
      let heading = Math.atan2(y, x) * 180 / Math.PI;
      if (heading < 0) heading += 360;
      cart.headingDeg = heading;
      cart.lastUpdate = Date.now();
    } catch (e) {
      // transient I2C error — leave previous heading
    }
  }, 100);
}

// ── Simulate mode ─────────────────────────────────────────────────────────────
function startSimulate() {
  console.log(`[hub] SIMULATE mode (${UWB_MODE}) — balls:`, BALL_IDS.join(", "));
  sensorHealth.uwb = "simulate";
  sensorHealth.gps = "simulate";

  // Fake cart sitting at course origin, facing along +x
  cart.lat = COURSE_LAT0;
  cart.lng = COURSE_LNG0;
  cart.headingDeg = COURSE_HEADING_DEG;
  cart.lastUpdate = Date.now();
  setInterval(() => broadcast({ type: "CART", payload: buildCart() }), 1000);

  const sequences = {
    ball1: [
      { x: 5,  y: 5  }, { x: 82, y: 38 }, { x: 133, y: 61 }, { x: 140, y: 66 },
    ],
    ball2: [
      { x: 8,  y: 8  }, { x: 75, y: 42 }, { x: 128, y: 58 }, { x: 138, y: 64 },
    ],
    ball3: [
      { x: 6,  y: 7  }, { x: 70, y: 35 }, { x: 120, y: 55 }, { x: 135, y: 62 },
    ],
    ball4: [
      { x: 9,  y: 6  }, { x: 78, y: 40 }, { x: 125, y: 56 }, { x: 137, y: 65 },
    ],
  };

  for (const ballId of BALL_IDS) {
    const seq = sequences[ballId] || sequences.ball1;
    let step = 0;

    function doStep() {
      if (step >= seq.length) return;
      const target = seq[step];
      const start = seq[Math.max(0, step - 1)];
      step++;

      let t = 0;
      const move = setInterval(() => {
        t += POLL_MS;
        const frac = Math.min(t / 600, 1);
        onBallPositionCourse(ballId, {
          x: start.x + (target.x - start.x) * frac,
          y: start.y + (target.y - start.y) * frac,
        });
        if (frac >= 1) {
          clearInterval(move);
          setTimeout(doStep, 4000);
        }
      }, POLL_MS);
    }

    setTimeout(doStep, 2000 + BALL_IDS.indexOf(ballId) * 3000);
  }
}

// ── Stale ball cleanup ────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, ball] of balls) {
    if (now - ball.lastUpdate > MAX_BALL_AGE_MS) {
      console.log(`[hub] [${id}] stale — removing`);
      if (ball.settleTimer) clearTimeout(ball.settleTimer);
      balls.delete(id);
    }
  }
  sensorHealth.ballsTracked = balls.size;
}, 5000);

setInterval(() => broadcast({ type: "STATUS", payload: buildStatus() }), 30_000);

// ── Boot ──────────────────────────────────────────────────────────────────────
if (SIMULATE) {
  startSimulate();
} else {
  startUWB();
  startGPS();
  startIMU();
}
