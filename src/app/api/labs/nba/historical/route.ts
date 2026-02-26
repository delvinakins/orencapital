// src/app/api/labs/nba/historical/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Historical Conditional Signal (Phase 1A - snapshots only)
 *
 * Purpose:
 *   A historical-trigger "context" badge that is NOT a prediction and does NOT require final scores.
 *
 * Metric:
 *   observedMove = live_home_spread - closing_home_spread   (home perspective)
 *
 * Buckets:
 *  - time bucket: 120s windows over game elapsed time (0..2880), aligned with distributions/build
 *  - absMove bucket: based on abs(observedMove)
 *  - live ML bucket: based on underdog moneyline (derived from live_home_moneyline/live_away_moneyline)
 *
 * Inputs (query params):
 *  - season (default 2025-2026)
 *  - league (default nba)
 *  - sport  (default basketball)
 *  - period (1..4)                         [required]
 *  - secondsRemaining (0..720)             [required]
 *  - absMove (abs(live-close) in points)   [required]
 *  - liveMl (underdog ML, ex: 180)         [required]  // positive preferred; abs() used for bucketing
 *
 * Output:
 *  - conditioned stats in bucket: median/p25/p75 of observedMove, n
 *  - baseline stats: same time bucket only (no absMove/ml conditioning), median/p25/p75, n
 *
 * Notes:
 *  - De-dupes to ONE snapshot per game per time-bucket (earliest created_at in that bucket).
 *  - Requires snapshots table to have live_home_moneyline/live_away_moneyline populated (nullable is fine).
 */

function jsonError(status: number, error: string, detail?: any) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

function num(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(v) ? v : null;
}

