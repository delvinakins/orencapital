// src/lib/labs/nba/heatmap.ts
/**
 * NBA Heat Map signal (institutional, calm)
 *
 * Primary: "Market dislocation" = (live - close) - expectedMove
 * where expectedMove comes from conditional distributions + shrinkage (deviation-engine).
 *
 * This keeps UI focused on: "is the market moving unusually vs what it typically does here?"
 *
 * Pure functions only. Safe to import anywhere.
 */

import type { DistributionIndex, NBAGameState, MarketSnapshot } from "@/lib/nba/deviation-engine";
import { scoreDeviation } from "@/lib/nba/deviation-engine";

export type ComputeDeviationOptions = {
  spreadIndex: DistributionIndex;
};

export type DeviationResult = {
  // Core engine outputs
  expectedMove: number;     // expected (live - close)
  observedMove: number;     // actual (live - close)
  stdevUsed: number;
  z: number;
  absZ: number;
  tier: "none" | "mild" | "elevated" | "extreme";
  label: string;

  // Primary UI signal (points)
  dislocationPts: number;   // (observed - expected)
  absDislocationPts: number;

  // passthrough (useful for debugging server logs; do not show raw objects to users)
  state: NBAGameState;
  market: MarketSnapshot;
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

function buildState(g: any): NBAGameState {
  const period = toInt(g?.period) ?? toInt(g?.state?.period) ?? 1;

  // Your mock feed uses `secondsRemaining` (per period). Keep that as first choice.
  const secondsRemainingInPeriod =
    toInt(g?.secondsRemaining) ??
    toInt(g?.secondsRemainingInPeriod) ??
    toInt(g?.state?.secondsRemainingInPeriod) ??
    0;

  // Prefer explicit scoreDiff if present; else compute from scores if available; else 0.
  const scoreDiffExplicit =
    toInt(g?.scoreDiff) ??
    toInt(g?.state?.scoreDiff) ??
    null;

  if (scoreDiffExplicit != null) {
    return {
      period: Math.max(1, period),
      secondsRemainingInPeriod: clamp(secondsRemainingInPeriod, 0, 60 * 12),
      scoreDiff: scoreDiffExplicit,
    };
  }

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

  const scoreDiff = home != null && away != null ? home - away : 0;

  return {
    period: Math.max(1, period),
    secondsRemainingInPeriod: clamp(secondsRemainingInPeriod, 0, 60 * 12),
    scoreDiff,
  };
}

function buildMarket(g: any): MarketSnapshot {
  const liveHomeSpread =
    toNum(g?.liveSpreadHome) ??
    toNum(g?.liveHomeSpread) ??
    toNum(g?.market?.liveHomeSpread) ??
    toNum(g?.live_spread_home) ??
    null;

  const closingHomeSpread =
    toNum(g?.closingSpreadHome) ??
    toNum(g?.closingHomeSpread) ??
    toNum(g?.market?.closingHomeSpread) ??
    toNum(g?.closing_spread_home) ??
    null;

  return {
    liveHomeSpread: liveHomeSpread ?? 0,
    closingHomeSpread: closingHomeSpread ?? 0,
  };
}

export function computeDeviation(g: any, opts: ComputeDeviationOptions): DeviationResult {
  const state = buildState(g);
  const market = buildMarket(g);

  const scored = scoreDeviation(opts.spreadIndex, state, market);

  const observedMove =
    Number.isFinite(scored.observedDeviation) ? scored.observedDeviation : 0;

  const expectedMove =
    Number.isFinite(scored.expectedDeviation) ? scored.expectedDeviation : 0;

  const dislocationPts = observedMove - expectedMove;
  const absDislocationPts = Math.abs(dislocationPts);

  return {
    expectedMove,
    observedMove,
    stdevUsed: scored.stdevUsed,
    z: clamp(scored.z, -6, 6),
    absZ: clamp(scored.absZ, 0, 6),
    tier: scored.tier,
    label: scored.label,

    dislocationPts,
    absDislocationPts,

    state,
    market,
  };
}