/*
  # Seed courses near Kingsville, TX 78363

  Adds three real courses within driving distance of Kingsville to the public
  course catalog. Hole geometry is plausible placeholder data (3-hole demos,
  matching the existing seed format); real outlines can be loaded later via a
  Golfbert / USGA import pipeline without changing the schema.

  ## Courses seeded
  - L.E. Ramey Golf Course (Kingsville, TX — Texas A&M-Kingsville)
  - Kings Crossing Country Club (Corpus Christi, TX)
  - Oso Beach Municipal Golf Course (Corpus Christi, TX)

  ## Tables affected
  - `courses` (INSERT only; ON CONFLICT DO NOTHING keeps existing rows safe)

  ## Security
  - No policy changes — the existing public SELECT policy covers these rows.
*/

INSERT INTO courses (slug, name, location, total_holes, holes, source)
VALUES (
  'le-ramey',
  'L.E. Ramey Golf Course',
  'Kingsville, TX',
  3,
  '[{"number":1,"par":4,"yards":395,"tee":{"x":0.14,"y":0.88},"pin":{"x":0.18,"y":0.13},"fairway":[{"x":0.09,"y":0.88},{"x":0.19,"y":0.88},{"x":0.22,"y":0.55},{"x":0.22,"y":0.22},{"x":0.14,"y":0.20},{"x":0.10,"y":0.55}],"green":[{"x":0.14,"y":0.13},{"x":0.22,"y":0.13},{"x":0.22,"y":0.07},{"x":0.14,"y":0.07}],"hazards":[{"type":"trees","pts":[{"x":0.03,"y":0.30},{"x":0.08,"y":0.30},{"x":0.08,"y":0.70},{"x":0.03,"y":0.70}]},{"type":"bunker","pts":[{"x":0.20,"y":0.16},{"x":0.24,"y":0.16},{"x":0.24,"y":0.22},{"x":0.20,"y":0.22}]}]},{"number":2,"par":3,"yards":175,"tee":{"x":0.40,"y":0.85},"pin":{"x":0.46,"y":0.18},"fairway":[{"x":0.35,"y":0.85},{"x":0.45,"y":0.85},{"x":0.50,"y":0.22},{"x":0.37,"y":0.20}],"green":[{"x":0.40,"y":0.18},{"x":0.50,"y":0.18},{"x":0.50,"y":0.11},{"x":0.40,"y":0.11}],"hazards":[{"type":"water","pts":[{"x":0.33,"y":0.40},{"x":0.38,"y":0.40},{"x":0.38,"y":0.62},{"x":0.33,"y":0.62}]},{"type":"bunker","pts":[{"x":0.50,"y":0.22},{"x":0.54,"y":0.22},{"x":0.54,"y":0.28},{"x":0.50,"y":0.28}]}]},{"number":3,"par":5,"yards":520,"tee":{"x":0.65,"y":0.90},"pin":{"x":0.85,"y":0.12},"fairway":[{"x":0.60,"y":0.90},{"x":0.70,"y":0.90},{"x":0.76,"y":0.60},{"x":0.86,"y":0.38},{"x":0.90,"y":0.20},{"x":0.82,"y":0.18},{"x":0.78,"y":0.36},{"x":0.66,"y":0.58},{"x":0.60,"y":0.76}],"green":[{"x":0.80,"y":0.12},{"x":0.90,"y":0.12},{"x":0.90,"y":0.06},{"x":0.80,"y":0.06}],"hazards":[{"type":"water","pts":[{"x":0.70,"y":0.60},{"x":0.76,"y":0.60},{"x":0.76,"y":0.70},{"x":0.70,"y":0.70}]},{"type":"bunker","pts":[{"x":0.78,"y":0.14},{"x":0.82,"y":0.14},{"x":0.82,"y":0.20},{"x":0.78,"y":0.20}]}]}]'::jsonb,
  'seed'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO courses (slug, name, location, total_holes, holes, source)
VALUES (
  'kings-crossing',
  'Kings Crossing Country Club',
  'Corpus Christi, TX',
  3,
  '[{"number":1,"par":4,"yards":420,"tee":{"x":0.12,"y":0.90},"pin":{"x":0.22,"y":0.12},"fairway":[{"x":0.08,"y":0.90},{"x":0.18,"y":0.90},{"x":0.24,"y":0.55},{"x":0.25,"y":0.25},{"x":0.15,"y":0.22},{"x":0.10,"y":0.55}],"green":[{"x":0.18,"y":0.12},{"x":0.26,"y":0.12},{"x":0.26,"y":0.06},{"x":0.18,"y":0.06}],"hazards":[{"type":"bunker","pts":[{"x":0.08,"y":0.48},{"x":0.12,"y":0.48},{"x":0.12,"y":0.58},{"x":0.08,"y":0.58}]},{"type":"water","pts":[{"x":0.25,"y":0.30},{"x":0.29,"y":0.30},{"x":0.29,"y":0.42},{"x":0.25,"y":0.42}]}]},{"number":2,"par":4,"yards":380,"tee":{"x":0.42,"y":0.85},"pin":{"x":0.50,"y":0.14},"fairway":[{"x":0.37,"y":0.85},{"x":0.47,"y":0.85},{"x":0.54,"y":0.48},{"x":0.54,"y":0.22},{"x":0.45,"y":0.20},{"x":0.39,"y":0.48}],"green":[{"x":0.46,"y":0.14},{"x":0.54,"y":0.14},{"x":0.54,"y":0.08},{"x":0.46,"y":0.08}],"hazards":[{"type":"trees","pts":[{"x":0.55,"y":0.34},{"x":0.60,"y":0.34},{"x":0.60,"y":0.66},{"x":0.55,"y":0.66}]},{"type":"bunker","pts":[{"x":0.54,"y":0.18},{"x":0.58,"y":0.18},{"x":0.58,"y":0.24},{"x":0.54,"y":0.24}]}]},{"number":3,"par":3,"yards":190,"tee":{"x":0.72,"y":0.82},"pin":{"x":0.80,"y":0.18},"fairway":[{"x":0.68,"y":0.82},{"x":0.76,"y":0.82},{"x":0.84,"y":0.22},{"x":0.76,"y":0.20}],"green":[{"x":0.76,"y":0.18},{"x":0.84,"y":0.18},{"x":0.84,"y":0.11},{"x":0.76,"y":0.11}],"hazards":[{"type":"water","pts":[{"x":0.62,"y":0.40},{"x":0.72,"y":0.40},{"x":0.72,"y":0.62},{"x":0.62,"y":0.62}]},{"type":"bunker","pts":[{"x":0.84,"y":0.22},{"x":0.88,"y":0.22},{"x":0.88,"y":0.28},{"x":0.84,"y":0.28}]}]}]'::jsonb,
  'seed'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO courses (slug, name, location, total_holes, holes, source)
VALUES (
  'oso-beach',
  'Oso Beach Municipal Golf Course',
  'Corpus Christi, TX',
  3,
  '[{"number":1,"par":4,"yards":365,"tee":{"x":0.15,"y":0.88},"pin":{"x":0.18,"y":0.14},"fairway":[{"x":0.10,"y":0.88},{"x":0.20,"y":0.88},{"x":0.22,"y":0.50},{"x":0.22,"y":0.22},{"x":0.14,"y":0.20},{"x":0.10,"y":0.50}],"green":[{"x":0.14,"y":0.14},{"x":0.22,"y":0.14},{"x":0.22,"y":0.08},{"x":0.14,"y":0.08}],"hazards":[{"type":"water","pts":[{"x":0.05,"y":0.20},{"x":0.09,"y":0.20},{"x":0.09,"y":0.80},{"x":0.05,"y":0.80}]},{"type":"bunker","pts":[{"x":0.20,"y":0.18},{"x":0.24,"y":0.18},{"x":0.24,"y":0.24},{"x":0.20,"y":0.24}]}]},{"number":2,"par":5,"yards":495,"tee":{"x":0.40,"y":0.90},"pin":{"x":0.50,"y":0.10},"fairway":[{"x":0.36,"y":0.90},{"x":0.44,"y":0.90},{"x":0.52,"y":0.55},{"x":0.54,"y":0.22},{"x":0.46,"y":0.20},{"x":0.40,"y":0.55}],"green":[{"x":0.46,"y":0.10},{"x":0.54,"y":0.10},{"x":0.54,"y":0.05},{"x":0.46,"y":0.05}],"hazards":[{"type":"water","pts":[{"x":0.32,"y":0.40},{"x":0.36,"y":0.40},{"x":0.36,"y":0.70},{"x":0.32,"y":0.70}]},{"type":"bunker","pts":[{"x":0.54,"y":0.14},{"x":0.58,"y":0.14},{"x":0.58,"y":0.20},{"x":0.54,"y":0.20}]}]},{"number":3,"par":3,"yards":160,"tee":{"x":0.72,"y":0.80},"pin":{"x":0.80,"y":0.20},"fairway":[{"x":0.68,"y":0.80},{"x":0.76,"y":0.80},{"x":0.84,"y":0.24},{"x":0.76,"y":0.22}],"green":[{"x":0.76,"y":0.20},{"x":0.84,"y":0.20},{"x":0.84,"y":0.13},{"x":0.76,"y":0.13}],"hazards":[{"type":"bunker","pts":[{"x":0.72,"y":0.20},{"x":0.76,"y":0.20},{"x":0.76,"y":0.26},{"x":0.72,"y":0.26}]},{"type":"water","pts":[{"x":0.84,"y":0.42},{"x":0.90,"y":0.42},{"x":0.90,"y":0.60},{"x":0.84,"y":0.60}]}]}]'::jsonb,
  'seed'
)
ON CONFLICT (slug) DO NOTHING;
