import { useEffect, useRef, useState } from "react";
import { Glasses, Mic, Radio, Send, Sparkles, Volume2, Wind, Compass, Target, Power } from "lucide-react";
import {
  startGlassesSession, endGlassesSession, recordAiQuery, fetchRecentAiQueries,
} from "./lib/supabase";
import type { GlassesSession, AiQueryRow } from "./lib/supabase";

const NAVY = "#1B3A6B", GOLD = "#C8960C";

type Hole = {
  number: number;
  par: number;
  yards: number;
  pin: { x: number; y: number };
};

type Props = {
  roundId: string | null;
  hole: Hole;
  windMph: number;
  windDir: string;
  recommendedClub?: { name: string; abbr: string; avg: number };
  distanceToPin: number;
};

const QUICK_PROMPTS: { label: string; intent: string; prompt: (h: Hole, d: number) => string }[] = [
  { label: "Read the green",      intent: "read_green", prompt: (h) => `Read the green on hole ${h.number}.` },
  { label: "Best club for shot",  intent: "club",       prompt: (_, d) => `What club should I hit from ${d} yards?` },
  { label: "Wind adjustment",     intent: "wind",       prompt: (_, d) => `How much should I adjust for wind from ${d} yards?` },
  { label: "Aim point",           intent: "general",    prompt: (h) => `Where should I aim on hole ${h.number}?` },
  { label: "Pin distance",        intent: "distance",   prompt: (_, d) => `Confirm distance to pin (${d} yards).` },
];

function craftResponse(intent: string, hole: Hole, distance: number, windMph: number, windDir: string, club?: Props["recommendedClub"]): string {
  switch (intent) {
    case "club":
      return club
        ? `From ${distance}y on hole ${hole.number}, a ${club.name} (${club.abbr}) at ~${club.avg}y carry should land you in good position. Trust your full swing.`
        : `${distance} yards out. Pick the club you carry that distance with a smooth tempo.`;
    case "wind":
      if (windMph < 5) return `Wind is light at ${windMph} mph ${windDir}. Negligible effect — play your normal yardage.`;
      if (windMph < 12) return `Moderate ${windMph} mph ${windDir}. Add or subtract roughly half a club depending on direction.`;
      return `Strong ${windMph} mph ${windDir}. Take an extra club, swing easy, and keep the ball flight low.`;
    case "read_green":
      return `Green slopes subtly back-to-front. From your line, expect about a half-cup break to the low side. Speed beats line — die it at the cup.`;
    case "distance":
      return `Confirmed: ${distance} yards to the center of the green. Pin is playing front-middle today.`;
    default:
      return `On hole ${hole.number}, par ${hole.par}, ${hole.yards}y. Aim center fairway, leave a full wedge in. ${windMph} mph ${windDir} is in play — adjust accordingly.`;
  }
}

