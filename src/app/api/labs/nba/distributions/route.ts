// src/app/api/labs/nba/distributions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  updated_at: string;
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

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);

    const sport = (searchParams.get("sport") || "basketball").toLowerCase();
    const league = (searchParams.get("league") || "nba").toLowerCase();
    const season = searchParams.get("season") || null;

    let q = supabase
      .from("deviation_distributions")
      .select(
        [
          "sport",
          "league",
          "season",
          "time_bucket_id",
          "time_bucket_start",
          "time_bucket_end",
          "spread_bucket_id",
          "n",
          "mean",
          "std",
          "median",
          "mad",
          "p10",
          "p25",
          "p75",
          "p90",
          "updated_at",
        ].join(",")
      )
      .eq("sport", sport)
      .eq("league", league)
      .order("season", { ascending: false })
      .order("time_bucket_start", { ascending: true })
      .order("spread_bucket_id", { ascending: true });

    if (season) q = q.eq("season", season);

    const { data, error } = await q.returns<DistRow[]>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to load distributions." },
        { status: 500 }
      );
    }

    const items = Array.isArray(data) ? data : [];

    // Hint for client/debugging
    const meta = {
      sport,
      league,
      season: season ?? (items[0]?.season ?? null),
      count: items.length,
      updatedAt: items[0]?.updated_at ?? null,
    };

    return NextResponse.json(
      { ok: true, items, meta },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}