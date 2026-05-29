/*
  # Fix stale course data in active rounds

  1. Changes
    - Updates all active rounds to refresh their embedded course data from the courses table
    - This ensures rounds reflect the full hole count (9 or 18) instead of the old 3-hole data
  
  2. Notes
    - Only updates rounds where the state->course->holes array has fewer holes than the actual course
    - Preserves all other round state data (scores, shots, current hole, etc.)
*/

UPDATE rounds r
SET state = jsonb_set(
  jsonb_set(
    r.state,
    '{course,holes}',
    (SELECT c.holes::jsonb FROM courses c WHERE c.slug = r.course_slug)
  ),
  '{course,total_holes}',
  to_jsonb((SELECT c.total_holes FROM courses c WHERE c.slug = r.course_slug))
)
WHERE r.status = 'active'
  AND EXISTS (
    SELECT 1 FROM courses c
    WHERE c.slug = r.course_slug
      AND jsonb_array_length(c.holes::jsonb) > jsonb_array_length((r.state->'course'->'holes')::jsonb)
  );
