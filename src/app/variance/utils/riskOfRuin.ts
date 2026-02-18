export function calculateRiskOfRuin(
  winRate: number,
  riskPerTrade: number
): number {
  const p = clamp01(winRate);
  const q = 1 - p;
  const f = clamp01(riskPerTrade);

  if (f <= 0) return 0;
  if (p <= 0.5) return 1;

  const capitalUnits = 1 / f;
  const ror = Math.pow(q / p, capitalUnits);

  return clamp01(ror);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
