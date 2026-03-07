-- Add weight_class to ufc_fighter_ratings for per-division admin management.

alter table public.ufc_fighter_ratings
  add column if not exists weight_class text not null default 'Lightweight';

comment on column public.ufc_fighter_ratings.weight_class is
  'UFC weight class (e.g. Lightweight, Welterweight). Set via admin UI.';

create index if not exists ufc_fighter_ratings_weight_class_idx
  on public.ufc_fighter_ratings (weight_class);
