import { useState, useRef, useEffect, useCallback } from "react";
import { createCourse } from "./lib/supabase";
import type { Hole, HolePoint, GpsPoint, Course } from "./lib/supabase";

const NAVY = "#1B3A6B", GREEN = "#2E7D32", GOLD = "#C8960C";

type Mode = "tee" | "pin" | "fairway" | "green";

interface DraftHole {
  par: number;
  yards: number;
  tee: HolePoint | null;
  pin: HolePoint | null;
  fairway: HolePoint[];
  green: HolePoint[];
}

const emptyHole = (): DraftHole => ({
  par: 4, yards: 380, tee: null, pin: null, fairway: [], green: [],
});

// Convert normalized canvas coords (0-1) to GPS around a center point.
// A golf hole spans roughly 400m N-S and 300m E-W.
const COURSE_SPAN_LAT = 0.0036; // ~400m in latitude degrees
const COURSE_SPAN_LNG = 0.0040; // ~300m in longitude degrees (varies by latitude)

function canvasToGps(pt: HolePoint, centerLat: number, centerLng: number): GpsPoint {
  return {
    lat: centerLat + (0.5 - pt.y) * COURSE_SPAN_LAT,
    lng: centerLng + (pt.x - 0.5) * COURSE_SPAN_LNG,
  };
}

const isComplete = (h: DraftHole) =>
  !!h.tee && !!h.pin && h.fairway.length >= 3 && h.green.length >= 3;

interface Props {
  onCancel: () => void;
  onSaved: (course: Course) => void;
}

