import { useEffect, useRef, useCallback, useReducer } from "react";

const HUB_URL = "ws://vetfield-hub.local:8765";
const PING_INTERVAL = 5000;
const INITIAL_BACKOFF = 2000;
const MAX_BACKOFF = 30000;

export type HubStatus = "connecting" | "live" | "reconnecting" | "offline";

export interface ShotDetectedPayload {
  ballId: string;        // UWB tag ID from the hub (e.g. "ball1", "ball2")
  player: string;        // "p1" | "p2" — app maps ballId to player
  hole: number;
  distance: number;      // yards
  x: number;             // normalized 0-1
  y: number;             // normalized 0-1
  gps?: { lat: number; lng: number };
  ts: number;
}

export interface BallPositionPayload {
  ballId: string;
  x: number;             // normalized 0-1
  y: number;             // normalized 0-1
  ts: number;
}

interface HubState {
  status: HubStatus;
  latency: number | null;
  lastShot: ShotDetectedPayload | null;
  ballPositions: Record<string, BallPositionPayload>;
}

type HubAction =
  | { type: "CONNECTING" }
  | { type: "LIVE" }
  | { type: "RECONNECTING" }
  | { type: "OFFLINE" }
  | { type: "LATENCY"; ms: number }
  | { type: "SHOT"; shot: ShotDetectedPayload }
  | { type: "BALL_POS"; pos: BallPositionPayload };

function hubReducer(s: HubState, a: HubAction): HubState {
  switch (a.type) {
    case "CONNECTING":   return { ...s, status: "connecting" };
    case "LIVE":         return { ...s, status: "live" };
    case "RECONNECTING": return { ...s, status: "reconnecting" };
    case "OFFLINE":      return { ...s, status: "offline" };
    case "LATENCY":      return { ...s, latency: a.ms };
    case "SHOT":         return { ...s, lastShot: a.shot };
    case "BALL_POS":     return { ...s, ballPositions: { ...s.ballPositions, [a.pos.ballId]: a.pos } };
    default:             return s;
  }
}

interface UseHubSocketOptions {
  activePlayer: string;
  currentHole: number;
  onShot: (shot: ShotDetectedPayload) => void;
}

export function useHubSocket({ activePlayer, currentHole, onShot }: UseHubSocketOptions) {
  const [hubState, dispatch] = useReducer(hubReducer, {
    status: "connecting",
    latency: null,
    lastShot: null,
    ballPositions: {},
  });

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTsRef = useRef<number>(0);
  const unmountedRef = useRef(false);
  // keep latest values without re-triggering the connect effect
  const activePlayerRef = useRef(activePlayer);
  const currentHoleRef = useRef(currentHole);
  const onShotRef = useRef(onShot);

  useEffect(() => { activePlayerRef.current = activePlayer; }, [activePlayer]);
  useEffect(() => { currentHoleRef.current = currentHole; }, [currentHole]);
  useEffect(() => { onShotRef.current = onShot; }, [onShot]);

  const clearTimers = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    pingTimerRef.current = null;
    reconnectTimerRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    dispatch({ type: "CONNECTING" });

    const ws = new WebSocket(HUB_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      backoffRef.current = INITIAL_BACKOFF;
      dispatch({ type: "LIVE" });

      // start ping loop
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          pingTsRef.current = Date.now();
          ws.send(JSON.stringify({ type: "PING", ts: pingTsRef.current }));
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (evt) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(evt.data as string); }
      catch { return; }

      if (msg.type === "PONG" && typeof msg.ts === "number") {
        dispatch({ type: "LATENCY", ms: Date.now() - msg.ts });
        return;
      }

      if (msg.type === "SHOT_DETECTED") {
        const raw = msg.payload as Partial<ShotDetectedPayload>;
        const shot: ShotDetectedPayload = {
          ballId: raw.ballId ?? "ball1",
          player: raw.player ?? activePlayerRef.current,
          hole:   raw.hole   ?? currentHoleRef.current,
          distance: raw.distance ?? 0,
          x: raw.x ?? 0.5,
          y: raw.y ?? 0.5,
          gps: raw.gps,
          ts: raw.ts ?? Date.now(),
        };
        dispatch({ type: "SHOT", shot });
        onShotRef.current(shot);
      }

      if (msg.type === "BALL_POSITION") {
        const raw = msg.payload as Partial<BallPositionPayload>;
        if (raw.ballId && typeof raw.x === "number" && typeof raw.y === "number") {
          dispatch({ type: "BALL_POS", pos: { ballId: raw.ballId, x: raw.x, y: raw.y, ts: raw.ts ?? Date.now() } });
        }
      }
    };

    ws.onerror = () => { /* onclose will fire next */ };

    ws.onclose = () => {
      clearTimers();
      if (unmountedRef.current) return;
      dispatch({ type: "RECONNECTING" });
      reconnectTimerRef.current = setTimeout(() => {
        if (unmountedRef.current) return;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        connect();
      }, backoffRef.current);
    };
  }, [clearTimers]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect, clearTimers]);

  // Expose a manual disconnect / reconnect for testing
  const reconnect = useCallback(() => {
    clearTimers();
    wsRef.current?.close();
    backoffRef.current = INITIAL_BACKOFF;
    connect();
  }, [clearTimers, connect]);

  return { ...hubState, reconnect };
}
