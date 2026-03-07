-- Adds current_rank to ufc_fighter_ratings.
-- 0 = champion, 1–15 = ranked contender, NULL = unranked / no longer active.
-- Populated and maintained by the weekly ufc-rankings-sync cron (Monday ~8PM ET).

ALTER TABLE ufc_fighter_ratings
  ADD COLUMN IF NOT EXISTS current_rank smallint DEFAULT NULL;

COMMENT ON COLUMN ufc_fighter_ratings.current_rank IS
  '0 = champion, 1–15 = ranked contender, NULL = unranked or retired';

CREATE INDEX IF NOT EXISTS ufc_fighter_ratings_rank_idx
  ON ufc_fighter_ratings (current_rank)
  WHERE current_rank IS NOT NULL;
