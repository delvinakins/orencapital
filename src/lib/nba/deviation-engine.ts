// src/lib/nba/deviation-engine.ts
// Full replacement: buildDistributionIndex now accepts aggregated distribution rows
// from /api/labs/nba/distributions, AND still supports your old stub sample shape.

type Sample = {
  gameId: string;
  state: {
    period: number;
    secondsRemainingInPeriod: number;
    scoreDiff?: number;
  };
  market: {
    closingHomeSpread: number;
    liveHomeSpread: number;
  };
};

type DistRow = {
  sport?: string;
  league?: string;
  season?: string;

  time_bucket_id: string;
  time_bucket_start?: number;
  time_bucket_end?: number;

  spread_bucket_id: string;

  n: number;
  mean: number;
  std: number;

  median?: number | null;
  mad?: number | null;

  p10?: number | null;
  p25?: number | null;
  p75?: number | null;
  p90?: number | null;
};

export type DistributionCell = {
  n: number;
  mean: number;
  std: number;
  median?: number | null;
  mad?: number | null;
  p10?: number | null;
  p25?: number | null;
  p75?: number | null;
  p90?: number | null;
};

export type DistributionIndex = {
  // key = `${time_bucket_id}|${spread_bucket_id}`
  cells: Record<string, DistributionCell>;
  meta?: {
    sport?: string;
    league?: string;
    season?: string;
    builtAt: string;
    count: number;
  };
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Decision-window weighted time buckets using elapsed seconds in game (regulation only).
 * Returns a stable id like "T1080_1140".
 */
export function bucketTimeElapsed(elapsedSeconds: number): { id: string; start: number; end: number } {
  const t = clamp(Math.trunc(elapsedSeconds), 0, 2879);

  const mk = (start: number, size: number) => {
    const s = Math.floor((t - start) / size) * size + start;
    const e = s + size;
    return { id: `T${s}_${e}`, start: s, end: e };
  };

  // High-resolution windows (useful live-betting windows)
  // Late 1Q: 8:00–12:00 elapsed (480–720) => 30s buckets
  if (t >= 480 && t < 720) return mk(480, 30);

  // Mid 2Q: 16:00–22:00 elapsed (960–1320) => 60s buckets
  if (t >= 960 && t < 1320) return mk(960, 60);

  // Mid 3Q: 28:00–37:00 elapsed (1680–2220) => 60s buckets
  if (t >= 1680 && t < 2220) return mk(1680, 60);

  // Coarse elsewhere: 120s buckets across regulation
  return mk(0, 120);
}

/**
 * Close spread magnitude buckets (abs close spread).
 * Returns stable id like "S3.5_6.5" or "S13.5_plus".
 */
export function bucketCloseSpread(absClose: number): string {
  const x = Math.abs(Number.isFinite(absClose) ? absClose : 0);

  const bounds: Array<[number, number]> = [
    [0, 1.5],
    [1.5, 3.5],
    [3.5, 6.5],
    [6.5, 9.5],
    [9.5, 13.5],
  ];

  for (const [a, b] of bounds) {
    if (x >= a && x < b) return `S${a}_${b}`;
  }
  return "S13.5_plus";
}

function elapsedFromState(period: number, secondsRemainingInPeriod: number): number | null {
  if (!Number.isFinite(period) || !Number.isFinite(secondsRemainingInPeriod)) return null;
  const p = Math.trunc(period);
  const rem = Math.trunc(secondsRemainingInPeriod);

  if (p <= 0) return null;
  if (p > 4) return null; // Phase 1: ignore OT
  if (rem < 0 || rem > 720) return null;

  const elapsed = (p - 1) * 720 + (720 - rem);
  return elapsed;
}

function isDistRow(x: any): x is DistRow {
  return (
    x &&
    typeof x === "object" &&
    typeof x.time_bucket_id === "string" &&
    typeof x.spread_bucket_id === "string" &&
    typeof x.n === "number" &&
    typeof x.mean === "number" &&
    typeof x.std === "number"
  );
}

function isSample(x: any): x is Sample {
  return (
    x &&
    typeof x === "object" &&
    x.state &&
    x.market &&
    typeof x.state.period === "number" &&
    typeof x.state.secondsRemainingInPeriod === "number" &&
    typeof x.market.closingHomeSpread === "number" &&
    typeof x.market.liveHomeSpread === "number"
  );
}

function computeStats(values: number[]) {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;

  const mean = v.reduce((a, b) => a + b, 0) / n;

  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = v[i] - mean;
    ss += d * d;
  }
  const std = Math.sqrt(ss / Math.max(1, n - 1));

  const q = (p: number) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return v[lo];
    const t = idx - lo;
    return v[lo] * (1 - t) + v[hi] * t;
  };

  const median = q(0.5);
  const p10 = q(0.1);
  const p25 = q(0.25);
  const p75 = q(0.75);
  const p90 = q(0.9);

  // MAD (median absolute deviation)
  const absDev = v.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const mad = absDev.length ? absDev[Math.floor((absDev.length - 1) * 0.5)] : 0;

  return { n, mean, std, median, mad, p10, p25, p75, p90 };
}

