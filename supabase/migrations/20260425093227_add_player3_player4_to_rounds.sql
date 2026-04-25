/*
  # Add player3_name and player4_name to rounds

  Extends the rounds table to support up to 4 players per round.
  Existing 2-player rounds are unaffected — both new columns default to empty string.

  ## Changes
  - `rounds`: add `player3_name` text DEFAULT ''
  - `rounds`: add `player4_name` text DEFAULT ''
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rounds' AND column_name = 'player3_name'
  ) THEN
    ALTER TABLE rounds ADD COLUMN player3_name text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rounds' AND column_name = 'player4_name'
  ) THEN
    ALTER TABLE rounds ADD COLUMN player4_name text NOT NULL DEFAULT '';
  END IF;
END $$;
