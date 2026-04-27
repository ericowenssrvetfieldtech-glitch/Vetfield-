/*
  # Per-shot tracking table for auto-detected UWB shots

  Each detected shot from the cart-mounted UWB system is recorded as its own
  row, in addition to being stored inside the round's `state` JSONB. This
  enables analytics queries (avg distance per club, dispersion, heatmaps) that
  would be impractical to run against JSONB blobs.

  ## New Tables
  - `shots`
    - `id` uuid PK
    - `round_id` uuid FK → rounds(id) ON DELETE CASCADE
    - `device_id` uuid — same scope key as the parent round
    - `ball_id` text — UWB tag id ("ball1"…"ball4")
    - `player_key` text — "p1"…"p4"
    - `hole` int — hole number
    - `shot_index` int — 1-based index of this shot on the hole for the player
    - `x` numeric — normalized 0-1 map position (course frame)
    - `y` numeric — normalized 0-1 map position
    - `distance_yards` int
    - `gps_lat` numeric null — course-anchored GPS at shot end
    - `gps_lng` numeric null
    - `cart_lat` numeric null — cart GPS at moment of detection
    - `cart_lng` numeric null
    - `cart_heading_deg` numeric null — cart compass heading at detection
    - `created_at` timestamptz

  ## Security
  - RLS enabled
  - Same device_id scoping as rounds
*/

CREATE TABLE IF NOT EXISTS shots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  device_id       uuid        NOT NULL,
  ball_id         text        NOT NULL DEFAULT '',
  player_key      text        NOT NULL DEFAULT 'p1',
  hole            int         NOT NULL DEFAULT 1,
  shot_index      int         NOT NULL DEFAULT 1,
  x               numeric     NOT NULL DEFAULT 0.5,
  y               numeric     NOT NULL DEFAULT 0.5,
  distance_yards  int         NOT NULL DEFAULT 0,
  gps_lat         numeric,
  gps_lng         numeric,
  cart_lat        numeric,
  cart_lng        numeric,
  cart_heading_deg numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shots_round_idx ON shots (round_id, hole, shot_index);
CREATE INDEX IF NOT EXISTS shots_device_idx ON shots (device_id, created_at DESC);

ALTER TABLE shots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shots' AND policyname = 'Shots readable when device_id present'
  ) THEN
    CREATE POLICY "Shots readable when device_id present"
      ON shots FOR SELECT
      TO anon, authenticated
      USING (device_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shots' AND policyname = 'Shots insertable when device_id present'
  ) THEN
    CREATE POLICY "Shots insertable when device_id present"
      ON shots FOR INSERT
      TO anon, authenticated
      WITH CHECK (device_id IS NOT NULL);
  END IF;
END $$;
