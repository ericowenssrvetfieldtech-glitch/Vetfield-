/*
  # Add user authentication support to rounds and shots

  1. Changes
    - Add `user_id` (uuid, references auth.users) to `rounds` table
    - Add `user_id` (uuid, references auth.users) to `shots` table
    - Create index on `rounds(user_id, ended_at DESC)` for fast history lookups
    - Create index on `shots(user_id, round_id)` for per-user shot queries

  2. Security
    - Add new RLS policies for authenticated users to access their own data
    - Authenticated users can only read/insert/update their own rounds and shots
    - Existing device_id policies remain for backwards compatibility

  3. Notes
    - user_id is nullable so existing device-only rows still work
    - New rows from logged-in users will populate user_id
*/

-- Add user_id to rounds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rounds' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE rounds ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add user_id to shots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shots' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE shots ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Indexes for user-based queries
CREATE INDEX IF NOT EXISTS rounds_user_idx ON rounds (user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS shots_user_idx ON shots (user_id, round_id);

-- RLS policies for authenticated users on rounds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Auth users can read own rounds'
  ) THEN
    CREATE POLICY "Auth users can read own rounds"
      ON rounds FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Auth users can insert own rounds'
  ) THEN
    CREATE POLICY "Auth users can insert own rounds"
      ON rounds FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Auth users can update own rounds'
  ) THEN
    CREATE POLICY "Auth users can update own rounds"
      ON rounds FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- RLS policies for authenticated users on shots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shots' AND policyname = 'Auth users can read own shots'
  ) THEN
    CREATE POLICY "Auth users can read own shots"
      ON shots FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shots' AND policyname = 'Auth users can insert own shots'
  ) THEN
    CREATE POLICY "Auth users can insert own shots"
      ON shots FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
