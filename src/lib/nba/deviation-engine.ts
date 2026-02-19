// src/lib/nba/deviation-engine.ts
// Proper statistical deviation engine (conditional distributions + shrinkage).
// Pure functions only. Safe to import anywhere (server/client), no side-effects.

export type Side = "home" | "away";

export type NBAGameState = {
  /**
   * 1-4 for regulation, 5+ for OT periods.
   */
  period: number;

  /**
   * Seconds remaining in the current period (0..720 in regulation).
   */
  secondsRemainingInPeriod: number;

  /**
   * Home score minus away score at the moment of the snapshot.
   * Positive means home is leading.
   */
  scoreDiff: number;
};

export type MarketSnapshot = {
  /**
   * Live point spread for the home team at the snapshot moment.
   * Convention: negative = home favored by that many points.
   * Example: -3.5 means home -3.5.
   */
  liveHomeSpread: number;

  /**
   * Closing spread consensus for the home team (same convention as liveHomeSpread).
   */
  closingHomeSpread: number;
};

export type HistoricalSample = {
  gameId: string;
  /**
   * Timestamp/order index for reproducibility/debug (optional).
   * Not required for the model to function.
   */
  t?: number;
  state: NBAGameState;
  market: MarketSnapshot;
};

/**
 * A stable key for a conditional "bucket" (period + time bucket + score diff bucket + pregame bucket).
 * This is the core of the conditional distribution approach.
 */
export type ConditionKey = string;

export type RunningStats = {
  n: number;
  mean: number;
  m2: number; // sum of squares of differences from the mean (Welford)
  // A small reservoir of values so we can compute rough quantiles/median if needed.
  reservoir: number[];
};

export type DistributionIndex = {
  /**
   * Global distribution across all samples (fallback).
   */
  global: RunningStats;

  /**
   * Conditional distributions keyed by ConditionKey.
   */
  byKey: Record<ConditionKey, RunningStats>;

  /**
   * Metadata describing how we bucketed the world.
   */
  spec: BucketSpec;
};

export type BucketSpec = {
  /**
   * Bucket size in seconds for time remaining within a period.
   * Example: 60 => per-minute buckets.
   */
  timeBucketSec: number;

  /**
   * Score differential bucket size (points).
   * Example: 3 => -2..0..+2 etc (rounded).
   */
  scoreDiffBucketPts: number;

  /**
   * Pregame spread bucket size (points).
   * Example: 2 => spread rounded to nearest 2 points.
   */
  closingSpreadBucketPts: number;

  /**
   * Reservoir size per key for quantiles (kept small to control memory).
   */
  reservoirSize: number;

  /**
   * Whether to treat OT as a single "OT" bucket or keep OT1/OT2... separate.
   */
  otMode: "single" | "separate";
};

export type ScoreTier = "none" | "mild" | "elevated" | "extreme";

export type DeviationScore = {
  keyUsed: ConditionKey;
  nUsed: number;

  /**
   * Observed deviation: live - closing (in spread points).
   * Positive means live spread moved in the positive direction (toward home underdog / away favored less).
   */
  observedDeviation: number;

  /**
   * Model expected deviation for this condition (conditional mean with shrinkage).
   */
  expectedDeviation: number;

  /**
   * Standard deviation used (conditional with shrinkage + safety floor).
   */
  stdevUsed: number;

  /**
   * Z-score: (observed - expected) / stdevUsed
   */
  z: number;

  /**
   * Absolute z for ranking/heatmaps.
   */
  absZ: number;

  tier: ScoreTier;

  /**
   * A user-facing label you can display (calm, non-gamified).
   */
  label: string;
};

/* ------------------------------
   Core math helpers (Welford)
-------------------------------- */

function initStats(reservoirSize: number): RunningStats {
  return { n: 0, mean: 0, m2: 0, reservoir: [], };
}

function updateStats(stats: RunningStats, x: number, reservoirSize: number) {
  // Welford
  stats.n += 1;
  const delta = x - stats.mean;
  stats.mean += delta / stats.n;
  const delta2 = x - stats.mean;
  stats.m2 += delta * delta2;

  // Reservoir sampling (Vitter's Algorithm R) to keep a bounded sample for quantiles
  if (reservoirSize <= 0) return;

  if (stats.reservoir.length < reservoirSize) {
    stats.reservoir.push(x);
    return;
  }

  // Replace elements with decreasing probability
  const j = Math.floor(Math.random() * stats.n);
  if (j < reservoirSize) stats.reservoir[j] = x;
}

