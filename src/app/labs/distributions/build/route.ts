// src/app/api/labs/nba/distributions/build/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Builds deviation distributions from historical snapshots stored in Supabase.
 *
 * Reads from: public.nba_line_snapshots
 * Writes to: public.deviation_distributions
 *
 * Buckets:
 *  - time_bucket: 120s windows over game elapsed time (0..2880)
 *  - spread_bucket: based on |closingHomeSpread|
 *
 * Metric:
 *  - observedMove = liveHomeSpread - closingHomeSpread
 *
 * Security:
 *  - Requires header: x-admin-token == process.env.ADMIN_SEED_TOKEN
 */

type SnapshotRow = {
  sport?: string | null;
  league?: string | null;
  season?: string | null;
  game_id?: string | null;

  period?: number | null;
  seconds_remaining_in_period?: number | null;

  closing_home_spread?: number | null;
  live_home_spread?: number | null;

  created_at?: string | null;
};

type DistRow = {
  sport: string;
  league: string;
  season: string;

  time_bucket_id: string;
  time_bucket_start: number;
  time_bucket_end: number;

  spread_bucket_id: string;

  n: number;
  mean: number;
  std: number;

  median: number | null;
  mad: number | null;

  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;

  updated_at?: string;
};

function jsonError(status: number, error: string, detail?: any) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

function num(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(v) ? v : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[], mu: number) {
  const n = xs.length;
  if (n < 2) return 0;
  let s = 0;
  for (const x of xs) {
    const d = x - mu;
    s += d * d;
  }
  return Math.sqrt(s / (n - 1));
}

function median(xsSorted: number[]) {
  const n = xsSorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return xsSorted[mid];
  return (xsSorted[mid - 1] + xsSorted[mid]) / 2;
}

function percentile(xsSorted: number[], p: number) {
  // p in [0,1]
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

function madFromMedian(xs: number[], med: number) {
  const absDev = xs.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return median(absDev);
}

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

function spreadBucketId(closingHomeSpread: number) {
  // Use ABS closing spread for bucket assignment.
  const a = Math.abs(closingHomeSpread);

  // Match your seed-style IDs.
  // Feel free to tweak later; this is stable + interpretable.
  if (a < 1.5) return "S0_1.5";
  if (a < 3.5) return "S1.5_3.5";
  if (a < 6.5) return "S3.5_6.5";
  if (a < 10.5) return "S6.5_10.5";
  return "S10.5_99";
}

function groupKey(sport: string, league: string, season: string, tbId: string, sbId: string) {
  return `${sport}||${league}||${season}||${tbId}||${sbId}`;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const adminToken = req.headers.get("x-admin-token") || "";
  const expected = process.env.ADMIN_SEED_TOKEN || "";

  if (!expected) return jsonError(500, "Server misconfigured.", "Missing ADMIN_SEED_TOKEN env var.");
  if (!adminToken || adminToken !== expected) return jsonError(401, "Unauthorized.");

  const { searchParams } = new URL(req.url);
  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  // Optional range (lets you build per-season slices cleanly)
  const since = searchParams.get("since"); // ISO string
  const until = searchParams.get("until"); // ISO string

  const sb = supabaseAdmin();

  // Pull snapshots
  // NOTE: This expects your snapshots table exists and is in public schema.
  let q = sb
    .from("nba_line_snapshots")
    .select(
      "sport,league,season,game_id,period,seconds_remaining_in_period,closing_home_spread,live_home_spread,created_at"
    )
    .eq("sport", sport)
    .eq("league", league)
    .eq("season", season);

  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);

  // Pull a lot — you can cap later. If you have millions, we’ll add pagination next.
  const { data, error } = await q.limit(200000);

  if (error) {
    // common: "Could not find the table"
    return jsonError(500, "Supabase read failed.", error.message);
  }

  const rows = (data || []) as SnapshotRow[];
  if (rows.length === 0) {
    return jsonError(
      400,
      "No snapshots found.",
      `Table nba_line_snapshots returned 0 rows for sport=${sport}, league=${league}, season=${season}.`
    );
  }

  // Group observed moves into buckets
  const groups = new Map<string, { meta: Omit<DistRow, "n" | "mean" | "std" | "median" | "mad" | "p10" | "p25" | "p75" | "p90">; xs: number[] }>();

  let used = 0;
  let skipped = 0;

  for (const r of rows) {
    const period = num(r.period);
    const rem = num(r.seconds_remaining_in_period);
    const close = num(r.closing_home_spread);
    const live = num(r.live_home_spread);

    if (period == null || rem == null || close == null || live == null) {
      skipped++;
      continue;
    }

    // Only regulation buckets for now (P1..P4). OT can be added later.
    if (period < 1 || period > 4) {
      skipped++;
      continue;
    }

    const tElapsed = timeElapsedSeconds(period, rem);
    const tb = timeBucket120(tElapsed);
    const sbId = spreadBucketId(close);

    const observedMove = live - close; // signed, home perspective
    if (!Number.isFinite(observedMove)) {
      skipped++;
      continue;
    }

    const k = groupKey(sport, league, season, tb.time_bucket_id, sbId);

    const existing = groups.get(k);
    if (existing) {
      existing.xs.push(observedMove);
    } else {
      groups.set(k, {
        meta: {
          sport,
          league,
          season,
          time_bucket_id: tb.time_bucket_id,
          time_bucket_start: tb.time_bucket_start,
          time_bucket_end: tb.time_bucket_end,
          spread_bucket_id: sbId,
        },
        xs: [observedMove],
      });
    }

    used++;
  }

  if (groups.size === 0) {
    return jsonError(
      400,
      "Insufficient usable snapshots.",
      `All rows were skipped. Check snapshot columns and ensure spreads/clock values exist. skipped=${skipped}`
    );
  }

  // Build distribution rows
  const out: DistRow[] = [];
  for (const { meta, xs } of groups.values()) {
    const xsSorted = [...xs].sort((a, b) => a - b);
    const n = xsSorted.length;
    const mu = mean(xsSorted);
    const sd = std(xsSorted, mu);
    const med = median(xsSorted);
    const mad = med == null ? null : madFromMedian(xsSorted, med);

    out.push({
      ...meta,
      n,
      mean: mu,
      std: sd,
      median: med,
      mad,
      p10: percentile(xsSorted, 0.1),
      p25: percentile(xsSorted, 0.25),
      p75: percentile(xsSorted, 0.75),
      p90: percentile(xsSorted, 0.9),
    });
  }

  // Upsert into deviation_distributions
  const { error: upErr } = await sb
    .from("deviation_distributions")
    .upsert(out, {
      onConflict: "sport,league,season,time_bucket_id,spread_bucket_id",
      ignoreDuplicates: false,
    });

  if (upErr) return jsonError(500, "Supabase upsert failed.", upErr.message);

  return NextResponse.json({
    ok: true,
    sport,
    league,
    season,
    snapshots_total: rows.length,
    snapshots_used: used,
    snapshots_skipped: skipped,
    buckets_upserted: out.length,
  });
}