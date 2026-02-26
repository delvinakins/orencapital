// src/app/api/labs/nba/historical/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Historical Conditional Signal (Phase 1)
 *
 * Returns: "In similar spots (time window + move magnitude + live ML), the underdog covered X% (n=Y)."
 *
 * Inputs (query params):
 *  - season (default 2025-2026)
 *  - league (default nba)
 *  - sport  (default basketball)
 *  - period (1..4)                          [required]
 *  - secondsRemaining (0..720)              [required]
 *  - absMove (absolute move in points)      [required]  // abs(live - close), home-perspective
 *  - liveMl (underdog moneyline, ex: 180)   [required]  // pass positive; if negative, we abs() it
 *
 * Data sources:
 *  - public.nba_line_snapshots
 *      requires: game_id, period, seconds_remaining_in_period, closing_home_spread, live_home_spread,
 *                live_home_moneyline, live_away_moneyline, created_at
 *
 *  - public.nba_game_results  (REQUIRED for Phase 1 label)
 *      expected columns:
 *        game_id (text)  [join key]
 *        final_home_score (numeric/int)
 *        final_away_score (numeric/int)
 *
 * Notes:
 *  - De-dupes to ONE snapshot per game per time-bucket (earliest in that bucket).
 *  - Buckets:
 *      time bucket: same 120s buckets used in distributions build (based on elapsed time)
 *      absMove bucket: stable bands
 *      live ML bucket: stable bands (dog ML)
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

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

// --- Bucketing helpers (stable + interpretable) ---

