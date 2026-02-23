import type { SimulationInputs, SimulationResult, VolLevel } from "./types";

/**
 * Resample an array y[0..(n-1)] to length m using linear interpolation.
 * Guarantees constant-length bands for stable SVG morphing.
 */
function resampleLinear(y: number[], m: number) {
  const n = y.length;
  if (m <= 0) return [];
  if (n === 0) return new Array(m).fill(1);
  if (n === 1) return new Array(m).fill(y[0]);

  const out = new Array<number>(m);
  const maxI = n - 1;

  for (let i = 0; i < m; i++) {
    const t = m === 1 ? 0 : i / (m - 1);
    const x = t * maxI;
    const x0 = Math.floor(x);
    const x1 = Math.min(maxI, x0 + 1);
    const a = x - x0;

    const v0 = y[x0];
    const v1 = y[x1];
    out[i] = v0 + (v1 - v0) * a;
  }

  return out;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function randn(rng: () => number) {
  // Box–Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function makeRng(seed: number) {
  // Mulberry32
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function volSigma(level: VolLevel) {
  // Regime intensity multiplier for outcome dispersion.
  if (level === "LOW") return 0.55;
  if (level === "MED") return 0.85;
  if (level === "HIGH") return 1.15;
  return 1.55; // EXTREME
}

function horizonFromInputs(riskPerTrade: number, volLevel: VolLevel) {
  // Dynamic horizon in trades. Higher vol + higher risk compress horizon.
  const base = 220;
  const vol = volSigma(volLevel);
  const risk = clamp(riskPerTrade, 0.0005, 0.10);

  const volFactor = 1 / (1 + 0.9 * (vol - 0.55)); // LOW≈1, EXT≈~0.52
  const riskFactor = 1 / (1 + 18 * risk);         // 1%->~0.85, 3%->~0.65, 5%->~0.53

  const h = Math.round(base * volFactor * riskFactor);
  return clamp(h, 40, 260);
}

function percentile(sorted: number[], p: number) {
  const n = sorted.length;
  if (n === 0) return 1;
  if (n === 1) return sorted[0];
  const x = (n - 1) * p;
  const i = Math.floor(x);
  const j = Math.min(n - 1, i + 1);
  const a = x - i;
  return sorted[i] + (sorted[j] - sorted[i]) * a;
}

export function simulate(inputs: SimulationInputs): SimulationResult {
  const paths = Math.max(250, Math.min(10000, Math.floor(inputs.paths || 1500)));

  const riskPerTrade = clamp(inputs.riskPerTrade, 0.0005, 0.10);
  const winRate = clamp(inputs.winRate, 0.01, 0.99);
  const avgR = clamp(inputs.avgR, 0.1, 10);

  const horizon = horizonFromInputs(riskPerTrade, inputs.volLevel);
  const sigma = volSigma(inputs.volLevel);

  // Collect equity across paths at each time step to build percentile bands
  const eqAtT: number[][] = Array.from({ length: horizon + 1 }, () => new Array(paths).fill(1));

  let ddHits = 0;

  // Deterministic-ish seed from inputs (stable feel)
  const seed =
    Math.floor(riskPerTrade * 1e6) ^
    Math.floor(winRate * 1e6) ^
    Math.floor(avgR * 1e4) ^
    (inputs.volLevel === "LOW" ? 11 : inputs.volLevel === "MED" ? 22 : inputs.volLevel === "HIGH" ? 33 : 44) ^
    (paths << 1);

  for (let p = 0; p < paths; p++) {
    const rng = makeRng(seed + p * 1013);

    let eq = 1.0;
    let peak = 1.0;
    let hit = false;

    eqAtT[0][p] = 1.0;

    for (let t = 1; t <= horizon; t++) {
      const isWin = rng() < winRate;

      // Mild dispersion to reflect regime instability (kept V1-simple)
      const noise = randn(rng) * 0.35 * sigma;

      const r = isWin ? Math.max(0, avgR + noise) : -Math.max(0, 1 + noise * 0.6);

      // Fractional risk applied to equity
      eq = eq * (1 + riskPerTrade * r);

      // Visualization floor
      eq = Math.max(0.02, eq);

      peak = Math.max(peak, eq);
      const dd = 1 - eq / peak;

      if (!hit && dd >= 0.5) hit = true;

      eqAtT[t][p] = eq;
    }

    if (hit) ddHits += 1;
  }

  // Percentile bands per step
  const p05: number[] = new Array(horizon + 1);
  const p25: number[] = new Array(horizon + 1);
  const p50: number[] = new Array(horizon + 1);
  const p75: number[] = new Array(horizon + 1);
  const p95: number[] = new Array(horizon + 1);

  for (let t = 0; t <= horizon; t++) {
    const arr = eqAtT[t].slice().sort((a, b) => a - b);
    p05[t] = percentile(arr, 0.05);
    p25[t] = percentile(arr, 0.25);
    p50[t] = percentile(arr, 0.5);
    p75[t] = percentile(arr, 0.75);
    p95[t] = percentile(arr, 0.95);
  }

  // Fixed resolution to eliminate cone jitter when horizon changes
  const RES = 121;

  return {
    dd50Risk: ddHits / paths,
    horizonTrades: horizon,
    bands: {
      p05: resampleLinear(p05, RES),
      p25: resampleLinear(p25, RES),
      p50: resampleLinear(p50, RES),
      p75: resampleLinear(p75, RES),
      p95: resampleLinear(p95, RES),
    },
  };
}