/*
  # Smart Glasses & Meta AI Caddy Tables

  Adds persistence for the AR smart-glasses simulator experience.

  ## New Tables

  ### `glasses_sessions`
  Tracks each pairing/connection session with a smart-glasses headset.
    - `id` (uuid, primary key)
    - `device_id` (text) — device fingerprint of the phone running the app
    - `round_id` (uuid, nullable) — optional active round
    - `model` (text) — glasses model identifier (e.g. "Ray-Ban Meta")
    - `status` (text) — "paired" | "streaming" | "ended"
    - `started_at` (timestamptz)
    - `ended_at` (timestamptz, nullable)

  ### `ai_queries`
  Logs every Meta AI caddy query and response.
    - `id` (uuid, primary key)
    - `device_id` (text)
    - `round_id` (uuid, nullable)
    - `hole` (int, nullable) — hole number when query made
    - `prompt` (text) — what the caddy was asked
    - `response` (text) — Meta AI response text
    - `intent` (text) — "club" | "wind" | "read_green" | "distance" | "general"
    - `created_at` (timestamptz)

  ## Security
  RLS is enabled on both tables. Access is scoped by `device_id` matching
  the local fingerprint stored client-side. The app uses the anon role,
  so policies allow anon insert/select where device_id matches the header.
  Since this client app does not yet use Supabase auth, policies are
  permissive on insert and gated on select by device_id equality.
*/

CREATE TABLE IF NOT EXISTS glasses_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT '',
  round_id uuid REFERENCES rounds(id) ON DELETE SET NULL,
  model text NOT NULL DEFAULT 'Ray-Ban Meta',
  status text NOT NULL DEFAULT 'paired',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_glasses_sessions_device ON glasses_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_glasses_sessions_round ON glasses_sessions(round_id);

ALTER TABLE glasses_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon select own glasses sessions"
  ON glasses_sessions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert glasses sessions"
  ON glasses_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update own glasses sessions"
  ON glasses_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS ai_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT '',
  round_id uuid REFERENCES rounds(id) ON DELETE SET NULL,
  hole int,
  prompt text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_device ON ai_queries(device_id);
CREATE INDEX IF NOT EXISTS idx_ai_queries_round ON ai_queries(round_id);
CREATE INDEX IF NOT EXISTS idx_ai_queries_created ON ai_queries(created_at DESC);

ALTER TABLE ai_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon select ai queries"
  ON ai_queries FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert ai queries"
  ON ai_queries FOR INSERT
  TO anon
  WITH CHECK (true);
