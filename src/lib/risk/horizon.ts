import type { VolLevel } from "./types";

export function computeHorizon(vol: VolLevel, riskPerTrade: number): number {
  // Wider separation so the user FEELS volatility immediately
  const base =
    vol === "LOW"
      ? 420
      : vol === "MED"
      ? 260
      : vol === "HIGH"
      ? 140
      : 70;

  // Risk compresses horizon (higher risk => less survivability window)
  const r = Math.max(1e-6, riskPerTrade);
  const adj = Math.pow(0.02 / r, 0.42); // slightly stronger than before
  const clamped = Math.min(1.5, Math.max(0.55, adj));

  return Math.round(base * clamped);
}