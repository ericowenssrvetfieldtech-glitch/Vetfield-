#!/usr/bin/env node
/**
 * VetField Cart Hub Server
 * Runs on Raspberry Pi. Opens UWB serial port(s), detects shots, broadcasts to Toughbooks.
 *
 * Supports two UWB architectures:
 *
 *   1. ANCHOR MODE (Qorvo DWM1001/DWM3000 anchors + tag on ball)
 *      Anchors around the hole receive UWB pings from the ball's tag.
 *      The anchor network computes position via TDOA and sends it over serial.
 *      This is the architecture used by OnCore GENiUS ball and custom builds.
 *
 *   2. TAG MODE (single UWB tag on the cart, ball has UWB tag)
 *      The cart-mounted tag ranges to the ball's tag. Simpler but only gives
 *      distance, not full 2D position. The server estimates position from
 *      distance + last-known direction.
 *
 * Environment variables:
 *   UWB_PORT      Serial device for UWB anchor gateway (default: /dev/ttyUSB0)
 *   UWB_PORT_2    Second serial port for multi-anchor setups (optional)
 *   UWB_BAUD      Baud rate (default: 115200)
 *   UWB_MODE      "anchor" or "tag" (default: "anchor")
 *   WS_PORT       WebSocket port (default: 8765)
 *   HTTP_PORT     Status HTTP port (default: 8766)
 *   SIMULATE      Set to "true" to generate synthetic shots (no hardware needed)
 *   BALL_IDS      Comma-separated UWB tag IDs to track (default: "ball1,ball2")
 *   FIELD_SIZE_M  Course bounding box in metres (default: 150)
 */

const { WebSocketServer } = require("ws");
const http = require("http");

const WS_PORT      = parseInt(process.env.WS_PORT      || "8765", 10);
const HTTP_PORT    = parseInt(process.env.HTTP_PORT     || "8766", 10);
const SIMULATE     = process.env.SIMULATE === "true";
const UWB_MODE     = process.env.UWB_MODE  || "anchor";
const UWB_BAUD     = parseInt(process.env.UWB_BAUD     || "115200", 10);
const FIELD_SIZE_M = parseFloat(process.env.FIELD_SIZE_M || "150");
const BALL_IDS     = (process.env.BALL_IDS || "ball1,ball2").split(",").map(s => s.trim());

// ── UWB constants ─────────────────────────────────────────────────────────────
const SHOT_THRESHOLD_M  = 0.8;   // ball must move this far to start shot detection
const SHOT_SETTLE_MS    = 1800;  // wait this long after movement stops
const POLL_MS           = 80;    // Qorvo reports every ~80ms
const MAX_BALL_AGE_MS  = 10000; // stop tracking a ball if no update for 10s

// ── State ─────────────────────────────────────────────────────────────────────
let clients = new Set();
let gpsCoord = null;
let sensorHealth = { uwb: "init", gps: "init", uptime: 0, mode: UWB_MODE, ballsTracked: 0 };
const startTime = Date.now();

// Per-ball state: keyed by ball tag ID
const balls = new Map(); // id → { lastPosition, restPosition, shotActive, settleTimer, lastUpdate }

function ensureBall(id) {
  if (!balls.has(id)) {
    balls.set(id, {
      lastPosition: null,
      restPosition: null,
      shotActive: false,
      settleTimer: null,
      lastUpdate: Date.now(),
    });
  }
  return balls.get(id);
}

// ── WebSocket server ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[hub] client connected  (${clients.size} total)`);
  ws.send(JSON.stringify({ type: "STATUS", payload: buildStatus() }));

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === "PING") {
      ws.send(JSON.stringify({ type: "PONG", ts: msg.ts }));
    }
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
    gps: gpsCoord,
    simulate: SIMULATE,
    ballsTracked: balls.size,
    ballIds: Array.from(balls.keys()),
  };
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

