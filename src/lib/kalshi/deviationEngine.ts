// src/lib/kalshi/deviationEngine.ts
// Oren Capital — Prediction Market Deviation Engine
// Math: EWMA baseline, Z-score, confidence weighting, Oren Edge

export interface Candle {
  ts: number;   // unix seconds
  close: number; // cents (0–100)
}

export interface MarketQuote {
  yesBid: number | null;
  yesAsk: number | null;
  yesBidQty?: number;
  noBidQty?: number;
}

export interface DeviationResult {
  // Raw inputs
  pMkt: number | null;        // current implied probability (0–1)
  mu: number | null;          // EWMA baseline probability (0–1)
  sigma: number | null;       // historical std dev of probability series
  // Deviation
  rawD: number | null;        // pMkt - mu (probability points)
  zScore: number | null;      // (pMkt - mu) / (sigma + ε)
  // Liquidity
  spread: number | null;      // cents
  confidence: number;         // w ∈ [0,1]
  // Final scores
  edgePP: number | null;      // 100 * w * (pMkt - mu)  — percentage points
  edgeZ: number | null;       // w * zScore             — cross-market comparable
  // Label
  label: DeviationLabel;
  candleCount: number;
}

export type DeviationLabel = "Extreme" | "High" | "Notable" | "Normal" | "Insufficient Data";

// ── Constants ────────────────────────────────────────────────────────────────
const EWMA_ALPHA = 0.25;          // decay: higher = more reactive
const EPSILON = 0.005;            // prevent div/0 in silent markets
const SPREAD_MAX_CENTS = 10;      // spread >= this → w_spr = 0
const DEPTH_REF_QTY = 50;        // reference quantity for depth weight
const MIN_CANDLES = 6;            // minimum candles needed for a valid signal
const CONFIDENCE_THRESHOLD = 0.4; // below this → label as insufficient

// ── Mid price from orderbook ─────────────────────────────────────────────────
export function calcMid(q: MarketQuote): number | null {
  const { yesBid, yesAsk } = q;
  if (yesBid != null && yesAsk != null) return (yesBid + yesAsk) / 2;
  if (yesBid != null) return yesBid;
  if (yesAsk != null) return yesAsk;
  return null;
}

export function calcSpread(q: MarketQuote): number | null {
  const { yesBid, yesAsk } = q;
  if (yesBid == null || yesAsk == null) return null;
  return Math.max(0, yesAsk - yesBid);
}

// ── EWMA baseline ─────────────────────────────────────────────────────────────
// Returns μ as final EWMA value over probability series
export function calcEWMABaseline(probs: number[], alpha = EWMA_ALPHA): number | null {
  if (!probs.length) return null;
  let mu = probs[0];
  for (let i = 1; i < probs.length; i++) {
    mu = alpha * probs[i] + (1 - alpha) * mu;
  }
  return mu;
}

// ── Historical σ ──────────────────────────────────────────────────────────────
export function calcSigma(probs: number[], mu: number): number {
  if (probs.length < 2) return 0;
  const variance =
    probs.reduce((sum, p) => sum + Math.pow(p - mu, 2), 0) / (probs.length - 1);
  return Math.sqrt(variance);
}

// ── Confidence weight ─────────────────────────────────────────────────────────
export function calcConfidence(
  spread: number | null,
  yesBidQty?: number,
  noBidQty?: number
): number {
  // Spread penalty
  const spr = spread ?? SPREAD_MAX_CENTS;
  const wSpr = Math.max(0, Math.min(1, 1 - spr / SPREAD_MAX_CENTS));

  // Depth penalty (optional — skip if quantities unavailable)
  let wDepth = 1;
  if (yesBidQty != null && noBidQty != null) {
    const minQty = Math.min(yesBidQty, noBidQty);
    wDepth = Math.max(0, Math.min(1, minQty / DEPTH_REF_QTY));
  }

  return wSpr * wDepth;
}

// ── Deviation label ───────────────────────────────────────────────────────────
export function getLabel(zScore: number | null, confidence: number): DeviationLabel {
  if (zScore == null || confidence < CONFIDENCE_THRESHOLD) return "Insufficient Data";
  const abs = Math.abs(zScore);
  if (abs >= 1.5) return "Extreme";
  if (abs >= 1.0) return "High";
  if (abs >= 0.5) return "Notable";
  return "Normal";
}

// ── Main engine ───────────────────────────────────────────────────────────────
export function runDeviationEngine(
  candles: Candle[],
  quote: MarketQuote
): DeviationResult {
  // Convert candle closes (cents) → probabilities (0–1)
  const probs = candles.map((c) => c.close / 100);

  const mid = calcMid(quote);
  const spread = calcSpread(quote);
  const pMkt = mid != null ? mid / 100 : null;

  const mu = probs.length >= MIN_CANDLES ? calcEWMABaseline(probs) : null;
  const sigma = mu != null && probs.length >= MIN_CANDLES ? calcSigma(probs, mu) : null;

  const rawD = pMkt != null && mu != null ? pMkt - mu : null;
  const zScore =
    rawD != null && sigma != null ? rawD / (sigma + EPSILON) : null;

  const confidence = calcConfidence(spread, quote.yesBidQty, quote.noBidQty);

  const edgePP = rawD != null ? 100 * confidence * rawD : null;
  const edgeZ = zScore != null ? confidence * zScore : null;

  const label = getLabel(zScore, confidence);

  return {
    pMkt,
    mu,
    sigma,
    rawD,
    zScore,
    spread,
    confidence,
    edgePP,
    edgeZ,
    label,
    candleCount: candles.length,
  };
}

// ── Utility: sort markets by |edgeZ| descending ───────────────────────────────
export function sortByEdge<T extends { result: DeviationResult }>(markets: T[]): T[] {
  return [...markets].sort((a, b) => {
    const az = Math.abs(a.result.edgeZ ?? 0);
    const bz = Math.abs(b.result.edgeZ ?? 0);
    return bz - az;
  });
}

// ── Utility: normalize candle series 0→100 for sparkline ─────────────────────
export function normalizeSparkline(candles: Candle[]): Array<{ ts: number; v: number }> {
  if (candles.length < 2) return candles.map((c) => ({ ts: c.ts, v: c.close }));
  const vals = candles.map((c) => c.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  if (span <= 0) return candles.map((c) => ({ ts: c.ts, v: 50 }));
  return candles.map((c) => ({ ts: c.ts, v: ((c.close - min) / span) * 100 }));
}