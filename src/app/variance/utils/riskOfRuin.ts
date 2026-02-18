export function calculateRiskOfRuin(
  winRate: number, // 0..1
  riskPerTrade: number, // 0..1
  avgR: number // avg win measured in R (e.g. 1.2 means +1.2R on wins)
): number {
  const p = clamp01(winRate);
  const f = clamp01(riskPerTrade);
  const b = Number.isFinite(avgR) && avgR > 0 ? avgR : 1;

  if (f <= 0) return 0;

  // If expected value in R-units is <= 0, long-run ruin probability ~ 1
  // EV = p*b - (1-p)
  const ev = p * b - (1 - p);
  if (ev <= 0) return 1;

  // Convert to an "effective" win probability in equal-step space
  // so we can use a classic approximation.
  // This maps asymmetric payoff (b) into a comparable p*.
  const pStar = (p * b) / (p * b + (1 - p));
  const qStar = 1 - pStar;

  // Approx number of full risk units in bankroll
  const capitalUnits = 1 / f;

  const ror = Math.pow(qStar / pStar, capitalUnits);
  return clamp01(ror);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
