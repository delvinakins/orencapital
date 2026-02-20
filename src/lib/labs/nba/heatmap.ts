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

  // Internal numeric scores used for ranking + coloring
  // (UI should describe them in plain language; not “z-score”.)
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

    // Fallback (non-model) context — safe + non-proprietary
    progress01?: number;
    spreadScale?: number;
    totalScale?: number;
    expectedPointsSoFar?: number;
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * We treat regulation as 48 minutes:
 * - 4 quarters * 12 minutes * 60 seconds
 * OT is clamped to “late game” behavior.
 */
function estimateRegulationSecondsRemaining(period: number, secondsRemainingInPeriod: number) {
  const p = Number.isFinite(period) ? period : 1;
  const s = Number.isFinite(secondsRemainingInPeriod) ? secondsRemainingInPeriod : 0;

  if (p >= 5) return 0; // OT => effectively "late"

  const periodsAfter = clamp(4 - p, 0, 3);
  const total = periodsAfter * 12 * 60 + clamp(s, 0, 12 * 60);
  return clamp(total, 0, 48 * 60);
}

function progress01(period: number, secondsRemainingInPeriod: number) {
  const remaining = estimateRegulationSecondsRemaining(period, secondsRemainingInPeriod);
  const total = 48 * 60;
  const elapsed = total - remaining;
  return clamp(elapsed / total, 0, 1);
}

function heatFromAbsScore(abs: number): DeviationResult["heat"] {
  // Calm defaults: "RED" means "within expected range" (UI should not render harsh red blocks).
  if (!Number.isFinite(abs)) return "RED";
  if (abs >= 1.5) return "GREEN";
  if (abs >= 1.0) return "YELLOW";
  return "RED";
}

/**
 * Deviation engine:
 * - Spread:
 *    - If we have liveSpreadHome + spreadIndex => use conditional model (scoreDeviation)
 *    - Else => fallback to a time-adjusted “unusual move” score based on the scoreboard
 * - Total:
 *    - Time-adjusted expectation from closingTotal (simple + stable)
 *
 * IMPORTANT:
 * This module stays pure (no fetch, no env).
 */
export function computeDeviation(
  game: GameClockState,
  ctx: DeviationEngineContext = {}
): DeviationResult {
  const homeScore = safeNum(game.homeScore) ?? 0;
  const awayScore = safeNum(game.awayScore) ?? 0;

  const closingSpreadHome = safeNum(game.closingSpreadHome) ?? 0;
  const closingTotal = safeNum(game.closingTotal) ?? 0;

  const period = safeNum(game.period) ?? 1;
  const secondsRemaining = safeNum(game.secondsRemaining) ?? 0;

  const homeMargin = homeScore - awayScore;

  // closingSpreadHome is negative if home favored (home -4.5 => -4.5)
  // expected “final margin” proxy = -closingSpreadHome
  const expectedFinalHomeMargin = -closingSpreadHome;

  // Proxy (kept for UX continuity): “how far margin is from close”
  const spreadDelta = homeMargin - expectedFinalHomeMargin;

  const liveTotalPoints = homeScore + awayScore;

  // Time-adjusted totals expectation (simple, non-secret):
  // expected points so far ≈ closingTotal * progress
  const prog = progress01(period, secondsRemaining);
  const expectedPointsSoFar = closingTotal * prog;

  // Proxy (improved): points vs expected points so far
  const totalDelta = liveTotalPoints - expectedPointsSoFar;

  // Default
  let zSpread = 0;
  let zTotal = 0;

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

    score = scoreDeviation(ctx.spreadIndex as DistributionIndex, state, market, {
      priorWeight: 40,
      stdevFloor: 0.6,
      mildZ: 1.0,
      elevatedZ: 1.5,
      extremeZ: 2.0,
    });

    zSpread = Number.isFinite(score.z) ? score.z : 0;
  } else {
    /**
     * Fallback spread score (non-model):
     * - early game swings are “noisier” => we down-weight early
     * - late game swings matter more => we up-weight late
     * - larger spreads get a slightly wider “normal range”
     */
    const timeWeight = 0.75 + 1.25 * prog; // 0.75 early -> 2.0 late
    const spreadScale = (3.75 + Math.abs(closingSpreadHome) * 0.15) / timeWeight; // points per unit

    zSpread = spreadScale > 0 ? spreadDelta / spreadScale : 0;
  }

  /**
   * Total score (simple + stable):
   * - use time-adjusted expectation from close
   * - normalize by a gentle scale that tightens late game
   */
  const timeWeightForTotal = 0.75 + 1.25 * prog;
  const totalScale = (10.0 + Math.abs(closingTotal - 220) * 0.02) / timeWeightForTotal;

  zTotal = totalScale > 0 ? totalDelta / totalScale : 0;
  if (!Number.isFinite(zTotal)) zTotal = 0;

  // Heat uses whichever score is “more unusual” right now
  const abs = Math.max(Math.abs(zSpread), Math.abs(zTotal));
  const heat = heatFromAbsScore(abs);

  return {
    spreadDelta,
    totalDelta,
    zSpread: Number.isFinite(zSpread) ? zSpread : 0,
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
      : {
          usedModel: false,
          progress01: prog,
          spreadScale: (3.75 + Math.abs(closingSpreadHome) * 0.15) / (0.75 + 1.25 * prog),
          totalScale,
          expectedPointsSoFar,
        },
  };
}