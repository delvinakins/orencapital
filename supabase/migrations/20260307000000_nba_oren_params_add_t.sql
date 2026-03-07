-- Add big-favourite threshold (t) to nba_oren_params.
-- When closingHome <= -t the grader uses the old formula (follow market);
-- otherwise it uses the corrected formula (model vs market).
alter table public.nba_oren_params
  add column if not exists t numeric not null default 10;
