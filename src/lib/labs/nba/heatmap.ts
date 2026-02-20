// src/lib/labs/nba/heatmap.ts
/**
 * NBA "Expectation Gap" signal
 *
 * Goal: point out outlier performance vs the market line in a calm, institutional way.
 *
 * We compute:
 *  - impliedFinalHomeMargin = -liveHomeSpread
 *  - expectedFinalHomeMargin = E[FinalHomeMargin | current game state, market context]
 *  - expectationGap = expectedFinalHomeMargin - impliedFinalHomeMargin
 *
 * This file is PURE. No fetch, no UI, no console. Safe to run on server/client.
 */

export type DeviationState = {
  period: number | null;
  secondsRemainingInPeriod: number | null;
  scoreDiff: number | null; // home - away
};

export type DeviationMarket = {
  closingHomeSpread: number | null;
  liveHomeSpread: number | null;
};

export type ComputeDeviationOptions = {
  spreadIndex?: any;
};

export type DeviationResult = {
  // Primary signal (pts)
  expectedFinalHomeMargin: number | null;
  impliedFinalHomeMargin: number | null;
  expectationGap: number; // expected - implied (0 if unknown)
  absGap: number;

  // Optional normalizations (best-effort)
  gapStdDev: number | null;
  zGap: number; // expectationGap / std (0 if unknown)

  // Back-compat fields (kept so old callers don't explode)
  zSpread: number;
  zTotal: number;

  // Debug-safe metadata (numbers only)
  state: DeviationState;
  market: DeviationMarket;
};

function toNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toInt(x: any): number | null {
  const v = toNum(x);
  return v == null ? null : Math.trunc(v);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function getScores(g: any): { home: number | null; away: number | null } {
  const away =
    toInt(g?.awayScore) ??
    toInt(g?.away_score) ??
    toInt(g?.score?.away) ??
    toInt(g?.away?.score) ??
    null;

  const home =
    toInt(g?.homeScore) ??
    toInt(g?.home_score) ??
    toInt(g?.score?.home) ??
    toInt(g?.home?.score) ??
    null;

  return { home, away };
}

function buildState(g: any): DeviationState {
  const period =
    toInt(g?.period) ??
    toInt(g?.state?.period) ??
    toInt(g?.gameState?.period) ??
    null;

  // Your feed uses `secondsRemaining`
  const secondsRemainingInPeriod =
    toInt(g?.secondsRemaining) ??
    toInt(g?.secondsRemainingInPeriod) ??
    toInt(g?.state?.secondsRemainingInPeriod) ??
    toInt(g?.gameState?.secondsRemainingInPeriod) ??
    null;

  // Prefer explicit scoreDiff if present; else compute from score
  const scoreDiffExplicit =
    toInt(g?.scoreDiff) ??
    toInt(g?.state?.scoreDiff) ??
    toInt(g?.gameState?.scoreDiff) ??
    null;

  if (scoreDiffExplicit != null) {
    return { period, secondsRemainingInPeriod, scoreDiff: scoreDiffExplicit };
  }

  const s = getScores(g);
  const scoreDiff =
    s.home != null && s.away != null ? s.home - s.away : null;

  return { period, secondsRemainingInPeriod, scoreDiff };
}

function buildMarket(g: any): DeviationMarket {
  const closingHomeSpread =
    toNum(g?.closingSpreadHome) ??
    toNum(g?.closingHomeSpread) ??
    toNum(g?.closing_spread_home) ??
    toNum(g?.market?.closingHomeSpread) ??
    null;

  const liveHomeSpread =
    toNum(g?.liveSpreadHome) ??
    toNum(g?.liveHomeSpread) ??
    toNum(g?.live_spread_home) ??
    toNum(g?.market?.liveHomeSpread) ??
    null;

  return { closingHomeSpread, liveHomeSpread };
}

/**
 * Best-effort adapter around unknown spreadIndex shape.
 * We try a few common method names and return:
 *  - meanExpectedFinalMargin (home)
 *  - stdDevFinalMargin
 */
function estimateFromIndex(
  spreadIndex: any,
  state: DeviationState,
  market: DeviationMarket
): { mean: number | null; std: number | null } {
  if (!spreadIndex) return { mean: null, std: null };

  const payload = { state, market };

  // 1) expectedFinalMargin({state, market})
  if (typeof spreadIndex.expectedFinalMargin === "function") {
    try {
      const out = spreadIndex.expectedFinalMargin(payload);
      const mean =
        toNum(out?.mean) ??
        toNum(out?.expected) ??
        toNum(out?.expectedFinalHomeMargin) ??
        toNum(out);
      const std = toNum(out?.std) ?? toNum(out?.stdev) ?? toNum(out?.sigma) ?? null;
      return { mean, std };
    } catch {
      // ignore
    }
  }

  // 2) predict({state, market})
  if (typeof spreadIndex.predict === "function") {
    try {
      const out = spreadIndex.predict(payload);
      const mean =
        toNum(out?.mean) ??
        toNum(out?.expected) ??
        toNum(out?.expectedFinalHomeMargin) ??
        toNum(out);
      const std = toNum(out?.std) ?? toNum(out?.stdev) ?? toNum(out?.sigma) ?? null;
      return { mean, std };
    } catch {
      // ignore
    }
  }

  // 3) query(state, market) or lookup(state, market)
  const maybeFn =
    (typeof spreadIndex.query === "function" && spreadIndex.query) ||
    (typeof spreadIndex.lookup === "function" && spreadIndex.lookup) ||
    null;

  if (maybeFn) {
    try {
      const out = maybeFn(state, market);

      // If out looks like a distribution summary
      const mean =
        toNum(out?.mean) ??
        toNum(out?.expected) ??
        toNum(out?.expectedFinalHomeMargin) ??
        null;

      const std =
        toNum(out?.std) ?? toNum(out?.stdev) ?? toNum(out?.sigma) ?? null;

      if (mean != null || std != null) return { mean, std };

      // If out is an array of samples, try to compute mean/std from `finalMargin` or similar
      if (Array.isArray(out) && out.length > 0) {
        const vals = out
          .map((x: any) => toNum(x?.finalHomeMargin ?? x?.finalMargin ?? x?.y ?? x))
          .filter((v: any) => typeof v === "number" && Number.isFinite(v)) as number[];

        if (vals.length === 0) return { mean: null, std: null };

        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        const varSum = vals.reduce((a, b) => a + (b - m) * (b - m), 0);
        const sd = Math.sqrt(varSum / Math.max(1, vals.length - 1));
        return { mean: m, std: sd };
      }
    } catch {
      // ignore
    }
  }

  return { mean: null, std: null };
}

export function computeDeviation(g: any, opts: ComputeDeviationOptions = {}): DeviationResult {
  const state = buildState(g);
  const market = buildMarket(g);

  const impliedFinalHomeMargin =
    market.liveHomeSpread != null ? -market.liveHomeSpread : null;

  const est = estimateFromIndex(opts.spreadIndex, state, market);

  // If we can't estimate, fall back to "no signal" rather than guessing.
  const expectedFinalHomeMargin = est.mean;

  const expectationGap =
    expectedFinalHomeMargin != null && impliedFinalHomeMargin != null
      ? expectedFinalHomeMargin - impliedFinalHomeMargin
      : 0;

  const absGap = Math.abs(expectationGap);

  // Conservative std fallback if index doesn't provide one.
  // Keep this mild; used only for zGap display/thresholding if desired.
  const stdFallback = 7; // typical NBA margin variability scale
  const gapStdDev =
    est.std != null && Number.isFinite(est.std) && est.std > 0.25
      ? est.std
      : null;

  const denom = gapStdDev ?? stdFallback;
  const zGap = denom > 0 ? clamp(expectationGap / denom, -6, 6) : 0;

  return {
    expectedFinalHomeMargin,
    impliedFinalHomeMargin,
    expectationGap,
    absGap,

    gapStdDev,
    zGap,

    // Back-compat placeholders (we no longer use them as primary)
    zSpread: 0,
    zTotal: 0,

    state,
    market,
  };
}