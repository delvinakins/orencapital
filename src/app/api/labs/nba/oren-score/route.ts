// src/app/api/labs/nba/oren-score/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RankRow = {
  team: string;
  rank: number;
  note?: string | null;
  week_start: string;
  season: string;
  league: string;
  sport: string;
  updated_at?: string;
};

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function json(ok: boolean, body: any, status = 200) {
  return NextResponse.json({ ok, ...body }, { status });
}

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Oren Rating: exponential decay from rank.
 * rank 1 has highest rating; bottom ranks approach ~0.
 */
function orenRatingFromRank(rank: number, A: number, k: number): number {
  const r = Number(rank);
  if (!Number.isFinite(r) || r < 1) return 0;
  return A * Math.exp(-k * (r - 1));
}

/**
 * Oren Score = (Oren Implied Spread) - (Closing Spread)
 * Where implied spread is derived from rating difference.
 *
 * We keep it in POINTS so it’s interpretable:
 * +2.0 means "my prior thinks home should be 2 pts more favored than the close"
 */
function orenEdgePts(params: {
  homeRank: number;
  awayRank: number;
  closingSpreadHome: number;
  A: number;
  k: number;
  S: number;
}): { impliedSpreadHome: number; edgePts: number; homeRating: number; awayRating: number } {
  const { homeRank, awayRank, closingSpreadHome, A, k, S } = params;

  const homeRating = orenRatingFromRank(homeRank, A, k);
  const awayRating = orenRatingFromRank(awayRank, A, k);

  const impliedSpreadHome = S * (homeRating - awayRating);
  const edgePts = impliedSpreadHome - closingSpreadHome;

  return { impliedSpreadHome, edgePts, homeRating, awayRating };
}

// GET: returns latest rankings (and map), plus the Oren Score params you’ll use everywhere.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const season = url.searchParams.get("season") || "2025-2026";
    const weekStart = url.searchParams.get("weekStart"); // optional YYYY-MM-DD
    const league = url.searchParams.get("league") || "nba";
    const sport = url.searchParams.get("sport") || "basketball";

    // Default params (tunable later)
    const A = Number(url.searchParams.get("A") ?? 10);     // top strength
    const k = Number(url.searchParams.get("k") ?? 0.12);   // decay rate
    const S = Number(url.searchParams.get("S") ?? 1.0);    // spread scale

    const supabase = supabaseAdmin();

    let resolvedWeekStart = weekStart;

    if (!resolvedWeekStart) {
      const { data: latest, error: latestErr } = await supabase
        .from("oren_power_rankings")
        .select("week_start")
        .eq("sport", sport)
        .eq("league", league)
        .eq("season", season)
        .order("week_start", { ascending: false })
        .limit(1);

      if (latestErr) return json(false, { error: "Supabase query failed.", detail: latestErr.message }, 500);

      resolvedWeekStart = (latest?.[0]?.week_start as any) ?? null;

      if (!resolvedWeekStart) {
        return json(true, {
          sport,
          league,
          season,
          weekStart: null,
          count: 0,
          items: [],
          map: {},
          params: { A, k, S },
        });
      }
    }

    const { data: rows, error } = await supabase
      .from("oren_power_rankings")
      .select("team, rank, note, week_start, season, league, sport, updated_at")
      .eq("sport", sport)
      .eq("league", league)
      .eq("season", season)
      .eq("week_start", resolvedWeekStart)
      .order("rank", { ascending: true });

    if (error) return json(false, { error: "Supabase query failed.", detail: error.message }, 500);

    const items = (rows ?? []) as RankRow[];

    // Map for quick lookup: normalized team -> rank
    const map: Record<string, number> = {};
    for (const r of items) {
      map[normalizeTeam(r.team)] = Number(r.rank);
    }

    return json(true, {
      sport,
      league,
      season,
      weekStart: resolvedWeekStart,
      count: items.length,
      items,
      map,
      params: { A, k, S },
    });
  } catch (e: any) {
    return json(false, { error: "Server error.", detail: String(e?.message ?? e) }, 500);
  }
}

/**
 * POST: compute Oren Score for a specific matchup.
 *
 * Body:
 * {
 *   "season": "2025-2026",
 *   "weekStart": "2026-02-23",   // optional; latest if omitted
 *   "homeTeam": "los angeles lakers",
 *   "awayTeam": "orlando magic",
 *   "closingSpreadHome": -5.5,
 *   "A": 10, "k": 0.12, "S": 1.0   // optional overrides
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return json(false, { error: "Invalid JSON body." }, 400);

    const season = String(body.season ?? "2025-2026");
    const league = String(body.league ?? "nba");
    const sport = String(body.sport ?? "basketball");
    const weekStart = body.weekStart ? String(body.weekStart) : null;

    const homeTeam = normalizeTeam(body.homeTeam);
    const awayTeam = normalizeTeam(body.awayTeam);
    const closingSpreadHome = Number(body.closingSpreadHome);

    if (!homeTeam || !awayTeam || !Number.isFinite(closingSpreadHome)) {
      return json(false, { error: "Missing or invalid homeTeam/awayTeam/closingSpreadHome." }, 400);
    }

    const A = Number(body.A ?? 10);
    const k = Number(body.k ?? 0.12);
    const S = Number(body.S ?? 1.0);

    const supabase = supabaseAdmin();

    let resolvedWeekStart = weekStart;

    if (!resolvedWeekStart) {
      const { data: latest, error: latestErr } = await supabase
        .from("oren_power_rankings")
        .select("week_start")
        .eq("sport", sport)
        .eq("league", league)
        .eq("season", season)
        .order("week_start", { ascending: false })
        .limit(1);

      if (latestErr) return json(false, { error: "Supabase query failed.", detail: latestErr.message }, 500);

      resolvedWeekStart = (latest?.[0]?.week_start as any) ?? null;
      if (!resolvedWeekStart) {
        return json(false, { error: "No rankings found for season." }, 404);
      }
    }

    const { data: rows, error } = await supabase
      .from("oren_power_rankings")
      .select("team, rank")
      .eq("sport", sport)
      .eq("league", league)
      .eq("season", season)
      .eq("week_start", resolvedWeekStart);

    if (error) return json(false, { error: "Supabase query failed.", detail: error.message }, 500);

    const map: Record<string, number> = {};
    for (const r of (rows ?? []) as any[]) map[normalizeTeam(r.team)] = Number(r.rank);

    const homeRank = map[homeTeam];
    const awayRank = map[awayTeam];

    if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) {
      return json(
        false,
        {
          error: "Team not found in rankings for this week.",
          detail: {
            weekStart: resolvedWeekStart,
            missing: {
              homeMissing: !Number.isFinite(homeRank),
              awayMissing: !Number.isFinite(awayRank),
            },
            homeTeam,
            awayTeam,
          },
        },
        422
      );
    }

    const out = orenEdgePts({ homeRank, awayRank, closingSpreadHome, A, k, S });

    return json(true, {
      sport,
      league,
      season,
      weekStart: resolvedWeekStart,
      input: { homeTeam, awayTeam, closingSpreadHome },
      params: { A, k, S },
      ranks: { homeRank, awayRank },
      ratings: { homeRating: out.homeRating, awayRating: out.awayRating },
      impliedSpreadHome: out.impliedSpreadHome,
      orenEdgePts: out.edgePts,
    });
  } catch (e: any) {
    return json(false, { error: "Server error.", detail: String(e?.message ?? e) }, 500);
  }
}