function int(x: any): number | null {
  const v = num(x);
  return v == null ? null : Math.trunc(v);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function percentile(xsSorted: number[], p: number) {
  const n = xsSorted.length;
  if (n === 0) return null;
  const pp = clamp(p, 0, 1);
  const idx = (n - 1) * pp;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xsSorted[lo];
  const t = idx - lo;
  return xsSorted[lo] * (1 - t) + xsSorted[hi] * t;
}

function median(xsSorted: number[]) {
  const n = xsSorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return xsSorted[mid];
  return (xsSorted[mid - 1] + xsSorted[mid]) / 2;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

// --- Bucketing helpers (stable + interpretable) ---

function timeElapsedSeconds(period: number, secondsRemainingInPeriod: number) {
  const p = clamp(period, 1, 4);
  const rem = clamp(secondsRemainingInPeriod, 0, 720);
  const elapsedThisQ = 720 - rem;
  return (p - 1) * 720 + elapsedThisQ; // 0..2880
}

function timeBucket120(tElapsed: number) {
  const start = Math.floor(tElapsed / 120) * 120;
  const end = start + 120;
  return {
    time_bucket_start: start,
    time_bucket_end: end,
    time_bucket_id: `T${start}_${end}`,
  };
}

function absMoveBucketId(absMove: number) {
  const a = Math.abs(absMove);
  if (a < 0.75) return "M0_0.75";
  if (a < 1.5) return "M0.75_1.5";
  if (a < 2.5) return "M1.5_2.5";
  if (a < 3.5) return "M2.5_3.5";
  if (a < 5.0) return "M3.5_5.0";
  return "M5.0_99";
}

function mlBucketId(liveDogMl: number) {
  const v = Math.abs(liveDogMl);
  if (v < 130) return "ML100_129";
  if (v < 150) return "ML130_149";
  if (v < 200) return "ML150_199";
  if (v < 250) return "ML200_249";
  if (v < 350) return "ML250_349";
  return "ML350_999";
}

type Snapshot = {
  game_id: string | null;
  period: number | null;
  seconds_remaining_in_period: number | null;
  closing_home_spread: number | null;
  live_home_spread: number | null;
  live_home_moneyline?: number | null;
  live_away_moneyline?: number | null;
  created_at?: string | null;
};

function inferDogSideFromMoneyline(mlHome: number | null, mlAway: number | null): "home" | "away" | null {
  if (mlHome == null && mlAway == null) return null;
  if (mlHome != null && mlAway == null) return "home";
  if (mlAway != null && mlHome == null) return "away";

  const h = mlHome as number;
  const a = mlAway as number;

  if (h >= 0 && a < 0) return "home";
  if (a >= 0 && h < 0) return "away";

  // both positive or both negative => choose larger number as "doggier"
  return h >= a ? "home" : "away";
}

function dogMoneyline(mlHome: number | null, mlAway: number | null): number | null {
  const side = inferDogSideFromMoneyline(mlHome, mlAway);
  if (!side) return null;
  return side === "home" ? mlHome : mlAway;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  const period = int(searchParams.get("period"));
  const secondsRemaining = int(searchParams.get("secondsRemaining"));
  const absMoveInput = num(searchParams.get("absMove"));
  const liveMlRaw = num(searchParams.get("liveMl"));

  if (period == null || period < 1 || period > 4) return jsonError(400, "Missing/invalid period.");
  if (secondsRemaining == null || secondsRemaining < 0 || secondsRemaining > 720) {
    return jsonError(400, "Missing/invalid secondsRemaining.");
  }
  if (absMoveInput == null) return jsonError(400, "Missing/invalid absMove.");
  if (liveMlRaw == null) return jsonError(400, "Missing/invalid liveMl.");

  const tElapsed = timeElapsedSeconds(period, secondsRemaining);
  const tb = timeBucket120(tElapsed);
  const mBucket = absMoveBucketId(absMoveInput);
  const mlBucket = mlBucketId(liveMlRaw);

  const sb = supabaseAdmin();

  // Candidate pull (at most two periods due to bucket boundary)
  const pStart = Math.floor(tb.time_bucket_start / 720) + 1;
  const pEnd = Math.floor((tb.time_bucket_end - 1) / 720) + 1;
  const periods = [pStart, pEnd].filter((x, i, a) => x >= 1 && x <= 4 && a.indexOf(x) === i);

  const { data, error } = await sb
    .from("nba_line_snapshots")
    .select(
      "game_id,period,seconds_remaining_in_period,closing_home_spread,live_home_spread,live_home_moneyline,live_away_moneyline,created_at"
    )
    .eq("sport", sport)
    .eq("league", league)
    .eq("season", season)
    .in("period", periods)
    .limit(200000);

  if (error) return jsonError(500, "Supabase read failed.", error.message);

  const rows = (data || []) as Snapshot[];

  // Filter into exact time bucket and compute observedMove + derived ML buckets
  const candidates: Array<
    Snapshot & {
      tElapsed: number;
      observedMove: number;
      absMove: number;
      absMoveBucket: string;
      dogMl: number | null;
      dogMlBucket: string | null;
    }
  > = [];

  for (const r of rows) {
    const gid = r.game_id ? String(r.game_id) : null;
    const p = int(r.period);
    const rem = int(r.seconds_remaining_in_period);
    const close = num(r.closing_home_spread);
    const live = num(r.live_home_spread);

    if (!gid || p == null || rem == null || close == null || live == null) continue;
    if (p < 1 || p > 4) continue;

    const t = timeElapsedSeconds(p, rem);
    if (t < tb.time_bucket_start || t >= tb.time_bucket_end) continue;

    const observedMove = live - close;
    if (!Number.isFinite(observedMove)) continue;

    const mlH = num((r as any).live_home_moneyline);
    const mlA = num((r as any).live_away_moneyline);
    const dMl = dogMoneyline(mlH, mlA);
    if (dMl == null) continue;

    const aMove = Math.abs(observedMove);

    candidates.push({
      ...r,
      game_id: gid,
      period: p,
      seconds_remaining_in_period: rem,
      closing_home_spread: close,
      live_home_spread: live,
      tElapsed: t,
      observedMove,
      absMove: aMove,
      absMoveBucket: absMoveBucketId(aMove),
      dogMl: dMl,
      dogMlBucket: mlBucketId(dMl),
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      sport,
      league,
      season,
      bucket: { ...tb, absMoveBucket: mBucket, mlBucket },
      n: 0,
      median_move: null,
      p25_move: null,
      p75_move: null,
      baseline_n: 0,
      baseline_median_move: null,
      baseline_p25_move: null,
      baseline_p75_move: null,
      note:
        "No usable snapshots found in this time bucket with moneylines. Ensure nba_line_snapshots has live_home_moneyline/live_away_moneyline and ingest is populating them.",
    });
  }

  // De-dupe: one snapshot per game per time bucket (earliest created_at)
  const byGame = new Map<string, typeof candidates[number]>();
  for (const r of candidates) {
    const gid = r.game_id as string;
    const prev = byGame.get(gid);
    if (!prev) {
      byGame.set(gid, r);
      continue;
    }
    const tPrev = prev.created_at ? new Date(prev.created_at).getTime() : Number.POSITIVE_INFINITY;
    const tCur = r.created_at ? new Date(r.created_at).getTime() : Number.POSITIVE_INFINITY;
    if (tCur < tPrev) byGame.set(gid, r);
  }

  const uniques = Array.from(byGame.values());

  // Baseline: same time bucket only (but requires ML since we filtered above)
  const baseline = uniques;

  // Conditioned: baseline + absMove bucket + ML bucket
  const conditioned = baseline.filter((r) => r.absMoveBucket === mBucket && r.dogMlBucket === mlBucket);

  const baseMoves = baseline.map((r) => r.observedMove).filter((x) => Number.isFinite(x));
  const condMoves = conditioned.map((r) => r.observedMove).filter((x) => Number.isFinite(x));

  const baseSorted = [...baseMoves].sort((a, b) => a - b);
  const condSorted = [...condMoves].sort((a, b) => a - b);

  return NextResponse.json({
    ok: true,
    sport,
    league,
    season,
    bucket: { ...tb, absMoveBucket: mBucket, mlBucket },
    n: condSorted.length,
    median_move: median(condSorted),
    p25_move: percentile(condSorted, 0.25),
    p75_move: percentile(condSorted, 0.75),
    baseline_n: baseSorted.length,
    baseline_median_move: median(baseSorted),
    baseline_p25_move: percentile(baseSorted, 0.25),
    baseline_p75_move: percentile(baseSorted, 0.75),
    note:
      "Phase 1A (snapshots only): conditioned distribution of observed market move (live-close). Baseline is time bucket only. No game results required.",
  });
}