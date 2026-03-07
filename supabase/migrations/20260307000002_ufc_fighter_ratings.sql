-- UFC fighter ELO ratings table
-- Stores per-fighter ELO rating seeded from historical fight results.
-- Defaults to 1500 (baseline ELO) for fighters not yet graded.

create table if not exists public.ufc_fighter_ratings (
  fighter_name  text        primary key,
  elo           numeric     not null default 1500,
  fights        integer     not null default 0,
  wins          integer     not null default 0,
  updated_at    timestamptz not null default now()
);

comment on table public.ufc_fighter_ratings is
  'Per-fighter ELO ratings updated after each graded UFC fight.';