function variance(stats: RunningStats): number {
  if (stats.n <= 1) return 0;
  return stats.m2 / (stats.n - 1);
}

function stdev(stats: RunningStats): number {
  const v = variance(stats);
  return v > 0 ? Math.sqrt(v) : 0;
}

/* ------------------------------
   Bucketing
-------------------------------- */

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function roundToNearest(x: number, step: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(step) || step <= 0) return x;
  return Math.round(x / step) * step;
}

function timeBucket(secondsRemainingInPeriod: number, timeBucketSec: number): number {
  // bucket is expressed as "minutes remaining" bucket boundaries in seconds
  // Example: 615 sec with 60 sec bucket => 600 (i.e., 10:00-10:59)
  const s = clamp(Math.floor(secondsRemainingInPeriod), 0, 60 * 12);
  return Math.floor(s / timeBucketSec) * timeBucketSec;
}

function scoreDiffBucket(scoreDiff: number, scoreDiffBucketPts: number): number {
  return roundToNearest(scoreDiff, scoreDiffBucketPts);
}

function closingSpreadBucket(closingHomeSpread: number, closingSpreadBucketPts: number): number {
  return roundToNearest(closingHomeSpread, closingSpreadBucketPts);
}

export function makeConditionKey(state: NBAGameState, market: MarketSnapshot, spec: BucketSpec): ConditionKey {
  const periodRaw = Math.max(1, Math.floor(state.period));
  const period =
    periodRaw <= 4 ? periodRaw : spec.otMode === "single" ? 5 : periodRaw;

  const tBucket = timeBucket(state.secondsRemainingInPeriod, spec.timeBucketSec);
  const dBucket = scoreDiffBucket(state.scoreDiff, spec.scoreDiffBucketPts);
  const sBucket = closingSpreadBucket(market.closingHomeSpread, spec.closingSpreadBucketPts);

  // Stable string. Example: "P2|T600|D-6|S-4"
  return `P${period}|T${tBucket}|D${dBucket}|S${sBucket}`;
}

/* ------------------------------
   Building distributions
-------------------------------- */

export type BuildOptions = Partial<BucketSpec> & {
  /**
   * Minimum samples per key required to consider the conditional stats "trusted".
   * Below this, scoring will shrink heavily to global anyway, but this can be used by UI later.
   */
  minKeySamples?: number;
};

export function buildDistributionIndex(samples: HistoricalSample[], options: BuildOptions = {}): DistributionIndex {
  const spec: BucketSpec = {
    timeBucketSec: options.timeBucketSec ?? 60,
    scoreDiffBucketPts: options.scoreDiffBucketPts ?? 3,
    closingSpreadBucketPts: options.closingSpreadBucketPts ?? 2,
    reservoirSize: options.reservoirSize ?? 128,
    otMode: options.otMode ?? "single",
  };

  const global = initStats(spec.reservoirSize);
  const byKey: Record<ConditionKey, RunningStats> = {};

  for (const s of samples) {
    const dev = s.market.liveHomeSpread - s.market.closingHomeSpread;
    if (!Number.isFinite(dev)) continue;

    updateStats(global, dev, spec.reservoirSize);

    const key = makeConditionKey(s.state, s.market, spec);
    if (!byKey[key]) byKey[key] = initStats(spec.reservoirSize);
    updateStats(byKey[key], dev, spec.reservoirSize);
  }

  return { global, byKey, spec };
}

/* ------------------------------
   Scoring with shrinkage
-------------------------------- */

export type ScoreOptions = {
  /**
   * Shrinkage strength: how many "prior samples" global distribution contributes.
   * Higher => more conservative, slower to react to small conditional buckets.
   */
  priorWeight?: number;

  /**
   * If conditional stdev is tiny / 0, we use a minimum floor to avoid infinity z-scores.
   * This should roughly reflect plausible spread jitter in your dataset.
   */
  stdevFloor?: number;

  /**
   * Thresholds for tiers (absolute z).
   */
  mildZ?: number;
  elevatedZ?: number;
  extremeZ?: number;
};

