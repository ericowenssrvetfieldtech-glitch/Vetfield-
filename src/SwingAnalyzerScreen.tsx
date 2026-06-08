import { useState, useRef, useCallback, useEffect } from "react";
import { Activity, RotateCcw, ChevronLeft, Clock, Zap, TrendingUp, Watch, Smartphone, Bluetooth, BluetoothOff } from "lucide-react";
import { NAVY, GOLD, GREEN } from "./constants";
import { useGame } from "./gameStore";
import { supabase } from "./lib/supabase";

type Phase = "idle" | "countdown" | "recording" | "analyzing" | "result";
type SensorSource = "phone" | "watch";

interface Sample {
  t: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

interface SwingMetrics {
  peakG: number;
  tempo: number;
  backswingMs: number;
  downswingMs: number;
  smoothness: number;
  rating: string;
  ratingColor: string;
  source: SensorSource;
}

interface HistoryRow {
  id: string;
  peak_g: number;
  tempo: number;
  backswing_ms: number;
  downswing_ms: number;
  smoothness: number;
  rating: string;
  club: string;
  source: string;
  created_at: string;
}

interface WatchState {
  status: "disconnected" | "connecting" | "connected" | "error";
  device: BluetoothDevice | null;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  error: string | null;
  battery: number | null;
}

const CLUBS = ["DR", "3W", "5W", "4I", "5I", "6I", "7I", "8I", "9I", "PW", "GW", "SW"];

// Standard BLE UUIDs for motion/accelerometer services found on smartwatches
const MOTION_SERVICE_UUID = "00001814-0000-1000-8000-00805f9b34fb"; // Running Speed & Cadence (common)
const ACCEL_SERVICE_UUID = "0000181a-0000-1000-8000-00805f9b34fb"; // Environmental Sensing
const HEART_RATE_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const BATTERY_SERVICE = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL_CHAR = "00002a19-0000-1000-8000-00805f9b34fb";

// Custom Nordic UART service (used by many fitness wearables for raw data)
const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

function analyze(samples: Sample[]): Omit<SwingMetrics, "source"> | null {
  if (samples.length < 30) return null;

  const mags = samples.map(s => Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2));
  const gyros = samples.map(s => Math.sqrt(s.gx ** 2 + s.gy ** 2 + s.gz ** 2));
  const peakG = Math.round(Math.max(...mags) * 10) / 10;
  const peakIdx = mags.indexOf(Math.max(...mags));

  const threshold = 12;
  let startIdx = 0;
  for (let i = 0; i < mags.length; i++) {
    if (mags[i] > threshold) { startIdx = i; break; }
  }

  let transIdx = startIdx;
  const gSlice = gyros.slice(startIdx, peakIdx);
  if (gSlice.length > 5) {
    let minG = Infinity;
    for (let i = Math.floor(gSlice.length * 0.3); i < gSlice.length; i++) {
      if (gSlice[i] < minG) { minG = gSlice[i]; transIdx = startIdx + i; }
    }
  }

  const backswingMs = Math.round(samples[transIdx].t - samples[startIdx].t);
  const downswingMs = Math.round(samples[peakIdx].t - samples[transIdx].t);
  const tempo = backswingMs > 0 && downswingMs > 0
    ? Math.round((backswingMs / downswingMs) * 10) / 10
    : 3.0;

  let jerkSum = 0;
  for (let i = 1; i < mags.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    if (dt > 0) jerkSum += Math.abs(mags[i] - mags[i - 1]) / dt;
  }
  const smoothness = Math.max(0, Math.min(100, Math.round(100 - (jerkSum / mags.length) * 0.5)));

  let rating: string, ratingColor: string;
  if (smoothness >= 78 && tempo >= 2.5 && tempo <= 3.5) { rating = "Excellent"; ratingColor = "#4CAF50"; }
  else if (smoothness >= 55 && tempo >= 2.0 && tempo <= 4.0) { rating = "Good"; ratingColor = "#93C5FD"; }
  else if (smoothness >= 35) { rating = "Fair"; ratingColor = GOLD; }
  else { rating = "Needs Work"; ratingColor = "#F87171"; }