function timeElapsedSeconds(period: number, secondsRemainingInPeriod: number) {
  // NBA regulation: 4 periods x 12 min = 720s each
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

type ResultRow = {
  game_id: string | null;
  final_home_score?: number | null;
  final_away_score?: number | null;
};

function inferDogSideFromMoneyline(mlHome: number | null, mlAway: number | null): "home" | "away" | null {
  // Moneyline convention: negative=favorite, positive=underdog.
  // If one is positive and the other negative => positive is dog.
  // If both positive => larger positive is "more dog".
  // If both negative => larger (less negative) is "less favorite" but still favorite; return the one with higher value.
  if (mlHome == null && mlAway == null) return null;
  if (mlHome != null && mlAway == null) return mlHome >= 0 ? "home" : "home";
  if (mlAway != null && mlHome == null) return mlAway >= 0 ? "away" : "away";

  const h = mlHome as number;
  const a = mlAway as number;

  if (h >= 0 && a < 0) return "home";
  if (a >= 0 && h < 0) return "away";

  // both positive or both negative => choose larger number
  return h >= a ? "home" : "away";
}

function dogMoneyline(mlHome: number | null, mlAway: number | null): number | null {
  const side = inferDogSideFromMoneyline(mlHome, mlAway);
  if (!side) return null;
  return side === "home" ? mlHome : mlAway;
}

function dogCoversCloseSpread(args: {
  dogSide: "home" | "away";
  closeHomeSpread: number;
  finalHome: number;
  finalAway: number;
}): boolean {
  const { dogSide, closeHomeSpread, finalHome, finalAway } = args;

  if (dogSide === "away") {
    const closeAwaySpread = -closeHomeSpread;
    // ATS margin for away dog:
    // (away - home) + closeAwaySpread > 0
    return finalAway - finalHome + closeAwaySpread > 0;
  }

  // home dog:
  // (home - away) + closeHomeSpread > 0  (closeHomeSpread should be positive usually)
  return finalHome - finalAway + closeHomeSpread > 0;
}

async function chunkedIn<T extends { game_id: string | null }>(
  sb: any,
  table: string,
  columns: string,
  gameIds: string[],
  chunkSize = 500
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < gameIds.length; i += chunkSize) {
    const chunk = gameIds.slice(i, i + chunkSize);
    const { data, error } = await sb.from(table).select(columns).in("game_id", chunk);
    if (error) throw new Error(error.message || `Failed reading ${table}`);
    out.push(...(data || []));
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  const period = int(searchParams.get("period"));
  const secondsRemaining = int(searchParams.get("secondsRemaining"));
  const absMove = num(searchParams.get("absMove"));
  const liveMlRaw = num(searchParams.get("liveMl"));

  if (period == null || period < 1 || period > 4) return jsonError(400, "Missing/invalid period.");
  if (secondsRemaining == null || secondsRemaining < 0 || secondsRemaining > 720)
    return jsonError(400, "Missing/invalid secondsRemaining.");
  if (absMove == null) return jsonError(400, "Missing/invalid absMove.");
  if (liveMlRaw == null) return jsonError(400, "Missing/invalid liveMl.");

  // Build bucket ids (what the client will display / cache key)
  const tElapsed = timeElapsedSeconds(period, secondsRemaining);
  const tb = timeBucket120(tElapsed);
  const mBucket = absMoveBucketId(absMove);
  const mlBucket = mlBucketId(liveMlRaw);

  // Pull snapshots only in the time bucket window (tight and fast)
  const sb = supabaseAdmin();

  // Convert time bucket start/end back into (period, secondsRemaining) ranges:
  // We simply use elapsed seconds range [start, end) and filter in-memory after pulling a narrow supabase range
  // because table stores (period, seconds_remaining) not elapsed.
  // To keep DB filter tight, we filter by period first and seconds_remaining as coarse bounds for that period.
  const pStart = Math.floor(tb.time_bucket_start / 720) + 1;
  const pEnd = Math.floor((tb.time_bucket_end - 1) / 720) + 1;

  const periods = [pStart, pEnd].filter((x, i, a) => x >= 1 && x <= 4 && a.indexOf(x) === i);

  // Pull candidates (at most 2 adjacent periods due to 120s window boundary)
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

  // Filter into exact time bucket (elapsed seconds) and compute derived values
  const inBucket: Array<
    Snapshot & {
      tElapsed: number;
      absMove: number;
      absMoveBucket: string;
      dogSide: "home" | "away" | null;
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

    const obsMove = live - close;
    if (!Number.isFinite(obsMove)) continue;

    const aMove = Math.abs(obsMove);
    const aMoveBucket = absMoveBucketId(aMove);

    const mlH = num((r as any).live_home_moneyline);
    const mlA = num((r as any).live_away_moneyline);
    const dSide = inferDogSideFromMoneyline(mlH, mlA);
    const dMl = dogMoneyline(mlH, mlA);

    const dMlBucket = dMl == null ? null : mlBucketId(dMl);

    inBucket.push({
      ...r,
      game_id: gid,
      period: p,
      seconds_remaining_in_period: rem,
      closing_home_spread: close,
      live_home_spread: live,
      tElapsed: t,
      absMove: aMove,
      absMoveBucket: aMoveBucket,
      dogSide: dSide,
      dogMl: dMl,
      dogMlBucket: dMlBucket,
    });
  }

  if (inBucket.length === 0) {
    return NextResponse.json({
      ok: true,
      sport,
      league,
      season,
      bucket: { ...tb, absMoveBucket: mBucket, mlBucket },
      n: 0,
      p_dog_cover: null,
      baseline_p_dog_cover: null,
      note: "No snapshots found in this time bucket (or missing moneylines).",
    });
  }

  // De-dupe: one snapshot per game per time bucket (earliest created_at)
  const byGame = new Map<string, typeof inBucket[number]>();
  for (const r of inBucket) {
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

  // Baseline set: same time bucket only (ignore move + ml buckets), but require moneylines and close spread (so label is computable)
  const baseline = uniques.filter((r) => r.dogSide && r.dogMl != null);

  // Conditioned set: same time bucket + absMove bucket + dog ML bucket
  const conditioned = baseline.filter((r) => r.absMoveBucket === mBucket && r.dogMlBucket === mlBucket);

  const baselineIds = baseline.map((r) => r.game_id as string);
  const conditionedIds = conditioned.map((r) => r.game_id as string);

  if (baselineIds.length === 0) {
    return NextResponse.json({
      ok: true,
      sport,
      league,
      season,
      bucket: { ...tb, absMoveBucket: mBucket, mlBucket },
      n: 0,
      p_dog_cover: null,
      baseline_p_dog_cover: null,
      note: "Snapshots found, but missing moneylines (live_home_moneyline/live_away_moneyline).",
    });
  }

  // Fetch results for baseline ids (so baseline is computable in the same response)
  let results: ResultRow[] = [];
  try {
    results = (await chunkedIn(
      sb,
      "nba_game_results",
      "game_id,final_home_score,final_away_score",
      baselineIds
    )) as ResultRow[];
  } catch (e: any) {
    return jsonError(
      500,
      "Missing results table for Phase 1.",
      {
        message:
          "Expected public.nba_game_results with columns: game_id, final_home_score, final_away_score.",
        error: e?.message || String(e),
        hint:
          "Create/populate nba_game_results (or update this route to match your existing results table), then retry.",
      }
    );
  }

  const resMap = new Map<string, { h: number; a: number }>();
  for (const r of results) {
    const gid = r.game_id ? String(r.game_id) : "";
    const h = num((r as any).final_home_score);
    const a = num((r as any).final_away_score);
    if (!gid || h == null || a == null) continue;
    resMap.set(gid, { h, a });
  }

  function computeRate(rows: typeof baseline) {
    let n = 0;
    let wins = 0;

    for (const r of rows) {
      const gid = r.game_id as string;
      const close = r.closing_home_spread as number;
      const dogSide = r.dogSide as "home" | "away";
      const fin = resMap.get(gid);
      if (!fin) continue;

      n++;
      if (dogCoversCloseSpread({ dogSide, closeHomeSpread: close, finalHome: fin.h, finalAway: fin.a })) wins++;
    }

    return { n, wins, p: n > 0 ? wins / n : null };
  }

  const base = computeRate(baseline);
  const cond = computeRate(conditioned);

  return NextResponse.json({
    ok: true,
    sport,
    league,
    season,
    bucket: {
      ...tb,
      absMoveBucket: mBucket,
      mlBucket,
    },
    n: cond.n,
    wins: cond.wins,
    p_dog_cover: cond.p,
    baseline_n: base.n,
    baseline_wins: base.wins,
    baseline_p_dog_cover: base.p,
    note:
      "Phase 1 label = underdog covers the closing spread. Conditioned set is time bucket + absMove bucket + ML bucket. Baseline is time bucket only.",
  });
}