function tierFromAbsZ(absZ: number, o: Required<Pick<ScoreOptions, "mildZ" | "elevatedZ" | "extremeZ">>): ScoreTier {
  if (!Number.isFinite(absZ)) return "none";
  if (absZ >= o.extremeZ) return "extreme";
  if (absZ >= o.elevatedZ) return "elevated";
  if (absZ >= o.mildZ) return "mild";
  return "none";
}

function labelForTier(tier: ScoreTier): string {
  switch (tier) {
    case "extreme":
      return "Large dislocation vs. expected";
    case "elevated":
      return "Meaningful dislocation vs. expected";
    case "mild":
      return "Notable dislocation vs. expected";
    default:
      return "Within expected range";
  }
}

/**
 * Score a live snapshot using conditional stats with shrinkage toward global.
 * - Expected deviation: blended mean (conditional + global)
 * - Stdev: blended variance with a floor
 *
 * This is the core "statistical deviation engine" output you’ll feed the heatmap.
 */
export function scoreDeviation(
  index: DistributionIndex,
  state: NBAGameState,
  market: MarketSnapshot,
  opts: ScoreOptions = {}
): DeviationScore {
  const priorWeight = opts.priorWeight ?? 40; // conservative by default
  const stdevFloor = opts.stdevFloor ?? 0.6;  // prevents absurd z on tiny buckets

  const mildZ = opts.mildZ ?? 1.0;
  const elevatedZ = opts.elevatedZ ?? 1.5;
  const extremeZ = opts.extremeZ ?? 2.0;

  const observed = market.liveHomeSpread - market.closingHomeSpread;
  const key = makeConditionKey(state, market, index.spec);

  const g = index.global;
  const c = index.byKey[key];

  // Global stats
  const gMean = g.n > 0 ? g.mean : 0;
  const gVar = g.n > 1 ? variance(g) : 0;
  const gStd = gVar > 0 ? Math.sqrt(gVar) : stdevFloor;

  // Conditional stats (may be missing)
  const cN = c?.n ?? 0;
  const cMean = cN > 0 ? (c as RunningStats).mean : gMean;
  const cVar = cN > 1 ? variance(c as RunningStats) : gVar;

  // Empirical Bayes shrinkage:
  // posteriorMean = (cN*cMean + priorWeight*gMean) / (cN + priorWeight)
  const denom = cN + priorWeight;
  const expected = denom > 0 ? (cN * cMean + priorWeight * gMean) / denom : gMean;

  // Variance blending:
  // We blend conditional variance with global variance, weighting by sample size.
  // This makes small buckets use global volatility.
  const varBlend =
    denom > 0 ? (cN * cVar + priorWeight * gVar) / denom : gVar;

  const stdUsedRaw = varBlend > 0 ? Math.sqrt(varBlend) : gStd;
  const stdUsed = Math.max(stdUsedRaw, stdevFloor);

  const z = Number.isFinite(observed) ? (observed - expected) / stdUsed : 0;
  const absZ = Math.abs(z);

  const tier = tierFromAbsZ(absZ, { mildZ, elevatedZ, extremeZ });

  return {
    keyUsed: key,
    nUsed: cN,
    observedDeviation: observed,
    expectedDeviation: expected,
    stdevUsed: stdUsed,
    z,
    absZ,
    tier,
    label: labelForTier(tier),
  };
}

/* ------------------------------
   Optional: helpers for debugging/inspection
-------------------------------- */

/**
 * Return a lightweight summary for a given key (useful for debugging).
 * No UI assumptions.
 */
export function describeKey(index: DistributionIndex, key: ConditionKey) {
  const c = index.byKey[key];
  const g = index.global;

  const cStd = c ? stdev(c) : 0;
  const gStd = stdev(g);

  return {
    key,
    conditional: c
      ? { n: c.n, mean: c.mean, stdev: cStd }
      : { n: 0, mean: 0, stdev: 0 },
    global: { n: g.n, mean: g.mean, stdev: gStd },
    spec: index.spec,
  };
}
