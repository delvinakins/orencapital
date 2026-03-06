// src/lib/kalshi/deviationEngine.ts
// Oren Capital — Prediction Market Deviation Engine
// V2: runModelEngine uses SPY realized vol + N(d2) digital option model

export interface Candle {
  ts: number;    // unix seconds
  close: number; // SPY price (~681) or probability cents (0–100)
}

export interface MarketQuote {
  yesBid: number | null;
  yesAsk: number | null;
  yesBidQty?: number;
  noBidQty?: number;
}

export interface DeviationResult {
  pMkt: number | null;        // Kalshi implied probability (0–1)
  pModel: number | null;      // model-derived probability (0–1)
  mu: number | null;          // EWMA baseline (history mode only)
  sigma: number | null;       // realized vol or historical std dev
  rawD: number | null;        // pMkt - pRef
  zScore: number | null;
  spread: number | null;
  confidence: number;
  edgePP: number | null;      // 100 * w * rawD
  edgeZ: number | null;       // w * zScore
  label: DeviationLabel;
  candleCount: number;
  scoringMode: "model" | "history";
}

export type DeviationLabel =
  | "Extreme"
  | "High"
  | "Notable"
  | "Normal"
  | "Insufficient Data";

// ── Constants ────────────────────────────────────────────────────────────────
const EWMA_ALPHA = 0.25;
const EPSILON = 0.005;
const SPREAD_MAX_CENTS = 10;
const DEPTH_REF_QTY = 50;
const MIN_CANDLES = 6;
const CONFIDENCE_THRESHOLD = 0.4;
const TRADING_HOURS_PER_DAY = 6.5;
const TRADING_DAYS_PER_YEAR = 252;

// ── Standard normal CDF (Abramowitz & Stegun) ────────────────────────────────
function normCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return 0.5 * (1 + sign * y);
}

// ── Realized daily log-return vol ────────────────────────────────────────────
export function calcRealizedVol(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const logReturns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    logReturns.push(Math.log(candles[i].close / candles[i - 1].close));
  }
  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
    (logReturns.length - 1);
  return Math.sqrt(variance); // daily σ
}

// ── Digital option probability via N(d2) ────────────────────────────────────
// strikeLow=null + strikeHigh=K  → "above K"
// strikeLow=K  + strikeHigh=null → "below K"
// strikeLow=Lo + strikeHigh=Hi   → "in range [Lo, Hi]"
export function calcModelProb(
  spot: number,
  dailyVol: number,
  hoursRemaining: number,
  strikeLow: number | null,
  strikeHigh: number | null
): number {
  const annualVol = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
  // Convert SPY to SPX-equivalent for strike comparison (SPY ≈ SPX / 10)
  const S = spot * 10;
  const T = Math.max(
    hoursRemaining / (TRADING_HOURS_PER_DAY * TRADING_DAYS_PER_YEAR),
    1 / (TRADING_HOURS_PER_DAY * TRADING_DAYS_PER_YEAR)
  );
  const sqrtT = Math.sqrt(T);

  const pAbove = (K: number) => {
    const d2 =
      (Math.log(S / K) - 0.5 * annualVol ** 2 * T) / (annualVol * sqrtT);
    return normCDF(d2);
  };

  if (strikeLow === null && strikeHigh !== null) return pAbove(strikeHigh);
  if (strikeHigh === null && strikeLow !== null) return 1 - pAbove(strikeLow);
  if (strikeLow !== null && strikeHigh !== null)
    return Math.max(0, pAbove(strikeLow) - pAbove(strikeHigh));
  return 0.5;
}

// ── Mid / spread ─────────────────────────────────────────────────────────────
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

// ── EWMA baseline ────────────────────────────────────────────────────────────
export function calcEWMABaseline(
  probs: number[],
  alpha = EWMA_ALPHA
): number | null {
  if (!probs.length) return null;
  let mu = probs[0];
  for (let i = 1; i < probs.length; i++) mu = alpha * probs[i] + (1 - alpha) * mu;
  return mu;
}

export function calcSigma(probs: number[], mu: number): number {
  if (probs.length < 2) return 0;
  const variance =
    probs.reduce((s, p) => s + (p - mu) ** 2, 0) / (probs.length - 1);
  return Math.sqrt(variance);
}

// ── Confidence weight ────────────────────────────────────────────────────────
export function calcConfidence(
  spread: number | null,
  yesBidQty?: number,
  noBidQty?: number
): number {
  const spr = spread ?? SPREAD_MAX_CENTS;
  const wSpr = Math.max(0, Math.min(1, 1 - spr / SPREAD_MAX_CENTS));
  let wDepth = 1;
  if (yesBidQty != null && noBidQty != null) {
    wDepth = Math.max(0, Math.min(1, Math.min(yesBidQty, noBidQty) / DEPTH_REF_QTY));
  }
  return wSpr * wDepth;
}

