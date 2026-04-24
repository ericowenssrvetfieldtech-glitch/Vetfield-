import { createClient } from "@supabase/supabase-js";

const url     = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);

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
  state: Record<string, unknown>;
}): Promise<RoundRow | null> {
  const device_id = getDeviceId();
  const { data, error } = await supabase
    .from("rounds")
    .insert({
      device_id,
      course_slug: args.course.slug,
      course_name: args.course.name,
      player1_name: args.player1_name,
      player2_name: args.player2_name,
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
  const { error } = await supabase
    .from("rounds")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("device_id", device_id);

  if (error) console.warn("[supabase] updateRoundState failed:", error.message);
}

export async function completeRound(roundId: string): Promise<void> {
  const device_id = getDeviceId();
  const { error } = await supabase
    .from("rounds")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", roundId)
    .eq("device_id", device_id);

  if (error) console.warn("[supabase] completeRound failed:", error.message);
}

export async function fetchLatestActiveRound(): Promise<RoundRow | null> {
  const device_id = getDeviceId();
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("device_id", device_id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[supabase] fetchLatestActiveRound failed:", error.message);
    return null;
  }
  return data as RoundRow | null;
}
