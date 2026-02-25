// src/app/api/labs/nba/oren-score/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function json(ok: boolean, body: any, status = 200) {
  return NextResponse.json({ ok, ...body }, { status });
}

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Exponential Oren Rating
 */
function orenRating(rank: number, A: number, k: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return A * Math.exp(-k * (rank - 1));
}

function computeOrenEdge(params: {
  homeRank: number;
  awayRank: number;
  closingSpreadHome: number;
  A: number;
  k: number;
  S: number;
}) {
  const { homeRank, awayRank, closingSpreadHome, A, k, S } = params;

  const homeRating = orenRating(homeRank, A, k);
  const awayRating = orenRating(awayRank, A, k);

  const impliedSpreadHome = S * (homeRating - awayRating);
  const edgePts = impliedSpreadHome - closingSpreadHome;

  return {
    homeRating,
    awayRating,
    impliedSpreadHome,
    orenEdgePts: edgePts,
  };
}

/**
 * GET
 * Returns current rankings + model parameters
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const season = url.searchParams.get("season") || "2025-2026";
    const league = url.searchParams.get("league") || "nba";
    const sport = url.searchParams.get("sport") || "basketball";

    const A = Number(url.searchParams.get("A") ?? 10);
    const k = Number(url.searchParams.get("k") ?? 0.12);
    const S = Number(url.searchParams.get("S") ?? 1.0);

    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("oren_power_rankings_current")
      .select("team, rank, note, season, league, sport, updated_at")
      .eq("sport", sport)
      .eq("league", league)
      .eq("season", season)
      .order("rank", { ascending: true });

    if (error) {
      return json(false, { error: "Supabase query failed.", detail: error.message }, 500);
    }

    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      map[normalizeTeam(r.team)] = Number(r.rank);
    }

    return json(true, {
      sport,
      league,
      season,
      count: rows?.length ?? 0,
      items: rows ?? [],
      map,
      params: { A, k, S },
    });
  } catch (e: any) {
    return json(false, { error: "Server error.", detail: String(e?.message ?? e) }, 500);
  }
}

/**
 * POST
 * Computes Oren Score (Edge vs Closing Line)
 *
 * Body:
 * {
 *   "season": "2025-2026",
 *   "homeTeam": "los angeles lakers",
 *   "awayTeam": "orlando magic",
 *   "closingSpreadHome": -5.5,
 *   "A": 10,
 *   "k": 0.12,
 *   "S": 1.0
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return json(false, { error: "Invalid JSON body." }, 400);

    const season = String(body.season ?? "2025-2026");
    const league = String(body.league ?? "nba");
    const sport = String(body.sport ?? "basketball");

    const homeTeam = normalizeTeam(body.homeTeam);
    const awayTeam = normalizeTeam(body.awayTeam);
    const closingSpreadHome = Number(body.closingSpreadHome);

    if (!homeTeam || !awayTeam || !Number.isFinite(closingSpreadHome)) {
      return json(false, { error: "Invalid homeTeam / awayTeam / closingSpreadHome." }, 400);
    }

    const A = Number(body.A ?? 10);
    const k = Number(body.k ?? 0.12);
    const S = Number(body.S ?? 1.0);

    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("oren_power_rankings_current")
      .select("team, rank")
      .eq("sport", sport)
      .eq("league", league)
      .eq("season", season);

    if (error) {
      return json(false, { error: "Supabase query failed.", detail: error.message }, 500);
    }

    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      map[normalizeTeam(r.team)] = Number(r.rank);
    }

    const homeRank = map[homeTeam];
    const awayRank = map[awayTeam];

    if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) {
      return json(false, {
        error: "Team not found in Oren rankings.",
        detail: { homeTeam, awayTeam },
      }, 422);
    }

    const result = computeOrenEdge({
      homeRank,
      awayRank,
      closingSpreadHome,
      A,
      k,
      S,
    });

    return json(true, {
      season,
      sport,
      league,
      input: { homeTeam, awayTeam, closingSpreadHome },
      params: { A, k, S },
      ranks: { homeRank, awayRank },
      ...result,
    });
  } catch (e: any) {
    return json(false, { error: "Server error.", detail: String(e?.message ?? e) }, 500);
  }
}