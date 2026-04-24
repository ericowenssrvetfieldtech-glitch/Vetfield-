#!/usr/bin/env node
/**
 * VetField Cart Hub Server
 * Runs on Raspberry Pi. Opens UWB serial port, detects shots, broadcasts to Toughbooks.
 *
 * Environment variables:
 *   UWB_PORT    Serial device (default: /dev/ttyUSB0)
 *   UWB_BAUD    Baud rate    (default: 115200)
 *   WS_PORT     WebSocket port (default: 8765)
 *   HTTP_PORT   Status HTTP port (default: 8766)
 *   SIMULATE    Set to "true" to generate synthetic shots (no hardware needed)
 */

const { WebSocketServer } = require("ws");
const http = require("http");

const WS_PORT   = parseInt(process.env.WS_PORT   || "8765", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT  || "8766", 10);
const SIMULATE  = process.env.SIMULATE === "true";

// ── UWB constants ─────────────────────────────────────────────────────────────
const SHOT_THRESHOLD_M  = 0.8;   // ball must move this far to start shot detection
const SHOT_SETTLE_MS    = 1800;  // wait this long after movement stops
const POLL_MS           = 80;    // Qorvo reports every ~80ms

// ── State ─────────────────────────────────────────────────────────────────────
let clients      = new Set();
let lastPosition = null;   // { x, y, ts }
let restPosition = null;   // position when ball last came to rest
let shotActive   = false;
let settleTimer  = null;
let gpsCoord     = null;   // { lat, lng } — updated by gpsd
let sensorHealth = { uwb: "init", gps: "init", uptime: 0 };

const startTime  = Date.now();

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[hub] client connected  (${clients.size} total)`);

  // send current sensor health on connect
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
    clients:  clients.size,
    uptime:   Math.round((Date.now() - startTime) / 1000),
    gps:      gpsCoord,
    simulate: SIMULATE,
  };
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(payload);
  }
}

// ── Shot detection logic ──────────────────────────────────────────────────────
function distM(a, b) {
  // UWB coordinates are in metres on a local grid
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function metresToYards(m) { return Math.round(m * 1.09361); }

// Normalise UWB metres to [0,1] canvas space for the React map
// Hole bounding box assumed ≤ 150m × 150m
const FIELD_SIZE_M = 150;
function normalise(pos) {
  return { x: pos.x / FIELD_SIZE_M, y: 1 - pos.y / FIELD_SIZE_M };
}

function onUWBPosition(pos /* { x, y } in metres */) {
  const now = Date.now();
  const curr = { ...pos, ts: now };
  sensorHealth.uwb = "ok";

  if (!restPosition) {
    restPosition = curr;
    lastPosition = curr;
    return;
  }

  const moved = distM(curr, restPosition);

  if (!shotActive && moved >= SHOT_THRESHOLD_M) {
    shotActive = true;
    console.log(`[hub] shot started — moved ${moved.toFixed(2)}m`);
  }

  if (shotActive) {
    // reset settle timer every time ball is still moving
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const distance = distM(curr, restPosition);
      const yards    = metresToYards(distance);
      const norm     = normalise(curr);
      console.log(`[hub] shot ended — ${yards}y`);

      broadcast({
        type: "SHOT_DETECTED",
        payload: {
          player:   "p1",       // Pi doesn't know which player; app overrides with activePlayer
          hole:     null,       // app fills from currentHole state
          distance: yards,
          x:        norm.x,
          y:        norm.y,
          gps:      gpsCoord,
          ts:       Date.now(),
        },
      });

      restPosition = curr;
      shotActive   = false;
      settleTimer  = null;
    }, SHOT_SETTLE_MS);
  }

  lastPosition = curr;
}

// ── UWB serial reader ─────────────────────────────────────────────────────────
function startUWB() {
  const port  = process.env.UWB_PORT || "/dev/ttyUSB0";
  const baud  = parseInt(process.env.UWB_BAUD || "115200", 10);

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort }    = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch {
    console.warn("[hub] serialport package not found — UWB disabled");
    sensorHealth.uwb = "missing_package";
    return;
  }

  const sp = new SerialPort({ path: port, baudRate: baud });
  const parser = sp.pipe(new ReadlineParser({ delimiter: "\n" }));

  sp.on("open",  () => { console.log(`[hub] UWB serial open: ${port}`); sensorHealth.uwb = "ok"; });
  sp.on("error", (e) => { console.error("[hub] UWB error:", e.message); sensorHealth.uwb = "error"; });

  // Qorvo DWM1001 line format: "POS,<x_m>,<y_m>,<z_m>,<quality>"
  parser.on("data", (line) => {
    const parts = line.trim().split(",");
    if (parts[0] === "POS" && parts.length >= 3) {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      if (!isNaN(x) && !isNaN(y)) onUWBPosition({ x, y });
    }
  });
}

// ── GPS (gpsd via @waylandproject/node-gpsd) ──────────────────────────────────
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
  console.log("[hub] SIMULATE mode — generating synthetic shots");
  sensorHealth.uwb = "simulate";
  sensorHealth.gps = "simulate";

  // Synthetic 3-shot hole sequence: tee shot, approach, chip
  const sequence = [
    { x: 5,  y: 5  },   // rest / tee
    { x: 82, y: 38 },   // after drive  (~230y)
    { x: 133,y: 61 },   // after approach (~145y)
    { x: 140,y: 66 },   // after chip     (~18y)
  ];
  let step = 0;

  function doStep() {
    if (step >= sequence.length) return;
    const target = sequence[step];
    const start  = sequence[Math.max(0, step - 1)];
    step++;

    // animate movement over 600ms in 80ms ticks
    let t = 0;
    const move = setInterval(() => {
      t += POLL_MS;
      const frac = Math.min(t / 600, 1);
      onUWBPosition({
        x: start.x + (target.x - start.x) * frac,
        y: start.y + (target.y - start.y) * frac,
      });
      if (frac >= 1) {
        clearInterval(move);
        // pause between shots
        setTimeout(doStep, 4000);
      }
    }, POLL_MS);
  }

  // start after 2s so clients can connect
  setTimeout(doStep, 2000);
}

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