/**
 * Build an index used by computeDeviation().
 * Accepts:
 *  - aggregated distribution rows (from Supabase/API), OR
 *  - raw stub samples (your previous shape) for local dev.
 */
export function buildDistributionIndex(items: any[]): DistributionIndex {
  const cells: Record<string, DistributionCell> = {};

  const now = new Date().toISOString();

  if (!Array.isArray(items) || items.length === 0) {
    return { cells, meta: { builtAt: now, count: 0 } };
  }

  // Case A: aggregated distribution rows
  if (isDistRow(items[0])) {
    const first = items[0] as DistRow;

    for (const row of items as DistRow[]) {
      if (!isDistRow(row)) continue;

      const key = `${row.time_bucket_id}|${row.spread_bucket_id}`;
      cells[key] = {
        n: row.n,
        mean: row.mean,
        std: row.std,
        median: row.median ?? null,
        mad: row.mad ?? null,
        p10: row.p10 ?? null,
        p25: row.p25 ?? null,
        p75: row.p75 ?? null,
        p90: row.p90 ?? null,
      };
    }

    return {
      cells,
      meta: {
        sport: first.sport,
        league: first.league,
        season: first.season,
        builtAt: now,
        count: Object.keys(cells).length,
      },
    };
  }

  // Case B: raw samples (backwards-compatible)
  const bucketMap: Record<string, number[]> = {};

  for (const it of items) {
    if (!isSample(it)) continue;

    const elapsed = elapsedFromState(it.state.period, it.state.secondsRemainingInPeriod);
    if (elapsed == null) continue;

    const t = bucketTimeElapsed(elapsed);
    const s = bucketCloseSpread(it.market.closingHomeSpread);

    const key = `${t.id}|${s}`;
    const deviation = it.market.liveHomeSpread - it.market.closingHomeSpread;

    (bucketMap[key] ||= []).push(deviation);
  }

  for (const key of Object.keys(bucketMap)) {
    const stats = computeStats(bucketMap[key]);
    if (!stats) continue;
    cells[key] = {
      n: stats.n,
      mean: stats.mean,
      std: stats.std,
      median: stats.median,
      mad: stats.mad,
      p10: stats.p10,
      p25: stats.p25,
      p75: stats.p75,
      p90: stats.p90,
    };
  }

  return { cells, meta: { builtAt: now, count: Object.keys(cells).length } };
}

/**
 * Helper lookup used by computeDeviation().
 * Returns null if no cell exists.
 */
export function lookupDistribution(
  index: DistributionIndex,
  time_bucket_id: string,
  spread_bucket_id: string
): DistributionCell | null {
  const key = `${time_bucket_id}|${spread_bucket_id}`;
  return index?.cells?.[key] ?? null;
}