// ── Shot detection logic ──────────────────────────────────────────────────────
function distM(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function metresToYards(m) { return Math.round(m * 1.09361); }

function normalise(pos) {
  return { x: pos.x / FIELD_SIZE_M, y: 1 - pos.y / FIELD_SIZE_M };
}

function onUWBPosition(ballId, pos /* { x, y } in metres */) {
  const now = Date.now();
  const curr = { ...pos, ts: now };
  const ball = ensureBall(ballId);
  ball.lastUpdate = now;
  sensorHealth.uwb = "ok";
  sensorHealth.ballsTracked = balls.size;

  if (!ball.restPosition) {
    ball.restPosition = curr;
    ball.lastPosition = curr;
    // Broadcast initial position so the app shows the ball on the map
    broadcast({
      type: "BALL_POSITION",
      payload: {
        ballId,
        x: normalise(curr).x,
        y: normalise(curr).y,
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
          player: null,       // app maps ballId → activePlayer
          hole: null,         // app fills from currentHole state
          distance: yards,
          x: norm.x,
          y: norm.y,
          gps: gpsCoord,
          ts: Date.now(),
        },
      });

      ball.restPosition = curr;
      ball.shotActive = false;
      ball.settleTimer = null;
    }, SHOT_SETTLE_MS);
  }

  // Always broadcast live position for real-time ball tracking on the map
  broadcast({
    type: "BALL_POSITION",
    payload: {
      ballId,
      x: normalise(curr).x,
      y: normalise(curr).y,
      ts: now,
    },
  });

  ball.lastPosition = curr;
}

// ── UWB serial reader (anchor mode) ───────────────────────────────────────────
//
// Qorvo DWM1001 anchor gateway serial output formats:
//
//   Format 1 (DWM1001 default firmware):
//     POS,<tag_id>,<x_m>,<y_m>,<z_m>,<quality>
//
//   Format 2 (DWM3000 / custom firmware):
//     RANG,<tag_id>,<anchor_id>,<dist_m>,<quality>
//     (Multiple RANG lines from different anchors get triangulated here)
//
//   Format 3 (OnCore GENiUS ball / PFC patent system):
//     UWB,<ball_id>,<x_m>,<y_m>,<z_m>,<speed_mps>,<quality>
//
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

  // Ranging data for tag mode triangulation
  const rangingBuffer = new Map(); // tagId → { anchors: Map<anchorId, dist>, lastUpdate }

  parser.on("data", (line) => {
    const parts = line.trim().split(",");

    // Format 1: POS,<tag_id>,<x_m>,<y_m>,<z_m>,<quality>
    if (parts[0] === "POS" && parts.length >= 4) {
      const ballId = parts[1] || "ball1";
      const x = parseFloat(parts[2]);
      const y = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y)) onUWBPosition(ballId, { x, y });
      return;
    }

    // Format 2: RANG,<tag_id>,<anchor_id>,<dist_m>,<quality>
    // Collect ranges from multiple anchors, then triangulate
    if (parts[0] === "RANG" && parts.length >= 4 && UWB_MODE === "tag") {
      const tagId = parts[1] || "ball1";
      const anchorId = parts[2];
      const dist = parseFloat(parts[3]);
      if (isNaN(dist)) return;

      if (!rangingBuffer.has(tagId)) {
        rangingBuffer.set(tagId, { anchors: new Map(), lastUpdate: Date.now() });
      }
      const buf = rangingBuffer.get(tagId);
      buf.anchors.set(anchorId, dist);
      buf.lastUpdate = Date.now();

      // Need at least 3 anchors for 2D position via trilateration
      if (buf.anchors.size >= 3) {
        const pos = trilaterate(buf.anchors);
        if (pos) onUWBPosition(tagId, pos);
      }
      return;
    }

    // Format 3: UWB,<ball_id>,<x_m>,<y_m>,<z_m>,<speed_mps>,<quality>
    if (parts[0] === "UWB" && parts.length >= 4) {
      const ballId = parts[1] || "ball1";
      const x = parseFloat(parts[2]);
      const y = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y)) onUWBPosition(ballId, { x, y });
      return;
    }
  });

  // Optional second serial port for multi-anchor gateway
  const port2 = process.env.UWB_PORT_2;
  if (port2) {
    const sp2 = new SerialPort({ path: port2, baudRate: UWB_BAUD });
    const parser2 = sp2.pipe(new ReadlineParser({ delimiter: "\n" }));
    sp2.on("open", () => console.log(`[hub] UWB serial 2 open: ${port2}`));
    sp2.on("error", (e) => console.error("[hub] UWB serial 2 error:", e.message));
    parser2.on("data", (line) => {
      const parts = line.trim().split(",");
      if (parts[0] === "POS" && parts.length >= 4) {
        const ballId = parts[1] || "ball2";
        const x = parseFloat(parts[2]);
        const y = parseFloat(parts[3]);
        if (!isNaN(x) && !isNaN(y)) onUWBPosition(ballId, { x, y });
      }
    });
  }
}