export default function GlassesPanel({ roundId, hole, windMph, windDir, recommendedClub, distanceToPin }: Props) {
  const [session, setSession] = useState<GlassesSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState<AiQueryRow[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [hudPulse, setHudPulse] = useState(0);
  const pulseRef = useRef<number | null>(null);

  useEffect(() => {
    fetchRecentAiQueries(roundId, 10).then(setHistory);
  }, [roundId]);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      setHudPulse((p) => (p + 1) % 100);
      pulseRef.current = window.setTimeout(tick, 80);
    };
    tick();
    return () => { if (pulseRef.current) clearTimeout(pulseRef.current); };
  }, [session]);

  const handlePair = async () => {
    setConnecting(true);
    await new Promise((r) => setTimeout(r, 900));
    const s = await startGlassesSession({ round_id: roundId, model: "Ray-Ban Meta (Wayfarer)" });
    setSession(s);
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    if (!session) return;
    await endGlassesSession(session.id);
    setSession(null);
  };

  const submitQuery = async (prompt: string, intent: string) => {
    if (!prompt.trim()) return;
    setThinking(true);
    await new Promise((r) => setTimeout(r, 600));
    const response = craftResponse(intent, hole, distanceToPin, windMph, windDir, recommendedClub);
    const row = await recordAiQuery({ round_id: roundId, hole: hole.number, prompt, response, intent });
    if (row) setHistory((h) => [row, ...h].slice(0, 10));
    setThinking(false);
    setInput("");
    if ("speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance(response);
        u.rate = 1.05; u.pitch = 1.0;
        window.speechSynthesis.speak(u);
      } catch { /* speech unavailable */ }
    }
  };

  const toggleListen = () => {
    setListening((v) => !v);
    if (!listening) {
      setTimeout(() => {
        setListening(false);
        submitQuery("Hey Meta, what club should I hit?", "club");
      }, 1400);
    }
  };

  const isPaired = !!session;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pairing card */}
      <div style={{
        background: isPaired
          ? `linear-gradient(135deg, ${NAVY}66, rgba(46,125,50,0.25))`
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${isPaired ? "#34D399" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12, padding: 14,
        transition: "background 0.3s, border-color 0.3s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10,
            background: isPaired ? "#34D39922" : "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${isPaired ? "#34D399" : "rgba(255,255,255,0.1)"}`,
          }}>
            <Glasses size={22} color={isPaired ? "#34D399" : "#9CA3AF"} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>
              {isPaired ? "Ray-Ban Meta" : "Smart Glasses"}
            </div>
            <div style={{
              color: isPaired ? "#34D399" : "#6B7280",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1, marginTop: 2,
            }}>
              {isPaired ? "STREAMING · META AI READY" : "NOT PAIRED"}
            </div>
          </div>
          {!isPaired ? (
            <button onClick={handlePair} disabled={connecting}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: `linear-gradient(135deg, ${NAVY}, #0F2444)`,
                color: "#fff", fontWeight: 600, fontFamily: "'Rajdhani',sans-serif",
                fontSize: 13, letterSpacing: 1, cursor: connecting ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: connecting ? 0.7 : 1,
              }}>
              <Radio size={14} />{connecting ? "PAIRING..." : "PAIR"}
            </button>
          ) : (
            <button onClick={handleDisconnect}
              style={{
                padding: "8px 12px", borderRadius: 8,
                border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)",
                color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: 1,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
              <Power size={12} />END
            </button>
          )}
        </div>
      </div>

      {/* AR HUD preview */}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden",
        border: `1px solid ${isPaired ? GOLD + "60" : "rgba(255,255,255,0.08)"}`,
        background: "#000", aspectRatio: "16/9",
      }}>
        {/* Faux camera scene */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #5A8FBF 0%, #6FA75F 55%, #3D6B26 100%)",
        }}>
          <div style={{ position: "absolute", left: "50%", top: "55%", transform: "translateX(-50%)",
            width: 4, height: 80, background: "#fff" }}/>
          <div style={{ position: "absolute", left: "calc(50% + 4px)", top: "55%",
            width: 0, height: 0,
            borderTop: "8px solid transparent", borderBottom: "8px solid transparent",
            borderLeft: "14px solid #EF4444",
          }}/>
          <div style={{ position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(0,0,0,0.55) 100%)" }}/>
        </div>

        {/* HUD overlay */}
        {isPaired && (
          <>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {/* Top bar */}
              <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex",
                justifyContent: "space-between", alignItems: "center",
                fontFamily: "'IBM Plex Mono',monospace", color: GOLD, fontSize: 10, letterSpacing: 1 }}>
                <span style={{ background: "rgba(0,0,0,0.55)", padding: "3px 7px", borderRadius: 3 }}>
                  HOLE {hole.number} · PAR {hole.par}
                </span>
                <span style={{ background: "rgba(0,0,0,0.55)", padding: "3px 7px", borderRadius: 3,
                  color: "#34D399", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%",
                    background: hudPulse % 20 < 10 ? "#34D399" : "#34D39955" }}/>
                  AR LIVE
                </span>
              </div>

              {/* Center reticle */}
              <div style={{ position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%,-50%)" }}>
                <div style={{ width: 60, height: 60, border: `1.5px solid ${GOLD}`,
                  borderRadius: "50%", boxShadow: `0 0 18px ${GOLD}55, inset 0 0 18px ${GOLD}33` }}/>
                <div style={{ position: "absolute", top: "50%", left: -16, width: 12, height: 1.5,
                  background: GOLD }}/>
                <div style={{ position: "absolute", top: "50%", right: -16, width: 12, height: 1.5,
                  background: GOLD }}/>
                <div style={{ position: "absolute", left: "50%", top: -16, width: 1.5, height: 12,
                  background: GOLD }}/>
                <div style={{ position: "absolute", left: "50%", bottom: -16, width: 1.5, height: 12,
                  background: GOLD }}/>
              </div>

              {/* Distance callout */}
              <div style={{ position: "absolute", left: "50%", top: "calc(50% + 42px)",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.65)", border: `1px solid ${GOLD}`, borderRadius: 6,
                padding: "5px 10px", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                color: "#fff", fontSize: 16, letterSpacing: 1,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Target size={13} color={GOLD} />
                {distanceToPin}<span style={{ fontSize: 10, color: GOLD, marginLeft: 2 }}>YDS</span>
              </div>

              {/* Bottom HUD strip */}
              <div style={{ position: "absolute", left: 8, right: 8, bottom: 8,
                display: "flex", justifyContent: "space-between", gap: 6,
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>
                <div style={{ background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 4,
                  display: "flex", alignItems: "center", gap: 5, color: "#93C5FD" }}>
                  <Wind size={11} />{windMph}MPH {windDir}
                </div>
                <div style={{ background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 4,
                  color: GOLD, fontWeight: 700 }}>
                  {recommendedClub ? `CLUB · ${recommendedClub.abbr}` : "CLUB · —"}
                </div>
                <div style={{ background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 4,
                  display: "flex", alignItems: "center", gap: 5, color: "#fff" }}>
                  <Compass size={11} />N
                </div>
              </div>
            </div>
          </>
        )}

        {!isPaired && (
          <div style={{ position: "absolute", inset: 0,
            background: "rgba(5,14,26,0.82)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 20 }}>
            <Glasses size={32} color="#6B7280" />
            <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace",
              fontSize: 11, letterSpacing: 1.5 }}>
              PAIR GLASSES TO ENABLE AR HUD
            </div>
            <div style={{ color: "#6B7280", fontSize: 11, maxWidth: 280 }}>
              Stream live distance, club recommendation, wind, and Meta AI caddy responses to the lenses.
            </div>
          </div>
        )}
      </div>

      {/* Meta AI caddy */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={14} color={GOLD} />
          <div style={{ color: GOLD, fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 10, letterSpacing: 1.5 }}>META AI CADDY</div>
          <div style={{ flex: 1 }}/>
          <button onClick={toggleListen} disabled={!isPaired}
            style={{
              padding: "5px 9px", borderRadius: 6,
              border: `1px solid ${listening ? "#EF4444" : "rgba(255,255,255,0.15)"}`,
              background: listening ? "rgba(239,68,68,0.15)" : "transparent",
              color: listening ? "#F87171" : "#9CA3AF",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 1,
              display: "flex", alignItems: "center", gap: 5,
              cursor: isPaired ? "pointer" : "not-allowed", opacity: isPaired ? 1 : 0.5,
            }}>
            <Mic size={11} />{listening ? "LISTENING..." : "HEY META"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {QUICK_PROMPTS.map((q) => (
            <button key={q.label} disabled={!isPaired || thinking}
              onClick={() => submitQuery(q.prompt(hole, distanceToPin), q.intent)}
              style={{
                padding: "6px 10px", borderRadius: 999,
                border: `1px solid ${isPaired ? GOLD + "55" : "rgba(255,255,255,0.1)"}`,
                background: isPaired ? `${GOLD}15` : "rgba(255,255,255,0.04)",
                color: isPaired ? GOLD : "#6B7280",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 0.5,
                cursor: isPaired && !thinking ? "pointer" : "not-allowed",
              }}>
              {q.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitQuery(input, "general"); }}
            placeholder={isPaired ? "Ask Meta AI…" : "Pair glasses to chat"}
            disabled={!isPaired || thinking}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 14, outline: "none",
            }}
          />
          <button onClick={() => submitQuery(input, "general")}
            disabled={!isPaired || thinking || !input.trim()}
            style={{
              padding: "0 14px", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${GOLD}, #A07A0A)`,
              color: "#000", cursor: input.trim() && isPaired ? "pointer" : "not-allowed",
              opacity: input.trim() && isPaired ? 1 : 0.5,
              display: "flex", alignItems: "center", gap: 5, fontWeight: 700,
            }}>
            <Send size={14} />
          </button>
        </div>

        {thinking && (
          <div style={{ color: GOLD, fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 11, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={11} />META AI THINKING…
          </div>
        )}
      </div>

      {/* Conversation log */}
      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 10, letterSpacing: 1.5 }}>RECENT</div>
          {history.slice(0, 5).map((q) => (
            <div key={q.id} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10, padding: "10px 12px",
            }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{q.prompt}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 5,
                display: "flex", alignItems: "flex-start", gap: 6 }}>
                <Volume2 size={12} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{q.response}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
