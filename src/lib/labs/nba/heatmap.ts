import type {
  DistributionIndex,
  NBAGameState,
  MarketSnapshot,
  DeviationScore,
} from "@/lib/nba/deviation-engine";
import { scoreDeviation } from "@/lib/nba/deviation-engine";

export type GameClockState = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;

  // live scoreboard state
  homeScore: number;
  awayScore: number;
  period: number; // 1-4, 5+ for OT
  secondsRemaining: number; // remaining in current period (recommended)
  possession?: "HOME" | "AWAY" | "UNKNOWN";

  // close (consensus)
  closingSpreadHome: number; // e.g. home -4.5 => -4.5 (home is favored)
  closingTotal: number; // e.g. 232.5

  /**
   * OPTIONAL (recommended when feed is ready):
   * Live spread for home, same convention as closingSpreadHome.
   * Example: home -2.5 => -2.5
   */
  liveSpreadHome?: number;

  /**
   * OPTIONAL (later):
   * Live total line (if you want to model totals similarly).
   */
  liveTotal?: number;

  // optional later
  strengthBucket?: "ELITE" | "GOOD" | "AVG" | "WEAK";
};

export type DeviationResult = {
  // Signed “margin vs expectation” proxy (kept for continuity + UX even after z-score exists).
  // Positive means home performing better than expected vs close (proxy).
  spreadDelta: number;

  // Signed “points vs expectation” proxy.
  // Positive means more points than expected vs close (proxy).
  totalDelta: number;

  // Statistical z-scores (spread uses conditional model if provided; total still stubbed).
  zSpread: number;
  zTotal: number;

  // For UI coloring (existing enum; UI can render calmly)
  heat: "GREEN" | "YELLOW" | "RED";

  // Optional debug metadata for dev tools / inspect panels (not required by UI)
  meta?: {
    usedModel: boolean;
    keyUsed?: string;
    nUsed?: number;
    expectedDeviation?: number;
    observedDeviation?: number;
    stdevUsed?: number;
    tier?: string;
    label?: string;
  };
};

export type DeviationEngineContext = {
  /**
   * Conditional distribution index for spread deviation:
   * deviation = (liveHomeSpread - closingHomeSpread)
   */
  spreadIndex?: DistributionIndex;

  /**
   * Reserved for later: conditional distribution index for totals deviation.
   */
  totalIndex?: DistributionIndex;
};

function heatFromAbsZ(absZ: number): DeviationResult["heat"] {
  // Calm defaults: "RED" means "within expected range" (UI should not render harsh red blocks).
  if (!Number.isFinite(absZ)) return "RED";
  if (absZ >= 1.5) return "GREEN";
  if (absZ >= 1.0) return "YELLOW";
  return "RED";
}

/**
 * Deviation engine:
 * - Spread: use conditional model when we have liveSpreadHome + a spreadIndex
 * - Total: still proxy (until we build a totals model)
 *
 * IMPORTANT:
 * This module stays pure (no fetch, no env).
 * You can pass in the index from server code or a cached module later.
 */
export function computeDeviation(
  game: GameClockState,
  ctx: DeviationEngineContext = {}
): DeviationResult {
  const homeMargin = game.homeScore - game.awayScore;

  // closingSpreadHome is negative if home favored (home -4.5 => -4.5)
  // expected “final margin” proxy = -closingSpreadHome
  const expectedFinalHomeMargin = -game.closingSpreadHome;

  // Proxy until we have a proper time/pace model for "expected margin so far"
  const spreadDelta = homeMargin - expectedFinalHomeMargin;

  const liveTotalPoints = game.homeScore + game.awayScore;

  // Proxy: compare live points to closing total (not time-adjusted)
  const totalDelta = liveTotalPoints - game.closingTotal;

  // Default stubs
  let zSpread = 0;
  let zTotal = 0;

  // Keep existing behavior unless we can compute a real spread z-score
  const canModelSpread =
    typeof game.liveSpreadHome === "number" &&
    Number.isFinite(game.liveSpreadHome) &&
    !!ctx.spreadIndex;

  let score: DeviationScore | null = null;

  if (canModelSpread) {
    const state: NBAGameState = {
      period: game.period,
      secondsRemainingInPeriod: game.secondsRemaining,
      scoreDiff: homeMargin,
    };

    const market: MarketSnapshot = {
      liveHomeSpread: game.liveSpreadHome as number,
      closingHomeSpread: game.closingSpreadHome,
    };

    // Conservative defaults baked into scoreDeviation; you can tune later.
    score = scoreDeviation(ctx.spreadIndex as DistributionIndex, state, market, {
      priorWeight: 40,
      stdevFloor: 0.6,
      mildZ: 1.0,
      elevatedZ: 1.5,
      extremeZ: 2.0,
    });

    zSpread = Number.isFinite(score.z) ? score.z : 0;
  }

  // Heat: if model present, use absZ; else use proxy-based thresholds (your current logic)
  const heat: DeviationResult["heat"] = score
    ? heatFromAbsZ(score.absZ)
    : Math.abs(spreadDelta) >= 10 || Math.abs(totalDelta) >= 12
      ? "GREEN"
      : Math.abs(spreadDelta) >= 6
        ? "YELLOW"
        : "RED";

  return {
    spreadDelta,
    totalDelta,
    zSpread,
    zTotal,
    heat,
    meta: score
      ? {
          usedModel: true,
          keyUsed: score.keyUsed,
          nUsed: score.nUsed,
          expectedDeviation: score.expectedDeviation,
          observedDeviation: score.observedDeviation,
          stdevUsed: score.stdevUsed,
          tier: score.tier,
          label: score.label,
        }
      : { usedModel: false },
  };
}
