-- journal_trades_v1.sql
-- Creates/Upgrades journal_trades table to the expected schema (safe + idempotent)

create table if not exists public.journal_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_trades
  add column if not exists status text,
  add column if not exists market text,
  add column if not exists symbol text,
  add column if not exists direction text,
  add column if not exists entry numeric,
  add column if not exists stop numeric,
  add column if not exists position_size numeric,
  add column if not exists risk_pct numeric,
  add column if not exists strategy_tag text,
  add column if not exists notes text;

update public.journal_trades set status = 'OPEN' where status is null;
update public.journal_trades set market = 'STOCKS' where market is null;

alter table public.journal_trades alter column status set default 'OPEN';
alter table public.journal_trades alter column market set default 'STOCKS';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journal_trades_status_check') then
    alter table public.journal_trades
      add constraint journal_trades_status_check
      check (status in ('OPEN','CLOSED'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'journal_trades_market_check') then
    alter table public.journal_trades
      add constraint journal_trades_market_check
      check (market in ('STOCKS','OPTIONS','FUTURES','SPORTS'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'journal_trades_direction_check') then
    alter table public.journal_trades
      add constraint journal_trades_direction_check
      check (direction is null or direction in ('LONG','SHORT'));
  end if;
end;
$$;

create index if not exists journal_trades_user_id_idx on public.journal_trades(user_id);
create index if not exists journal_trades_user_status_idx on public.journal_trades(user_id, status);
create index if not exists journal_trades_user_created_at_idx on public.journal_trades(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_journal_trades_updated_at') then
    create trigger set_journal_trades_updated_at
    before update on public.journal_trades
    for each row
    execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.journal_trades enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='journal_trades' and policyname='journal_trades_select_own'
  ) then
    create policy journal_trades_select_own
    on public.journal_trades
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='journal_trades' and policyname='journal_trades_insert_own'
  ) then
    create policy journal_trades_insert_own
    on public.journal_trades
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='journal_trades' and policyname='journal_trades_update_own'
  ) then
    create policy journal_trades_update_own
    on public.journal_trades
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='journal_trades' and policyname='journal_trades_delete_own'
  ) then
    create policy journal_trades_delete_own
    on public.journal_trades
    for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;
end;
$$;