// ── Label ────────────────────────────────────────────────────────────────────
export function getLabel(
  zScore: number | null,
  confidence: number
): DeviationLabel {
  if (zScore == null || confidence < CONFIDENCE_THRESHOLD)
    return "Insufficient Data";
  const abs = Math.abs(zScore);
  if (abs >= 1.5) return "Extreme";
  if (abs >= 1.0) return "High";
  if (abs >= 0.5) return "Notable";
  return "Normal";
}

// ── Model engine: SPY vol + N(d2) → pModel → deviation vs Kalshi ────────────
export function runModelEngine(
  spyCandles: Candle[],
  quote: MarketQuote,
  strikeLow: number | null,
  strikeHigh: number | null,
  hoursRemaining: number
): DeviationResult {
  const mid = calcMid(quote);
  const spread = calcSpread(quote);
  const pMkt = mid != null ? mid / 100 : null;
  const confidence = calcConfidence(spread, quote.yesBidQty, quote.noBidQty);

  if (spyCandles.length < 2) {
    return {
      pMkt, pModel: null, mu: null, sigma: null,
      rawD: null, zScore: null, spread, confidence,
      edgePP: null, edgeZ: null,
      label: "Insufficient Data",
      candleCount: spyCandles.length,
      scoringMode: "model",
    };
  }

  const spot = spyCandles[spyCandles.length - 1].close;
  const dailyVol = calcRealizedVol(spyCandles);

  if (!dailyVol) {
    return {
      pMkt, pModel: null, mu: null, sigma: null,
      rawD: null, zScore: null, spread, confidence,
      edgePP: null, edgeZ: null,
      label: "Insufficient Data",
      candleCount: spyCandles.length,
      scoringMode: "model",
    };
  }

  const pModel = calcModelProb(spot, dailyVol, hoursRemaining, strikeLow, strikeHigh);
  const rawD = pMkt != null ? pMkt - pModel : null;

  // Z-score: normalize by daily vol scaled to probability space (heuristic: dailyVol / 8)
  const sigmaNorm = dailyVol / 8;
  const zScore = rawD != null ? rawD / (sigmaNorm + EPSILON) : null;

  const edgePP = rawD != null ? 100 * confidence * rawD : null;
  const edgeZ = zScore != null ? confidence * zScore : null;

  return {
    pMkt, pModel, mu: null, sigma: dailyVol,
    rawD, zScore, spread, confidence,
    edgePP, edgeZ,
    label: getLabel(zScore, confidence),
    candleCount: spyCandles.length,
    scoringMode: "model",
  };
}

// ── History engine: EWMA baseline (for EOY markets with candle history) ──────
export function runDeviationEngine(
  candles: Candle[],
  quote: MarketQuote
): DeviationResult {
  const probs = candles.map((c) => c.close / 100);
  const mid = calcMid(quote);
  const spread = calcSpread(quote);
  const pMkt = mid != null ? mid / 100 : null;

  const mu = probs.length >= MIN_CANDLES ? calcEWMABaseline(probs) : null;
  const sigma =
    mu != null && probs.length >= MIN_CANDLES ? calcSigma(probs, mu) : null;

  const rawD = pMkt != null && mu != null ? pMkt - mu : null;
  const zScore = rawD != null && sigma != null ? rawD / (sigma + EPSILON) : null;

  const confidence = calcConfidence(spread, quote.yesBidQty, quote.noBidQty);
  const edgePP = rawD != null ? 100 * confidence * rawD : null;
  const edgeZ = zScore != null ? confidence * zScore : null;

  return {
    pMkt, pModel: null, mu, sigma, rawD, zScore, spread, confidence,
    edgePP, edgeZ,
    label: getLabel(zScore, confidence),
    candleCount: candles.length,
    scoringMode: "history",
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
export function sortByEdge<T extends { result: DeviationResult }>(
  markets: T[]
): T[] {
  return [...markets].sort(
    (a, b) => Math.abs(b.result.edgeZ ?? 0) - Math.abs(a.result.edgeZ ?? 0)
  );
}

export function normalizeSparkline(
  candles: Candle[]
): Array<{ ts: number; v: number }> {
  if (candles.length < 2) return candles.map((c) => ({ ts: c.ts, v: c.close }));
  const vals = candles.map((c) => c.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  if (span <= 0) return candles.map((c) => ({ ts: c.ts, v: 50 }));
  return candles.map((c) => ({ ts: c.ts, v: ((c.close - min) / span) * 100 }));
}