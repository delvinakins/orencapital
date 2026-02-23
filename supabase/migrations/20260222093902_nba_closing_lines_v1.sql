-- nba_closing_lines_v1.sql
-- Stores "closing" home spread baseline per game_key

create table if not exists public.nba_closing_lines (
  game_key text primary key,
  closing_home_spread numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists nba_closing_lines_created_at_idx
  on public.nba_closing_lines(created_at desc);