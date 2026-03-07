-- Add elite home team threshold (n) to nba_oren_params.
-- Home teams ranked <= n use the market-following formula regardless of spread size,
-- ensuring the model always leans with top-ranked teams when they play at home.
alter table public.nba_oren_params
  add column if not exists n integer not null default 2;