  return { peakG, tempo, backswingMs, downswingMs, smoothness, rating, ratingColor };
}

function SwingAnalyzerScreen() {
  const { dispatch } = useGame();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SwingMetrics | null>(null);
  const [club, setClub] = useState("DR");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [hasSensor, setHasSensor] = useState(true);
  const [source, setSource] = useState<SensorSource>("phone");
  const [watch, setWatch] = useState<WatchState>({
    status: "disconnected", device: null, characteristic: null, error: null, battery: null,
  });
  const [hasBluetooth, setHasBluetooth] = useState(true);

  const samplesRef = useRef<Sample[]>([]);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const t0Ref = useRef(0);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchRecordingRef = useRef(false);

  useEffect(() => {
    if (!window.DeviceMotionEvent) setHasSensor(false);
    if (!navigator.bluetooth) setHasBluetooth(false);
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("swing_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as HistoryRow[]);
  };

  // ── Watch Connection (Web Bluetooth) ───────────────────────────────────────────
  const connectWatch = async () => {
    if (!navigator.bluetooth) { setHasBluetooth(false); return; }

    setWatch(w => ({ ...w, status: "connecting", error: null }));

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [HEART_RATE_SERVICE] },
          { services: [MOTION_SERVICE_UUID] },
          { services: [ACCEL_SERVICE_UUID] },
          { services: [NORDIC_UART_SERVICE] },
        ],
        optionalServices: [BATTERY_SERVICE, NORDIC_UART_SERVICE, MOTION_SERVICE_UUID, ACCEL_SERVICE_UUID],
        acceptAllDevices: false,
      }).catch(() => {
        // Fallback: accept all devices if specific filter fails
        return navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [BATTERY_SERVICE, NORDIC_UART_SERVICE, HEART_RATE_SERVICE, MOTION_SERVICE_UUID],
        });
      });

      if (!device) {
        setWatch(w => ({ ...w, status: "disconnected" }));
        return;
      }

      device.addEventListener("gattserverdisconnected", () => {
        setWatch(w => ({ ...w, status: "disconnected", device: null, characteristic: null, battery: null }));
        setSource("phone");
      });

      const server = await device.gatt!.connect();

      // Try to read battery level
      let battery: number | null = null;
      try {
        const batteryService = await server.getPrimaryService(BATTERY_SERVICE);
        const batteryChar = await batteryService.getCharacteristic(BATTERY_LEVEL_CHAR);
        const batteryVal = await batteryChar.readValue();
        battery = batteryVal.getUint8(0);
      } catch { /* Battery not available */ }

      // Try to find a motion/UART characteristic for streaming
      let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
      try {
        const uartService = await server.getPrimaryService(NORDIC_UART_SERVICE);
        characteristic = await uartService.getCharacteristic(NORDIC_UART_TX);
      } catch {
        try {
          const motionService = await server.getPrimaryService(MOTION_SERVICE_UUID);
          const chars = await motionService.getCharacteristics();
          if (chars.length > 0) characteristic = chars[0];
        } catch { /* no motion service */ }
      }

      setWatch({ status: "connected", device, characteristic, error: null, battery });
      setSource("watch");
    } catch (err: any) {
      setWatch(w => ({ ...w, status: "error", error: err?.message || "Connection failed" }));
    }
  };

  const disconnectWatch = () => {
    if (watch.device?.gatt?.connected) {
      watch.device.gatt.disconnect();
    }
    setWatch({ status: "disconnected", device: null, characteristic: null, error: null, battery: null });
    setSource("phone");
  };

  // ── Phone Sensor Recording ─────────────────────────────────────────────────────
  const beginPhoneRecording = useCallback(() => {
    samplesRef.current = [];
    t0Ref.current = performance.now();

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      const r = e.rotationRate;
      if (!a || !r) return;
      const sample: Sample = {
        t: performance.now() - t0Ref.current,
        ax: a.x ?? 0, ay: a.y ?? 0, az: a.z ?? 0,
        gx: r.alpha ?? 0, gy: r.beta ?? 0, gz: r.gamma ?? 0,
      };
      samplesRef.current.push(sample);

      const mag = Math.sqrt(sample.ax ** 2 + sample.ay ** 2 + sample.az ** 2);
      if (mag > 20 && silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
      if (samplesRef.current.length > 50 && mag < 12) {
        if (!silenceRef.current) {
          silenceRef.current = setTimeout(() => endRecording(), 400);
        }
      }
    };

    handlerRef.current = handler;
    window.addEventListener("devicemotion", handler);
    setPhase("recording");
    setTimeout(() => { if (handlerRef.current === handler) endRecording(); }, 5000);
  }, []);

  // ── Watch Sensor Recording (BLE notifications) ─────────────────────────────────
  const beginWatchRecording = useCallback(async () => {
    samplesRef.current = [];
    t0Ref.current = performance.now();
    watchRecordingRef.current = true;

    if (watch.characteristic) {
      try {
        await watch.characteristic.startNotifications();
        watch.characteristic.addEventListener("characteristicvaluechanged", handleWatchData);
      } catch {
        // If notifications fail, fall back to phone
        beginPhoneRecording();
        return;
      }
    } else {
      // No characteristic available -- use phone sensor with watch as secondary indicator
      beginPhoneRecording();
      return;
    }

    setPhase("recording");
    setTimeout(() => { if (watchRecordingRef.current) endRecording(); }, 5000);
  }, [watch.characteristic]);

  const handleWatchData = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || !watchRecordingRef.current) return;

    // Parse incoming BLE data -- format depends on the watch
    // Common format: 6 int16 values (ax, ay, az, gx, gy, gz) packed in 12 bytes
    const t = performance.now() - t0Ref.current;

    if (value.byteLength >= 12) {
      const sample: Sample = {
        t,
        ax: value.getInt16(0, true) / 100,
        ay: value.getInt16(2, true) / 100,
        az: value.getInt16(4, true) / 100,
        gx: value.getInt16(6, true) / 10,
        gy: value.getInt16(8, true) / 10,
        gz: value.getInt16(10, true) / 10,
      };
      samplesRef.current.push(sample);

      const mag = Math.sqrt(sample.ax ** 2 + sample.ay ** 2 + sample.az ** 2);
      if (mag > 20 && silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
      if (samplesRef.current.length > 30 && mag < 12) {
        if (!silenceRef.current) {
          silenceRef.current = setTimeout(() => endRecording(), 400);
        }
      }
    } else if (value.byteLength >= 6) {
      // Shorter format: 3 int16 for accel only
      const sample: Sample = {
        t,
        ax: value.getInt16(0, true) / 100,
        ay: value.getInt16(2, true) / 100,
        az: value.getInt16(4, true) / 100,
        gx: 0, gy: 0, gz: 0,
      };
      samplesRef.current.push(sample);
    }
  }, []);

  const endRecording = useCallback(() => {
    // Clean up phone sensor
    if (handlerRef.current) {
      window.removeEventListener("devicemotion", handlerRef.current);
      handlerRef.current = null;
    }
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }

    // Clean up watch sensor
    watchRecordingRef.current = false;
    if (watch.characteristic) {
      try {
        watch.characteristic.removeEventListener("characteristicvaluechanged", handleWatchData);
        watch.characteristic.stopNotifications().catch(() => {});
      } catch { /* ignore */ }
    }

    setPhase("analyzing");
    setTimeout(() => {
      const m = analyze(samplesRef.current);
      if (m) {
        const fullResult: SwingMetrics = { ...m, source };
        setResult(fullResult);
        setPhase("result");
        saveSwing(fullResult);
      } else {
        setPhase("idle");
      }
    }, 700);
  }, [club, source, watch.characteristic, handleWatchData]);

  const saveSwing = async (m: SwingMetrics) => {
    await supabase.from("swing_sessions").insert({
      peak_g: m.peakG, tempo: m.tempo, backswing_ms: m.backswingMs,
      downswing_ms: m.downswingMs, smoothness: m.smoothness,
      rating: m.rating, club, source: m.source,
    });
    loadHistory();
  };

  const startSwing = async () => {
    if (source === "phone") {
      if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
        try {
          const p = await (DeviceMotionEvent as any).requestPermission();
          if (p !== "granted") { setHasSensor(false); return; }
        } catch { setHasSensor(false); return; }
      }
    }

    setPhase("countdown");
    setCountdown(3);
    let c = 3;
    const iv = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(iv);
        if (source === "watch" && watch.status === "connected") {
          beginWatchRecording();
        } else {
          beginPhoneRecording();
        }
      }
    }, 1000);
  };

  const runDemo = () => {
    setPhase("analyzing");
    setTimeout(() => {
      const s = 55 + Math.floor(Math.random() * 35);
      const t = +(2.6 + Math.random() * 0.8).toFixed(1);
      let rating: string, ratingColor: string;
      if (s >= 78 && t >= 2.5 && t <= 3.5) { rating = "Excellent"; ratingColor = "#4CAF50"; }
      else if (s >= 55) { rating = "Good"; ratingColor = "#93C5FD"; }
      else { rating = "Fair"; ratingColor = GOLD; }
      setResult({
        peakG: +(24 + Math.random() * 12).toFixed(1),
        tempo: t,
        backswingMs: 600 + Math.floor(Math.random() * 250),
        downswingMs: 180 + Math.floor(Math.random() * 100),
        smoothness: s, rating, ratingColor,
        source: "phone",
      });
      setPhase("result");
    }, 1000);
  };

  const reset = () => { setPhase("idle"); setResult(null); };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => dispatch({ type: "SET_VIEW", v: "home" })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", display: "flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size={14} /> Home
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={20} color={GREEN} /> Swing Analyzer
          </div>
          <div style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}>Accelerometer & Gyroscope</div>
        </div>
        <button onClick={() => setShowHist(!showHist)}
          style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${showHist ? GOLD : "rgba(255,255,255,0.12)"}`, background: showHist ? `${GOLD}12` : "transparent", color: showHist ? GOLD : "#9CA3AF", cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>
          {showHist ? "CAPTURE" : "HISTORY"}
        </button>
      </div>

      {!showHist ? (
        <>
          {/* Sensor Source Toggle */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1, marginBottom: 10 }}>SENSOR SOURCE</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSource("phone")}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${source === "phone" ? "#60A5FA" : "rgba(255,255,255,0.08)"}`, background: source === "phone" ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                <Smartphone size={16} color={source === "phone" ? "#60A5FA" : "#6B7280"} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: source === "phone" ? "#fff" : "#9CA3AF", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13 }}>Phone</div>
                  <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>{hasSensor ? "Ready" : "No sensors"}</div>
                </div>
              </button>
              <button onClick={() => { if (watch.status === "connected") setSource("watch"); else connectWatch(); }}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${source === "watch" ? "#34D399" : "rgba(255,255,255,0.08)"}`, background: source === "watch" ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
                <Watch size={16} color={source === "watch" ? "#34D399" : "#6B7280"} />
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: source === "watch" ? "#fff" : "#9CA3AF", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13 }}>Watch</div>
                  <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>
                    {watch.status === "connected" ? "Connected" : watch.status === "connecting" ? "Pairing..." : "Tap to pair"}
                  </div>
                </div>
              </button>
            </div>

            {/* Watch Connection Status */}
            {watch.status === "connected" && watch.device && (
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bluetooth size={12} color="#34D399" />
                  <div>
                    <div style={{ color: "#34D399", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 600 }}>{watch.device.name || "Smartwatch"}</div>
                    {watch.battery !== null && (
                      <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>Battery: {watch.battery}%</div>
                    )}
                  </div>
                </div>
                <button onClick={disconnectWatch}
                  style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#F87171", cursor: "pointer", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                  Disconnect
                </button>
              </div>
            )}

            {watch.status === "connecting" && (
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(200,150,12,0.08)", border: "1px solid rgba(200,150,12,0.2)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid transparent", borderTopColor: GOLD, animation: "swspin 0.7s linear infinite" }} />
                <span style={{ color: GOLD, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>Searching for devices...</span>
              </div>
            )}

            {watch.status === "error" && (
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", gap: 8 }}>
                <BluetoothOff size={12} color="#F87171" />
                <span style={{ color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>{watch.error || "Connection failed"}</span>
                <button onClick={connectWatch}
                  style={{ marginLeft: "auto", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#9CA3AF", cursor: "pointer", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                  Retry
                </button>
              </div>
            )}

            {!hasBluetooth && source === "phone" && (
              <div style={{ marginTop: 8, color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, textAlign: "center" }}>
                Web Bluetooth not supported in this browser
              </div>
            )}
          </div>

          {/* Club Selector */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>CLUB</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {CLUBS.map(c => (
                <button key={c} onClick={() => setClub(c)}
                  style={{ padding: "5px 10px", borderRadius: 5, border: `1px solid ${club === c ? GOLD : "rgba(255,255,255,0.1)"}`, background: club === c ? `${GOLD}18` : "rgba(255,255,255,0.03)", color: club === c ? GOLD : "#6B7280", cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", fontWeight: club === c ? 700 : 400, transition: "all 0.15s" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Main Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, minHeight: 260 }}>

            {phase === "idle" && (
              <>
                <div style={{ width: 140, height: 140, borderRadius: "50%", border: `3px solid ${source === "watch" ? "#34D399" : NAVY}`, background: source === "watch" ? "rgba(52,211,153,0.08)" : `${NAVY}30`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6, transition: "all 0.3s" }}>
                  {source === "watch" ? <Watch size={32} color="#34D399" /> : <Smartphone size={32} color="#9CA3AF" />}
                  <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, textAlign: "center", padding: "0 10px" }}>
                    {source === "watch" ? "Swing with watch on wrist" : "Hold phone in hand or pocket"}
                  </div>
                </div>
                <button onClick={startSwing}
                  style={{ padding: "15px 44px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 17, fontWeight: 700, letterSpacing: 2, fontFamily: "'Rajdhani',sans-serif", background: `linear-gradient(135deg, ${GREEN} 0%, #1B6B20 100%)`, color: "#fff", boxShadow: `0 4px 20px ${GREEN}50` }}>
                  START SWING
                </button>
                {!hasSensor && source === "phone" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>Motion sensors unavailable on this device</div>
                    <button onClick={runDemo}
                      style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${GOLD}50`, background: `${GOLD}0A`, color: GOLD, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      Try Demo Mode
                    </button>
                  </div>
                )}
              </>
            )}

            {phase === "countdown" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ width: 130, height: 130, borderRadius: "50%", border: `4px solid ${GOLD}`, background: `${GOLD}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 52, fontWeight: 700, color: GOLD, fontFamily: "'Rajdhani',sans-serif" }}>{countdown}</span>
                </div>
                <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontSize: 17, fontWeight: 600 }}>Get Ready...</div>
                <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  {source === "watch" ? <Watch size={12} /> : <Smartphone size={12} />}
                  {source === "watch" ? "Recording from watch" : "Recording from phone"}
                </div>
              </div>
            )}

            {phase === "recording" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ width: 130, height: 130, borderRadius: "50%", border: `4px solid ${GREEN}`, background: `${GREEN}10`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#EF4444", animation: "swpulse 0.6s ease-in-out infinite" }} />
                  <div style={{ position: "absolute", bottom: -6, background: "#EF4444", padding: "2px 7px", borderRadius: 3 }}>
                    <span style={{ color: "#fff", fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, fontWeight: 700 }}>REC</span>
                  </div>
                </div>
                <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontSize: 17, fontWeight: 600 }}>Swing Now!</div>
                <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, display: "flex", alignItems: "center", gap: 5 }}>
                  {source === "watch" ? <Watch size={11} color="#34D399" /> : <Smartphone size={11} color="#60A5FA" />}
                  <span>{source === "watch" ? "Watch" : "Phone"} sensors active</span>
                </div>
                <button onClick={endRecording}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#9CA3AF", cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>
                  Stop Manually
                </button>
              </div>
            )}

            {phase === "analyzing" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 50, height: 50, borderRadius: "50%", border: "3px solid transparent", borderTopColor: GOLD, animation: "swspin 0.7s linear infinite" }} />
                <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>Analyzing swing...</div>
              </div>
            )}

            {phase === "result" && result && (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Rating */}
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <span style={{ display: "inline-block", padding: "7px 22px", borderRadius: 18, border: `2px solid ${result.ratingColor}`, background: `${result.ratingColor}12`, color: result.ratingColor, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>
                    {result.rating}
                  </span>
                  <div style={{ marginTop: 6, color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    {result.source === "watch" ? <Watch size={10} /> : <Smartphone size={10} />}
                    Measured via {result.source === "watch" ? "smartwatch" : "phone sensors"}
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MetricCard icon={<Zap size={13} />} label="PEAK G-FORCE" value={`${result.peakG}g`} color="#93C5FD" />
                  <MetricCard icon={<Clock size={13} />} label="TEMPO" value={`${result.tempo}:1`} color={result.tempo >= 2.5 && result.tempo <= 3.5 ? "#4CAF50" : GOLD} />
                  <MetricCard icon={<TrendingUp size={13} />} label="BACKSWING" value={`${result.backswingMs}ms`} color="#9CA3AF" />
                  <MetricCard icon={<TrendingUp size={13} />} label="DOWNSWING" value={`${result.downswingMs}ms`} color="#9CA3AF" />
                </div>

                {/* Smoothness */}
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1 }}>SMOOTHNESS</span>
                    <span style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 16 }}>{result.smoothness}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${result.smoothness}%`, borderRadius: 3, background: result.smoothness >= 70 ? GREEN : result.smoothness >= 50 ? GOLD : "#F87171", transition: "width 0.6s ease-out" }} />
                  </div>
                </div>

                {/* Tip */}
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>TIP</div>
                  <div style={{ color: "#D1D5DB", fontFamily: "'Rajdhani',sans-serif", fontSize: 13, lineHeight: 1.5 }}>
                    {result.tempo < 2.5 ? "Try slowing your backswing. A 3:1 ratio is the tour average for smooth tempo." :
                      result.tempo > 3.5 ? "Your backswing is slow relative to downswing. Focus on a fluid transition at the top." :
                        result.smoothness < 60 ? "Focus on a smooth takeaway and avoid jerky movements at the transition." :
                          "Great swing mechanics! Repeat this feel for consistency."}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                  <button onClick={reset}
                    style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${NAVY}`, background: `${NAVY}40`, color: "#93C5FD", cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <RotateCcw size={14} /> AGAIN
                  </button>
                  <button onClick={() => setShowHist(true)}
                    style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${GOLD}40`, background: `${GOLD}0A`, color: GOLD, cursor: "pointer", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: 1 }}>
                    HISTORY
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* History */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>No swings recorded yet</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <MiniStat label="Avg G" value={`${(history.reduce((s, h) => s + h.peak_g, 0) / history.length).toFixed(1)}g`} />
                <MiniStat label="Avg Tempo" value={`${(history.reduce((s, h) => s + h.tempo, 0) / history.length).toFixed(1)}:1`} />
                <MiniStat label="Avg Smooth" value={`${Math.round(history.reduce((s, h) => s + h.smoothness, 0) / history.length)}%`} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1 }}>
                {history.map(sw => (
                  <div key={sw.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ background: `${GOLD}18`, color: GOLD, padding: "1px 5px", borderRadius: 3, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 700 }}>{sw.club}</span>
                        {sw.source === "watch" && <Watch size={10} color="#34D399" />}
                        {sw.source === "phone" && <Smartphone size={10} color="#60A5FA" />}
                        <span style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9 }}>
                          {new Date(sw.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ marginTop: 4, display: "flex", gap: 10 }}>
                        <span style={{ color: "#93C5FD", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>{sw.peak_g}g</span>
                        <span style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>{sw.tempo}:1</span>
                        <span style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>{sw.smoothness}%</span>
                      </div>
                    </div>
                    <span style={{ color: sw.rating === "Excellent" ? "#4CAF50" : sw.rating === "Good" ? "#93C5FD" : GOLD, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 12 }}>{sw.rating}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes swpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.08)} }
        @keyframes swspin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6B7280", marginBottom: 4 }}>
        {icon}
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ color, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 24 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 6px", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
      <div style={{ color: "#6B7280", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{value}</div>
    </div>
  );
}

export default SwingAnalyzerScreen;
