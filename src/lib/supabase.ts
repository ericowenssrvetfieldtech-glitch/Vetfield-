import { createClient } from "@supabase/supabase-js";

const url     = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Courses ───────────────────────────────────────────────────────────────────
export interface HolePoint { x: number; y: number }
export interface HoleHazard { type: "water" | "bunker" | "trees"; pts: HolePoint[] }
export interface Hole {
  number: number;
  par: number;
  yards: number;
  tee: HolePoint;
  pin: HolePoint;
  fairway: HolePoint[];
  green: HolePoint[];
  hazards?: HoleHazard[];
}
export interface Course {
  id: string;
  slug: string;
  name: string;
  location: string;
  total_holes: number;
  holes: Hole[];
  source: string;
}

export async function createCourse(args: {
  name: string;
  location: string;
  holes: Hole[];
}): Promise<Course | null> {
  const device_id = getDeviceId();
  const slug =
    args.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) +
    "-" +
    Math.random().toString(36).slice(2, 6);

  const { data, error } = await supabase
    .from("courses")
    .insert({
      slug,
      name: args.name,
      location: args.location,
      total_holes: args.holes.length,
      holes: args.holes,
      source: "user",
      device_id,
    })
    .select("id, slug, name, location, total_holes, holes, source")
    .maybeSingle();

  if (error) {
    console.warn("[supabase] createCourse failed:", error.message);
    return null;
  }
  return data as Course | null;
}

export async function fetchCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, name, location, total_holes, holes, source")
    .order("name", { ascending: true });

  if (error) {
    console.warn("[supabase] fetchCourses failed:", error.message);
    return [];
  }
  return (data || []) as Course[];
}

// ── Rounds ────────────────────────────────────────────────────────────────────
export type RoundStatus = "active" | "completed";

export interface RoundRow {
  id: string;
  device_id: string;
  course_slug: string;
  course_name: string;
  player1_name: string;
  player2_name: string;
  player3_name: string;
  player4_name: string;
  state: Record<string, unknown>;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  status: RoundStatus;
}

const DEVICE_ID_KEY = "vetfield.deviceId";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function createRound(args: {
  course: Course;
  player1_name: string;
  player2_name: string;
  player3_name: string;
  player4_name: string;
  state: Record<string, unknown>;
}): Promise<RoundRow | null> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("rounds")
    .insert({
      device_id,
      user_id,
      course_slug: args.course.slug,
      course_name: args.course.name,
      player1_name: args.player1_name,
      player2_name: args.player2_name,
      player3_name: args.player3_name,
      player4_name: args.player4_name,
      state: args.state,
      status: "active",
    })
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[supabase] createRound failed:", error.message);
    return null;
  }
  return data as RoundRow | null;
}

export async function updateRoundState(
  roundId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { error } = await supabase
    .from("rounds")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", roundId)
    .or(`device_id.eq.${device_id}${user_id ? `,user_id.eq.${user_id}` : ""}`);

  if (error) console.warn("[supabase] updateRoundState failed:", error.message);
}

export async function completeRound(roundId: string): Promise<void> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { error } = await supabase
    .from("rounds")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId)
    .or(`device_id.eq.${device_id}${user_id ? `,user_id.eq.${user_id}` : ""}`);

  if (error) console.warn("[supabase] completeRound failed:", error.message);
}

// ── Shots ────────────────────────────────────────────────────────────────────
export interface ShotInsert {
  round_id: string;
  ball_id: string;
  player_key: string;
  hole: number;
  shot_index: number;
  x: number;
  y: number;
  distance_yards: number;
  gps_lat?: number | null;
  gps_lng?: number | null;
  cart_lat?: number | null;
  cart_lng?: number | null;
  cart_heading_deg?: number | null;
}

export async function recordShot(args: ShotInsert): Promise<void> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { error } = await supabase.from("shots").insert({ ...args, device_id, user_id });
  if (error) console.warn("[supabase] recordShot failed:", error.message);
}

// ── Smart Glasses & Meta AI ──────────────────────────────────────────────────
export interface GlassesSession {
  id: string;
  device_id: string;
  round_id: string | null;
  model: string;
  status: "paired" | "streaming" | "ended";
  started_at: string;
  ended_at: string | null;
}

export async function startGlassesSession(args: {
  round_id: string | null;
  model: string;
}): Promise<GlassesSession | null> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("glasses_sessions")
    .insert({ device_id, user_id, round_id: args.round_id, model: args.model, status: "streaming" })
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[supabase] startGlassesSession failed:", error.message);
    return null;
  }
  return data as GlassesSession | null;
}

export async function endGlassesSession(id: string): Promise<void> {
  const { error } = await supabase
    .from("glasses_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.warn("[supabase] endGlassesSession failed:", error.message);
}

export interface AiQueryRow {
  id: string;
  device_id: string;
  round_id: string | null;
  hole: number | null;
  prompt: string;
  response: string;
  intent: string;
  created_at: string;
}

export async function recordAiQuery(args: {
  round_id: string | null;
  hole: number | null;
  prompt: string;
  response: string;
  intent: string;
}): Promise<AiQueryRow | null> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("ai_queries")
    .insert({ ...args, device_id, user_id })
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[supabase] recordAiQuery failed:", error.message);
    return null;
  }
  return data as AiQueryRow | null;
}

export async function fetchRecentAiQueries(roundId: string | null, limit = 20): Promise<AiQueryRow[]> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  let q = supabase.from("ai_queries").select("*");
  if (user_id) q = q.eq("user_id", user_id);
  else q = q.eq("device_id", device_id);
  if (roundId) q = q.eq("round_id", roundId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.warn("[supabase] fetchRecentAiQueries failed:", error.message);
    return [];
  }
  return (data || []) as AiQueryRow[];
}

export async function fetchLatestActiveRound(): Promise<RoundRow | null> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  let q = supabase
    .from("rounds")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (user_id) q = q.eq("user_id", user_id);
  else q = q.eq("device_id", device_id);

  const { data, error } = await q.maybeSingle();

  if (error) {
    console.warn("[supabase] fetchLatestActiveRound failed:", error.message);
    return null;
  }
  return data as RoundRow | null;
}

export async function fetchCompletedRounds(): Promise<RoundRow[]> {
  const device_id = getDeviceId();
  const user_id = await getCurrentUserId();
  let q = supabase
    .from("rounds")
    .select("*")
    .eq("status", "completed")
    .order("ended_at", { ascending: false })
    .limit(50);

  if (user_id) q = q.eq("user_id", user_id);
  else q = q.eq("device_id", device_id);

  const { data, error } = await q;

  if (error) {
    console.warn("[supabase] fetchCompletedRounds failed:", error.message);
    return [];
  }
  return (data || []) as RoundRow[];
}
