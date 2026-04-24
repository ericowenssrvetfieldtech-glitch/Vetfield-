import { useEffect, useRef, useState } from "react";
import type { HubStatus } from "./useHubSocket";

const GOLD = "#C8960C";

interface HubStatusProps {
  status: HubStatus;
  latency: number | null;
  shotFlash: boolean;
}

export function HubStatusDot({ status, latency, shotFlash }: HubStatusProps) {
  const [flash, setFlash] = useState(false);
  const prevShot = useRef(shotFlash);

  useEffect(() => {
    if (shotFlash && !prevShot.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      prevShot.current = true;
      return () => clearTimeout(t);
    }
    if (!shotFlash) prevShot.current = false;
  }, [shotFlash]);

  const dotColor =
    flash        ? GOLD :
    status === "live"         ? "#22C55E" :
    status === "reconnecting" ? "#FBBF24" :
    status === "connecting"   ? "#FBBF24" :
                                "#EF4444";

  const label =
    flash                     ? "SHOT !" :
    status === "live"         ? "LIVE" :
    status === "reconnecting" ? "RECONNECTING…" :
    status === "connecting"   ? "CONNECTING…" :
                                "OFFLINE";

  const isPulsing = status === "live" || status === "reconnecting" || status === "connecting";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 5,
      background: "rgba(0,0,0,0.35)",
      border: `1px solid ${dotColor}40`,
      transition: "border-color 0.3s",
    }}>
      {/* Dot */}
      <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
        {isPulsing && (
          <div style={{
            position: "absolute", inset: -3,
            borderRadius: "50%",
            background: dotColor,
            opacity: 0.3,
            animation: "hub-pulse 1.4s ease-in-out infinite",
          }}/>
        )}
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: dotColor,
          transition: "background 0.3s",
          boxShadow: `0 0 6px ${dotColor}`,
        }}/>
      </div>

      {/* Label */}
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        fontWeight: flash ? 700 : 500,
        letterSpacing: 1,
        color: flash ? GOLD : dotColor,
        transition: "color 0.3s",
        whiteSpace: "nowrap",
      }}>{label}</span>

      {/* Latency badge — only when live and no flash */}
      {status === "live" && !flash && latency !== null && (
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: latency < 50 ? "#22C55E" : latency < 150 ? "#FBBF24" : "#EF4444",
          marginLeft: 2,
        }}>{latency}ms</span>
      )}

      <style>{`
        @keyframes hub-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50%       { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Bottom status bar shown inside RoundScreen ────────────────────────────────
export function HubStatusBar({ status }: { status: HubStatus }) {
  const isLive = status === "live";
  const bg    = isLive ? "rgba(34,197,94,0.12)"  : "rgba(239,68,68,0.12)";
  const border= isLive ? "rgba(34,197,94,0.25)"  : "rgba(239,68,68,0.25)";
  const color = isLive ? "#22C55E" : "#EF4444";
  const text  = isLive
    ? "LIVE — Shots auto-detected"
    : status === "connecting" || status === "reconnecting"
      ? "CONNECTING TO HUB…  —  Tap map to record manually"
      : "HUB OFFLINE — Tap map to record manually";

  return (
    <div style={{
      background: bg,
      borderTop: `1px solid ${border}`,
      padding: "7px 14px",
      textAlign: "center",
      color,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10,
      letterSpacing: 1,
      flexShrink: 0,
      transition: "all 0.4s",
    }}>{text}</div>
  );
}
