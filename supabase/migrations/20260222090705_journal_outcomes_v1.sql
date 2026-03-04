-- journal_outcomes_v1.sql
-- Adds outcome tracking columns

alter table public.journal_trades
  add column if not exists exit numeric,
  add column if not exists r_multiple numeric,
  add column if not exists closed_at timestamptz;

create index if not exists journal_trades_user_closed_idx
  on public.journal_trades(user_id, status, closed_at desc);