export default function AddCourseScreen({ onCancel, onSaved }: Props) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [holes, setHoles] = useState<DraftHole[]>([emptyHole()]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("fairway");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hole = holes[active];

  const updateHole = useCallback((patch: Partial<DraftHole>) => {
    setHoles(prev => prev.map((h, i) => i === active ? { ...h, ...patch } : h));
  }, [active]);

  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height;

    ctx.fillStyle = "#1A3D0A"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const p = (pt: HolePoint) => ({ x: pt.x * W, y: pt.y * H });

    if (hole.fairway.length) {
      ctx.fillStyle = "#2D5A1B"; ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      hole.fairway.forEach((pt, i) => { const cp = p(pt); i === 0 ? ctx.moveTo(cp.x, cp.y) : ctx.lineTo(cp.x, cp.y); });
      if (hole.fairway.length >= 3) ctx.closePath();
      ctx.fill();
      if (hole.fairway.length >= 3) ctx.stroke();
      hole.fairway.forEach((pt, i) => {
        const cp = p(pt);
        ctx.fillStyle = mode === "fairway" ? GOLD : "#fff";
        ctx.beginPath(); ctx.arc(cp.x, cp.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#000"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
        ctx.fillText(String(i + 1), cp.x, cp.y + 3); ctx.textAlign = "left";
      });
    }

    if (hole.green.length) {
      ctx.fillStyle = "#388A1E"; ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      hole.green.forEach((pt, i) => { const cp = p(pt); i === 0 ? ctx.moveTo(cp.x, cp.y) : ctx.lineTo(cp.x, cp.y); });
      if (hole.green.length >= 3) ctx.closePath();
      ctx.fill();
      if (hole.green.length >= 3) ctx.stroke();
      hole.green.forEach(pt => {
        const cp = p(pt);
        ctx.fillStyle = mode === "green" ? GOLD : "#86EFAC";
        ctx.beginPath(); ctx.arc(cp.x, cp.y, 3, 0, Math.PI * 2); ctx.fill();
      });
    }

    if (hole.tee) {
      const t = p(hole.tee);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NAVY; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
      ctx.fillText("T", t.x, t.y + 3); ctx.textAlign = "left";
    }

    if (hole.pin) {
      const pin = p(hole.pin);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pin.x, pin.y + 14); ctx.lineTo(pin.x, pin.y - 16); ctx.stroke();
      ctx.fillStyle = "#EF4444";
      ctx.beginPath(); ctx.moveTo(pin.x, pin.y - 16); ctx.lineTo(pin.x + 11, pin.y - 11); ctx.lineTo(pin.x, pin.y - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pin.x, pin.y, 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(8, 8, 130, 22);
    ctx.fillStyle = GOLD; ctx.font = "bold 10px 'IBM Plex Mono',monospace";
    ctx.fillText(`HOLE ${active + 1} · ${mode.toUpperCase()}`, 14, 23);
  }, [hole, mode, active]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const pt = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };

    if (mode === "tee") updateHole({ tee: pt });
    else if (mode === "pin") updateHole({ pin: pt });
    else if (mode === "fairway") updateHole({ fairway: [...hole.fairway, pt] });
    else if (mode === "green") updateHole({ green: [...hole.green, pt] });
  }, [mode, hole, updateHole]);

  const undoLast = () => {
    if (mode === "fairway" && hole.fairway.length) updateHole({ fairway: hole.fairway.slice(0, -1) });
    else if (mode === "green" && hole.green.length) updateHole({ green: hole.green.slice(0, -1) });
    else if (mode === "tee") updateHole({ tee: null });
    else if (mode === "pin") updateHole({ pin: null });
  };

  const canSave =
    name.trim().length > 0 &&
    holes.length > 0 &&
    holes.every(isComplete);

  const handleSave = async () => {
    setError(null);
    if (!canSave) {
      setError("Each hole needs a tee, pin, fairway (3+ pts), and green (3+ pts).");
      return;
    }
    setSaving(true);

    // Use a default center for GPS mapping (Boulder, CO area as fallback)
    const centerLat = 39.98;
    const centerLng = -105.25;

    const payload: Hole[] = holes.map((h, i) => ({
      number: i + 1,
      par: h.par,
      yards: h.yards,
      tee: h.tee!,
      pin: h.pin!,
      fairway: h.fairway,
      green: h.green,
      gps_tee: canvasToGps(h.tee!, centerLat, centerLng),
      gps_pin: canvasToGps(h.pin!, centerLat, centerLng),
      gps_fairway: h.fairway.map(pt => canvasToGps(pt, centerLat, centerLng)),
      gps_green: h.green.map(pt => canvasToGps(pt, centerLat, centerLng)),
    }));
    const created = await createCourse({
      name: name.trim(),
      location: location.trim(),
      holes: payload,
    });
    setSaving(false);
    if (!created) {
      setError("Could not save course. Check your connection and try again.");
      return;
    }
    onSaved(created);
  };

  const MODES: { id: Mode; label: string; hint: string }[] = [
    { id: "tee",     label: "Tee",     hint: "click to place" },
    { id: "fairway", label: "Fairway", hint: "click to add points" },
    { id: "green",   label: "Green",   hint: "click to add points" },
    { id: "pin",     label: "Pin",     hint: "click to place" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)",
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onCancel}
          style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff", padding: "8px 14px", borderRadius: 6,
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, cursor: "pointer",
          }}>
          ← Back
        </button>
        <div style={{ color: GOLD, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 2 }}>
          ADD COURSE
        </div>
        <button onClick={handleSave} disabled={!canSave || saving}
          style={{
            background: canSave ? `linear-gradient(135deg,${GREEN},#1B6B20)` : "rgba(255,255,255,0.05)",
            border: "none", color: "#fff", padding: "8px 16px", borderRadius: 6,
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1,
            cursor: canSave && !saving ? "pointer" : "not-allowed",
            opacity: saving ? 0.7 : 1,
          }}>
          {saving ? "SAVING..." : "SAVE COURSE"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Course name (e.g. Riverside Muni)"
          style={{
            padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14,
            fontFamily: "'Rajdhani',sans-serif", outline: "none",
          }}/>
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (e.g. Kingsville, TX)"
          style={{
            padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14,
            fontFamily: "'Rajdhani',sans-serif", outline: "none",
          }}/>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {holes.map((h, i) => {
          const ok = isComplete(h);
          const sel = i === active;
          return (
            <button key={i} onClick={() => setActive(i)}
              style={{
                padding: "6px 11px", borderRadius: 5,
                border: sel ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.12)",
                background: sel ? `${NAVY}77` : "rgba(0,0,0,0.3)",
                color: sel ? "#fff" : "#9CA3AF",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, cursor: "pointer",
                display: "flex", gap: 6, alignItems: "center",
              }}>
              <span style={{ fontWeight: 700 }}>H{i + 1}</span>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: ok ? "#34D399" : "#F87171",
              }}/>
            </button>
          );
        })}
        <button onClick={() => { setHoles(prev => [...prev, emptyHole()]); setActive(holes.length); setMode("fairway"); }}
          style={{
            padding: "6px 11px", borderRadius: 5,
            border: `1px dashed ${GOLD}80`, background: "transparent",
            color: GOLD, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, cursor: "pointer",
          }}>
          + Hole
        </button>
        {holes.length > 1 && (
          <button onClick={() => {
            setHoles(prev => prev.filter((_, i) => i !== active));
            setActive(a => Math.max(0, a - 1));
          }}
            style={{
              padding: "6px 11px", borderRadius: 5,
              border: "1px solid rgba(248,113,113,0.4)", background: "transparent",
              color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, cursor: "pointer",
            }}>
            Remove H{active + 1}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 12 }}>
        <div>
          <canvas ref={canvasRef} width={640} height={480} onClick={handleClick}
            style={{
              width: "100%", height: 480, borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: "crosshair", display: "block",
            }}/>
          <div style={{
            marginTop: 6, color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 10, letterSpacing: 1,
          }}>
            CLICK MAP TO PLACE / ADD POINTS · POLYGONS NEED 3+ POINTS
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: "#93C5FD", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
              DRAW MODE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  style={{
                    padding: "8px 6px", borderRadius: 5,
                    border: mode === m.id ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.1)",
                    background: mode === m.id ? `${NAVY}77` : "rgba(0,0,0,0.25)",
                    color: mode === m.id ? "#fff" : "#9CA3AF",
                    fontFamily: "'Rajdhani',sans-serif", fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={undoLast}
              style={{
                marginTop: 8, width: "100%", padding: "7px",
                borderRadius: 5, border: "1px solid rgba(248,113,113,0.4)",
                background: "rgba(239,68,68,0.1)", color: "#F87171",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, cursor: "pointer",
              }}>
              Undo last point
            </button>
          </div>

          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: "#93C5FD", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
              HOLE {active + 1}
            </div>
            <label style={{ display: "block", color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, marginBottom: 3 }}>
              PAR
            </label>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[3, 4, 5].map(p => (
                <button key={p} onClick={() => updateHole({ par: p })}
                  style={{
                    flex: 1, padding: "6px",
                    borderRadius: 4, border: "none",
                    background: hole.par === p ? GREEN : "rgba(255,255,255,0.08)",
                    color: "#fff", fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                    fontSize: 12, cursor: "pointer",
                  }}>
                  {p}
                </button>
              ))}
            </div>
            <label style={{ display: "block", color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, marginBottom: 3 }}>
              YARDS
            </label>
            <input type="number" value={hole.yards} min={50} max={700}
              onChange={e => updateHole({ yards: Math.max(50, Math.min(700, +e.target.value || 0)) })}
              style={{
                width: "100%", padding: "7px 9px", borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)",
                color: "#fff", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, outline: "none",
              }}/>
          </div>

          <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "10px 12px",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#9CA3AF", lineHeight: 1.6 }}>
            <div>Tee: {hole.tee ? "OK" : "—"}</div>
            <div>Pin: {hole.pin ? "OK" : "—"}</div>
            <div>Fairway pts: {hole.fairway.length}</div>
            <div>Green pts: {hole.green.length}</div>
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(248,113,113,0.4)",
              borderRadius: 6, padding: "8px 10px", color: "#FCA5A5",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