// ── Simple trilateration from 3+ anchor ranges ────────────────────────────────
// Anchor positions must be known. For a golf hole, anchors are placed at known
// positions around the tee/green. This is a least-squares approximation.
//
// Configure anchor positions via environment:
//   ANCHOR_POS_<ID>=<x_m>,<y_m>   e.g. ANCHOR_POS_A1=10,5
//
const anchorPositions = {};
for (const key of Object.keys(process.env)) {
  const match = key.match(/^ANCHOR_POS_(.+)$/);
  if (match) {
    const id = match[1];
    const [x, y] = process.env[key].split(",").map(Number);
    if (!isNaN(x) && !isNaN(y)) anchorPositions[id] = { x, y };
  }
}

function trilaterate(ranges /* Map<anchorId, distM> */) {
  const known = Object.entries(anchorPositions);
  if (known.length < 3) {
    // Not enough anchor positions configured — fall back to simple centroid
    // weighted by inverse distance (closer anchors pull harder)
    let wx = 0, wy = 0, wt = 0;
    for (const [id, dist] of ranges) {
      if (dist <= 0) continue;
      const w = 1 / (dist * dist);
      wx += w;
      wy += w;
      wt += w;
    }
    return wt > 0 ? { x: wx / wt, y: wy / wt } : null;
  }

  // Least-squares trilateration using first 3 known anchors
  const pts = [];
  for (const [id, dist] of ranges) {
    if (anchorPositions[id]) {
      pts.push({ ...anchorPositions[id], r: dist });
    }
    if (pts.length >= 3) break;
  }
  if (pts.length < 3) return null;

  const [p1, p2, p3] = pts;
  const ex = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d = Math.sqrt(ex.x * ex.x + ex.y * ex.y);
  if (d === 0) return null;
  ex.x /= d; ex.y /= d;

  const t = { x: p3.x - p1.x, y: p3.y - p1.y };
  const iy = ex.x * t.y - ex.y * t.x;
  const ey = { x: -ex.y, y: ex.x };
  if (iy === 0) return null;

  const jx = (p1.r * p1.r - p2.r * p2.r + d * d) / (2 * d);
  const ky = (p1.r * p1.r - p3.r * p3.r + t.x * t.x + t.y * t.y) / (2 * iy) - jx * (t.x * ex.x + t.y * ex.y) / iy;

  return {
    x: p1.x + jx * ex.x + ky * ey.x,
    y: p1.y + jx * ex.y + ky * ey.y,
  };
}

// ── GPS (gpsd via node-gpsd) ──────────────────────────────────────────────────
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
    if (data.lat && data.lon) gpsCoord = { lat: data.lat, lng: data.lon };
  });
  listener.on("error", (e) => {
    console.warn("[hub] GPS error:", e);
    sensorHealth.gps = "error";
  });
}

// ── Simulate mode ─────────────────────────────────────────────────────────────
function startSimulate() {
  console.log("[hub] SIMULATE mode — generating synthetic shots for balls:", BALL_IDS.join(", "));
  sensorHealth.uwb = "simulate";
  sensorHealth.gps = "simulate";

  // Each ball gets its own 3-shot hole sequence
  const sequences = {
    ball1: [
      { x: 5,  y: 5  },   // tee
      { x: 82, y: 38 },   // after drive  (~230y)
      { x: 133,y: 61 },   // after approach (~145y)
      { x: 140,y: 66 },   // after chip     (~18y)
    ],
    ball2: [
      { x: 8,  y: 8  },   // tee
      { x: 75, y: 42 },   // after drive  (~215y)
      { x: 128,y: 58 },   // after approach (~155y)
      { x: 138,y: 64 },   // after chip     (~22y)
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
        onUWBPosition(ballId, {
          x: start.x + (target.x - start.x) * frac,
          y: start.y + (target.y - start.y) * frac,
        });
        if (frac >= 1) {
          clearInterval(move);
          setTimeout(doStep, 4000);
        }
      }, POLL_MS);
    }

    // Stagger ball starts so they don't fire simultaneously
    setTimeout(doStep, 2000 + BALL_IDS.indexOf(ballId) * 3000);
  }
}

// ── Stale ball cleanup ───────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, ball] of balls) {
    if (now - ball.lastUpdate > MAX_BALL_AGE_MS) {
      console.log(`[hub] [${id}] stale — removing (no update for ${MAX_BALL_AGE_MS}ms)`);
      if (ball.settleTimer) clearTimeout(ball.settleTimer);
      balls.delete(id);
    }
  }
  sensorHealth.ballsTracked = balls.size;
}, 5000);

// ── Uptime broadcast every 30s ────────────────────────────────────────────────
setInterval(() => {
  broadcast({ type: "STATUS", payload: buildStatus() });
}, 30_000);

// ── Boot ──────────────────────────────────────────────────────────────────────
if (SIMULATE) {
  startSimulate();
} else {
  startUWB();
  startGPS();
}
