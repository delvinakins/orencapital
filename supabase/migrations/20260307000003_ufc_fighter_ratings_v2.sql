-- Add OCR (Oren Combat Rating) columns to ufc_fighter_ratings.
-- finish quality stats, grappling stats, style label, and date of birth.

alter table public.ufc_fighter_ratings
  add column if not exists ko_wins         integer not null default 0,
  add column if not exists sub_wins        integer not null default 0,
  -- Grappling stats from UFCStats (null = not yet seeded)
  add column if not exists td_accuracy     numeric,   -- 0–1 takedown accuracy
  add column if not exists td_defense      numeric,   -- 0–1 takedown defense rate
  add column if not exists ground_ctrl_pct numeric,   -- 0–1 avg ground control time share
  -- Derived style label (recomputed on each grade)
  add column if not exists style           text not null default 'balanced',
  -- Date of birth for age-at-fight calculations
  add column if not exists dob             date;

comment on column public.ufc_fighter_ratings.style is
  'Derived: ko_artist | grappler | balanced. Recomputed on each grade.';
comment on column public.ufc_fighter_ratings.ground_ctrl_pct is
  'Avg share of total fight time spent in ground control. Seed from UFCStats.';
