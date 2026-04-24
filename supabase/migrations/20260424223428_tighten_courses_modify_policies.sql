/*
  # Make user-created courses append-only

  1. Security
    - Without an authenticated identity we cannot verify that a caller's claimed `device_id` actually belongs to them, so allowing UPDATE/DELETE based on a self-supplied device_id provides no real protection. Remove those policies entirely.
    - Result: clients can INSERT new courses and SELECT all courses, but cannot modify or delete existing rows. This is intentional and matches the "Add Course" UX, which only needs creation.
*/

DROP POLICY IF EXISTS "Owning device can update its courses" ON courses;
DROP POLICY IF EXISTS "Owning device can delete its courses" ON courses;
