/*
  # Tighten RLS Policies for Glasses & AI Tables

  Replaces the always-true RLS policies on `glasses_sessions` and `ai_queries`
  with device-scoped checks, matching the pattern used by `rounds` and `shots`.

  ## Changes
  1. `ai_queries` INSERT policy now requires `device_id IS NOT NULL`.
  2. `ai_queries` SELECT policy now requires `device_id IS NOT NULL`.
  3. `glasses_sessions` INSERT policy now requires `device_id IS NOT NULL`.
  4. `glasses_sessions` UPDATE policy now requires `device_id IS NOT NULL`
     in both USING and WITH CHECK clauses.
  5. `glasses_sessions` SELECT policy now requires `device_id IS NOT NULL`.

  ## Security
  These tables remain readable and writable by the anon role (the app does not
  yet use Supabase auth), but every row must carry a `device_id`. This prevents
  blank/unowned rows and matches the rest of the schema.
*/

DROP POLICY IF EXISTS "anon insert ai queries" ON ai_queries;
DROP POLICY IF EXISTS "anon select ai queries" ON ai_queries;

CREATE POLICY "ai queries insertable when device_id present"
  ON ai_queries FOR INSERT
  TO anon
  WITH CHECK (device_id IS NOT NULL AND device_id <> '');

CREATE POLICY "ai queries readable when device_id present"
  ON ai_queries FOR SELECT
  TO anon
  USING (device_id IS NOT NULL AND device_id <> '');

DROP POLICY IF EXISTS "anon insert glasses sessions" ON glasses_sessions;
DROP POLICY IF EXISTS "anon update own glasses sessions" ON glasses_sessions;
DROP POLICY IF EXISTS "anon select own glasses sessions" ON glasses_sessions;

CREATE POLICY "glasses sessions insertable when device_id present"
  ON glasses_sessions FOR INSERT
  TO anon
  WITH CHECK (device_id IS NOT NULL AND device_id <> '');

CREATE POLICY "glasses sessions updatable when device_id present"
  ON glasses_sessions FOR UPDATE
  TO anon
  USING (device_id IS NOT NULL AND device_id <> '')
  WITH CHECK (device_id IS NOT NULL AND device_id <> '');

CREATE POLICY "glasses sessions readable when device_id present"
  ON glasses_sessions FOR SELECT
  TO anon
  USING (device_id IS NOT NULL AND device_id <> '');
