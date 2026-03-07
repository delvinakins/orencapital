// src/lib/labs/ufc/elo.ts
// Standard Elo rating engine for UFC fighters.

export const DEFAULT_ELO = 1500;
export const K_FACTOR = 32;

/** Expected score for fighter A against fighter B. Range: 0–1. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** New ratings after a fight. */
export function updateElo(
  winnerElo: number,
  loserElo: number,
  k: number = K_FACTOR
): { winnerNew: number; loserNew: number } {
  const exp = expectedScore(winnerElo, loserElo);
  return {
    winnerNew: Math.round((winnerElo + k * (1 - exp)) * 10) / 10,
    loserNew: Math.round((loserElo + k * (0 - (1 - exp))) * 10) / 10,
  };
}

/** Convert American moneyline to implied win probability (includes vig). */
export function americanToImpliedProb(american: number): number | null {
  if (!Number.isFinite(american)) return null;
  if (american > 0) return 100 / (american + 100);
  if (american < 0) return Math.abs(american) / (Math.abs(american) + 100);
  return null;
}

/** Elo-implied win probability for fighter A vs fighter B. */
export function eloWinProb(ratingA: number, ratingB: number): number {
  return expectedScore(ratingA, ratingB);
}

/**
 * Hype tax: market-implied probability minus Elo-implied probability.
 * Positive => market overprices fighter A (market says they're better than Elo does).
 * Negative => market underprices fighter A.
 */
export function hypeTax(marketProb: number, eloProb: number): number {
  return marketProb - eloProb;
}
