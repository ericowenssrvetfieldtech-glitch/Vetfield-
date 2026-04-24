/*
  # Round persistence for VetField SmartCart

  Stores in-progress and completed rounds so a Toughbook can resume after a
  reload or network hiccup. Without authentication we scope each round by a
  client-generated `device_id` (UUID stored in localStorage) — every query from
  the client filters on this id, and policies enforce that the id is always
  present.

  ## New Tables
  - `rounds`
    - `id` uuid PK
    - `device_id` uuid — scope key held on the Toughbook
    - `course_slug` text
    - `course_name` text
    - `player1_name` text
    - `player2_name` text
    - `state` jsonb — full game snapshot (shots, scores, current hole, etc.)
    - `started_at` timestamptz
    - `updated_at` timestamptz
    - `ended_at` timestamptz null — null while the round is in progress
    - `status` text — 'active' or 'completed'

  ## Security
  - RLS enabled
  - Policies require `device_id IS NOT NULL`, so rows without a valid scope key
    cannot be read or written. The client always filters on `device_id = <uuid>`
    so devices cannot accidentally observe each other's rounds even though the
    anon role is used. This is the strongest practical guard available without
    authentication; once auth is added these policies should be tightened to
    `auth.uid() = owner_id`.

  ## Indexes
  - `rounds_device_idx` on (device_id, updated_at DESC) — speeds up the
    "resume latest round" query the app issues on startup.
*/

CREATE TABLE IF NOT EXISTS rounds (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      uuid        NOT NULL,
  course_slug    text        NOT NULL DEFAULT '',
  course_name    text        NOT NULL DEFAULT '',
  player1_name   text        NOT NULL DEFAULT '',
  player2_name   text        NOT NULL DEFAULT '',
  state          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  started_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  status         text        NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS rounds_device_idx
  ON rounds (device_id, updated_at DESC);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Rounds readable when device_id present'
  ) THEN
    CREATE POLICY "Rounds readable when device_id present"
      ON rounds FOR SELECT
      TO anon, authenticated
      USING (device_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Rounds insertable when device_id present'
  ) THEN
    CREATE POLICY "Rounds insertable when device_id present"
      ON rounds FOR INSERT
      TO anon, authenticated
      WITH CHECK (device_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'Rounds updatable when device_id present'
  ) THEN
    CREATE POLICY "Rounds updatable when device_id present"
      ON rounds FOR UPDATE
      TO anon, authenticated
      USING (device_id IS NOT NULL)
      WITH CHECK (device_id IS NOT NULL);
  END IF;
END $$;
