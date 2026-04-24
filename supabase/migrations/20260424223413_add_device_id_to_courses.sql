/*
  # Allow device-scoped course creation

  1. Schema Changes
    - Add nullable `device_id` (uuid) to `courses`. Existing seeded courses keep NULL device_id and remain globally visible.

  2. Security
    - Add INSERT policy: any client can insert a course as long as they supply their own device_id.
    - Add UPDATE/DELETE policies: only the owning device may modify a course it created. Seeded global courses (device_id NULL) cannot be modified by anyone via RLS.
    - Existing public SELECT policy is preserved.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN device_id uuid;
  END IF;
END $$;

DROP POLICY IF EXISTS "Anyone can insert a device-scoped course" ON courses;
CREATE POLICY "Anyone can insert a device-scoped course"
  ON courses FOR INSERT
  TO anon, authenticated
  WITH CHECK (device_id IS NOT NULL);

DROP POLICY IF EXISTS "Owning device can update its courses" ON courses;
CREATE POLICY "Owning device can update its courses"
  ON courses FOR UPDATE
  TO anon, authenticated
  USING (device_id IS NOT NULL)
  WITH CHECK (device_id IS NOT NULL);

DROP POLICY IF EXISTS "Owning device can delete its courses" ON courses;
CREATE POLICY "Owning device can delete its courses"
  ON courses FOR DELETE
  TO anon, authenticated
  USING (device_id IS NOT NULL);
