export type GameClockState = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;

  // live
  homeScore: number;
  awayScore: number;
  period: number;            // 1-4, 5+ for OT
  secondsRemaining: number;  // remaining in current period, or total remaining (pick one later)
  possession?: "HOME" | "AWAY" | "UNKNOWN";

  // close (consensus)
  closingSpreadHome: number; // e.g. home -4.5 => -4.5 (home is favored)
  closingTotal: number;      // e.g. 232.5

  // optional later
  strengthBucket?: "ELITE" | "GOOD" | "AVG" | "WEAK";
};

export type DeviationResult = {
  // Signed “margin vs expectation” proxy we’ll define properly later.
  // Positive means home performing better than expected vs close.
  spreadDelta: number;

  // Signed “points vs expectation” proxy.
  // Positive means more points than expected vs close.
  totalDelta: number;

  // Placeholder z-scores (later computed from conditional distributions)
  zSpread: number;
  zTotal: number;

  // For UI coloring
  heat: "GREEN" | "YELLOW" | "RED";
};

/**
 * MVP v0:
 * - spreadDelta: (homeMargin) - (expectedHomeMarginFromClose)
 * - totalDelta: (liveTotalPoints) - (expectedTotalFromCloseSoFar)
 *
 * For now we can’t compute true expectations without historical conditional models,
 * so we return deltas and stub z-scores.
 */
export function computeDeviation(game: GameClockState): DeviationResult {
  const homeMargin = game.homeScore - game.awayScore;

  // closingSpreadHome is negative if home favored (home -4.5 => -4.5)
  // expected “final margin” proxy = -closingSpreadHome
  const expectedFinalHomeMargin = -game.closingSpreadHome;

  // crude proxy until we add time-remaining model
  const spreadDelta = homeMargin - expectedFinalHomeMargin;

  const liveTotalPoints = game.homeScore + game.awayScore;

  // crude proxy: compare live total to closing total (not time-adjusted yet)
  const totalDelta = liveTotalPoints - game.closingTotal;

  // Stub z-scores (we’ll replace with conditional sigma by time/possession/bucket)
  const zSpread = 0;
  const zTotal = 0;

  // Simple placeholder heat logic: will be replaced by z-score thresholds
  const heat: DeviationResult["heat"] =
    Math.abs(spreadDelta) >= 10 || Math.abs(totalDelta) >= 12 ? "GREEN" : Math.abs(spreadDelta) >= 6 ? "YELLOW" : "RED";

  return { spreadDelta, totalDelta, zSpread, zTotal, heat };
}
