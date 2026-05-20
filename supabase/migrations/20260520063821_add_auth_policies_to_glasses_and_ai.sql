/*
  # Add authenticated user policies to glasses_sessions and ai_queries

  1. Changes
    - Add `user_id` column (uuid, nullable, references auth.users) to `glasses_sessions`
    - Add `user_id` column (uuid, nullable, references auth.users) to `ai_queries`
    - Add RLS policies for authenticated users on both tables

  2. Security
    - Authenticated users can insert, select, and update their own glasses_sessions
    - Authenticated users can insert and select their own ai_queries
    - Existing anon/device_id policies remain for unauthenticated usage

  3. Notes
    - user_id is nullable for backwards compatibility with existing device-only rows
*/

-- Add user_id to glasses_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'glasses_sessions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE glasses_sessions ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add user_id to ai_queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_queries' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ai_queries ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS glasses_sessions_user_idx ON glasses_sessions (user_id);
CREATE INDEX IF NOT EXISTS ai_queries_user_idx ON ai_queries (user_id);

-- Authenticated policies for glasses_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'glasses_sessions' AND policyname = 'Auth users can insert own glasses sessions'
  ) THEN
    CREATE POLICY "Auth users can insert own glasses sessions"
      ON glasses_sessions FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'glasses_sessions' AND policyname = 'Auth users can read own glasses sessions'
  ) THEN
    CREATE POLICY "Auth users can read own glasses sessions"
      ON glasses_sessions FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'glasses_sessions' AND policyname = 'Auth users can update own glasses sessions'
  ) THEN
    CREATE POLICY "Auth users can update own glasses sessions"
      ON glasses_sessions FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Authenticated policies for ai_queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_queries' AND policyname = 'Auth users can insert own ai queries'
  ) THEN
    CREATE POLICY "Auth users can insert own ai queries"
      ON ai_queries FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_queries' AND policyname = 'Auth users can read own ai queries'
  ) THEN
    CREATE POLICY "Auth users can read own ai queries"
      ON ai_queries FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
