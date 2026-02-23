import { VolLevel } from "./types";

export function computeHorizon(
  vol: VolLevel,
  riskPerTrade: number
): number {
  const base =
    vol === "LOW"
      ? 300
      : vol === "MED"
      ? 200
      : vol === "HIGH"
      ? 120
      : 60;

  // Risk compresses horizon
  const adjustment = Math.pow(0.02 / riskPerTrade, 0.35);

  const clamped = Math.min(1.4, Math.max(0.6, adjustment));

  return Math.round(base * clamped);
}