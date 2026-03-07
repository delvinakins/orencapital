-- Stores OCR predictions for upcoming UFC fights (snapshotted when first seen
-- in the live odds feed) and records actual outcomes once graded.
-- This powers the OCR accuracy scoreboard.

CREATE TABLE IF NOT EXISTS ufc_predictions (
  fight_id          text PRIMARY KEY,
  event_title       text,
  commence_time_iso timestamptz,
  fighter1          text NOT NULL,
  fighter2          text NOT NULL,

  -- Probabilities at snapshot time (first seen in odds feed)
  fighter1_ocr_prob    real,
  fighter2_ocr_prob    real,
  fighter1_market_prob real,
  fighter2_market_prob real,
  fighter1_elo         real,
  fighter2_elo         real,

  -- Outcome (null until graded)
  winner        text,        -- lowercase fighter name that won
  method        text,        -- 'ko' | 'tko' | 'submission' | 'decision_unanimous' | 'decision_split' | 'decision_majority'
  round         smallint,
  time_in_round text,        -- e.g. '4:30'
  graded_at     timestamptz,

  snapshotted_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ufc_predictions_commence_idx
  ON ufc_predictions (commence_time_iso DESC);

CREATE INDEX IF NOT EXISTS ufc_predictions_graded_idx
  ON ufc_predictions (graded_at DESC)
  WHERE graded_at IS NOT NULL;
