// src/app/api/labs/nba/distributions/seed/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bucketCloseSpread, bucketTimeElapsed } from "@/lib/nba/deviation-engine";

type SeedCell = {
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
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Deterministic pseudo-random in [0,1)
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[], m: number) {
  let ss = 0;
  for (const x of xs) {
    const d = x - m;
    ss += d * d;
  }
  return Math.sqrt(ss / Math.max(1, xs.length - 1));
}

function quantile(sorted: number[], p: number) {
  const n = sorted.length;
  if (n === 0) return null;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return quantile(s, 0.5) ?? 0;
}

function mad(xs: number[], med: number) {
  const dev = xs.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return quantile(dev, 0.5) ?? 0;
}

/**
 * Seed “reasonable looking” distributions so the product UX can be validated end-to-end.
 * This is NOT “real data” — it simply makes the engine deterministic and debuggable.
 *
 * Later you will replace this with the true offline builder.
 */
function buildSeedGrid(): SeedCell[] {
  const sport = "basketball";
  const league = "nba";
  const season = "seed";

  // Generate time buckets across 0..2880 using the SAME bucket function
  const timeBuckets: Array<{ id: string; start: number; end: number }> = [];
  const seenT = new Set<string>();
  for (let t = 0; t < 2880; t += 15) {
    const b = bucketTimeElapsed(t);
    if (!seenT.has(b.id)) {
      seenT.add(b.id);
      timeBuckets.push({ id: b.id, start: b.start, end: b.end });
    }
  }

  // Spread buckets from representative values
  const spreadBucketIds = [
    bucketCloseSpread(0.5),
    bucketCloseSpread(2.0),
    bucketCloseSpread(4.5),
    bucketCloseSpread(8.0),
    bucketCloseSpread(11.0),
    bucketCloseSpread(16.0),
  ];

  const cells: SeedCell[] = [];

  // Create distributions: variance grows later + for bigger close spreads (a little)
  for (let ti = 0; ti < timeBuckets.length; ti++) {
    const tb = timeBuckets[ti];

    for (let si = 0; si < spreadBucketIds.length; si++) {
      const sb = spreadBucketIds[si];

      const rnd = prng((ti + 1) * 10_000 + (si + 1) * 1_000);

      // Synthetic “mean move” near zero, with slight drift by time window
      const drift =
        tb.start >= 960 && tb.start < 1320 ? 0.05 : tb.start >= 1680 && tb.start < 2220 ? 0.08 : 0.0;

      const baseStd =
        tb.start >= 480 && tb.start < 720
          ? 0.55
          : tb.start >= 960 && tb.start < 1320
          ? 0.75
          : tb.start >= 1680 && tb.start < 2220
          ? 0.85
          : 0.65;

      const spreadFactor =
        sb === "S13.5_plus" ? 1.15 : sb === "S9.5_13.5" ? 1.08 : sb === "S6.5_9.5" ? 1.03 : 1.0;

      const targetStd = baseStd * spreadFactor;

      // Generate a sample set for stats (deterministic)
      const n = 900; // strong enough for stable percentiles
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        // approx normal via sum of uniforms
        const u = rnd() + rnd() + rnd() + rnd() + rnd() + rnd(); // mean ~3, var ~0.5
        const z = (u - 3) / Math.sqrt(0.5); // ~N(0,1) ish
        const x = drift + z * targetStd;
        xs.push(x);
      }

      const m = mean(xs);
      const s = std(xs, m);

      const sorted = [...xs].sort((a, b) => a - b);
      const med = quantile(sorted, 0.5) ?? m;
      const madv = mad(xs, med);

      cells.push({
        sport,
        league,
        season,
        time_bucket_id: tb.id,
        time_bucket_start: tb.start,
        time_bucket_end: tb.end,
        spread_bucket_id: sb,
        n,
        mean: m,
        std: s,
        median: med,
        mad: madv,
        p10: quantile(sorted, 0.1),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        p90: quantile(sorted, 0.9),
      });
    }
  }

  return cells;
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("x-admin-token");
    const expected = process.env.OREN_ADMIN_SEED_TOKEN;

    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "Missing env OREN_ADMIN_SEED_TOKEN" },
        { status: 500 }
      );
    }

    if (!token || token !== expected) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const rows = buildSeedGrid();

    // Upsert in chunks to avoid payload limits
    const chunkSize = 500;
    let upserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      const { error } = await supabase
        .from("deviation_distributions")
        .upsert(chunk, {
          onConflict: "sport,league,season,time_bucket_id,spread_bucket_id",
        });

      if (error) {
        return NextResponse.json(
          { ok: false, error: "Supabase upsert failed.", detail: error.message },
          { status: 500 }
        );
      }

      upserted += chunk.length;
    }

    return NextResponse.json({ ok: true, upserted, season: "seed" }, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}