// src/lib/labs/nba/heatmap.ts
import {
  bucketCloseSpread,
  bucketTimeElapsed,
  lookupDistribution,
  type DistributionIndex,
} from "@/lib/nba/deviation-engine";

type ComputeInput = {
  // The live games API shape is flexible; we only rely on these:
  period?: number | null; // 1..4
  secondsRemaining?: number | null; // 0..720
  closingSpreadHome?: number | null;
  liveSpreadHome?: number | null;
};

type ComputeOptions = {
  spreadIndex: DistributionIndex;
};

export type DeviationResult = {
  // Primary UI fields (your client reads these)
  observedMove: number; // live - close
  expectedMove: number; // typical move given similar game state
  dislocationPts: number; // observed - expected
  absDislocationPts: number;
  absZ: number;

  // Debug / future UI
  timeBucketId: string;
  spreadBucketId: string;
  sampleSize: number;
};

function toNumber(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x).trim());
  return Number.isFinite(v) ? v : null;
}

function computeElapsedSeconds(period: number, secondsRemainingInPeriod: number): number | null {
  if (!Number.isFinite(period) || !Number.isFinite(secondsRemainingInPeriod)) return null;

  const p = Math.trunc(period);
  const rem = Math.trunc(secondsRemainingInPeriod);

  // Phase 1: regulation only
  if (p < 1 || p > 4) return null;
  if (rem < 0 || rem > 720) return null;

  // elapsed in game [0..2879]
  return (p - 1) * 720 + (720 - rem);
}

function safeSigma(std: number | null, mad: number | null): number | null {
  const s = toNumber(std);
  if (s != null && s > 1e-9) return s;

  // Robust fallback: sigma ≈ 1.4826 * MAD
  const m = toNumber(mad);
  if (m != null && m > 1e-9) return 1.4826 * m;

  return null;
}

export function computeDeviation(g: ComputeInput, opts: ComputeOptions): DeviationResult | null {
  const spreadIndex = opts?.spreadIndex;
  if (!spreadIndex) return null;

  const period = toNumber((g as any)?.period);
  const secondsRemaining = toNumber((g as any)?.secondsRemaining);

  const close = toNumber((g as any)?.closingSpreadHome);
  const live = toNumber((g as any)?.liveSpreadHome);

  if (period == null || secondsRemaining == null) return null;
  if (close == null || live == null) return null;

  const elapsed = computeElapsedSeconds(period, secondsRemaining);
  if (elapsed == null) return null;

  const timeBucket = bucketTimeElapsed(elapsed);
  const spreadBucketId = bucketCloseSpread(Math.abs(close));

  const cell = lookupDistribution(spreadIndex, timeBucket.id, spreadBucketId);
  if (!cell) return null;

  const observedMove = live - close;

  // Expected move: prefer mean; if missing (shouldn't), fallback to median, else 0
  const expectedMove =
    Number.isFinite(cell.mean) ? cell.mean : Number.isFinite(cell.median as any) ? (cell.median as number) : 0;

  const dislocationPts = observedMove - expectedMove;
  const absDislocationPts = Math.abs(dislocationPts);

  const sigma = safeSigma(cell.std, cell.mad ?? null);
  const absZ = sigma ? Math.abs(dislocationPts / sigma) : 0;

  return {
    observedMove,
    expectedMove,
    dislocationPts,
    absDislocationPts,
    absZ,

    timeBucketId: timeBucket.id,
    spreadBucketId,
    sampleSize: Math.max(0, Math.trunc(cell.n ?? 0)),
  };
}