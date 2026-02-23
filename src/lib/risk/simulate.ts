import { SimulationInputs, SimulationResult } from "./types";
import { computeHorizon } from "./horizon";
import { percentile } from "./stats";

export function simulateMonteCarlo(
  inputs: SimulationInputs
): SimulationResult {
  const { riskPerTrade, winRate, avgR, paths } = inputs;

  const horizon = computeHorizon(inputs.volLevel, riskPerTrade);

  const equityMatrix: number[][] = [];
  let ddHits = 0;

  for (let i = 0; i < paths; i++) {
    let equity = 1;
    const path: number[] = [1];
    let hit = false;

    for (let t = 0; t < horizon; t++) {
      const win = Math.random() < winRate;

      const tradeReturn = win
        ? avgR * riskPerTrade
        : -1 * riskPerTrade;

      equity = equity * (1 + tradeReturn);

      if (!hit && equity <= 0.5) {
        hit = true;
        ddHits++;
      }

      path.push(equity);
    }

    equityMatrix.push(path);
  }

  // Build percentile bands
  const p05: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p95: number[] = [];

  for (let t = 0; t <= horizon; t++) {
    const slice = equityMatrix.map((p) => p[t]).sort((a, b) => a - b);

    p05.push(percentile(slice, 0.05));
    p25.push(percentile(slice, 0.25));
    p50.push(percentile(slice, 0.5));
    p75.push(percentile(slice, 0.75));
    p95.push(percentile(slice, 0.95));
  }

  return {
    dd50Risk: ddHits / paths,
    horizonTrades: horizon,
    bands: { p05, p25, p50, p75, p95 },
  };
}