// src/app/api/cron/nba-grader/route.ts
//
// Vercel cron: runs nightly at 9:00 AM PT (17:00 UTC)
// Calls /api/labs/nba/live-games to get last night's finals (live source),
// grades Oren Edge vs ATS, upserts to nba_edge_scoreboard. Idempotent.
//
// Manual run: GET /api/cron/nba-grader?secret=<CRON_SECRET>

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

function orenRating(rank: number, A: number, k: number) {
  return A * Math.exp(-k * (rank - 1));
}

function computeEdge(
  homeTeam: string,
  awayTeam: string,
  closingHome: number,
  rankMap: Record<string, number>,
  params: { A: number; k: number; S: number }
): number | null {
  const hr = rankMap[homeTeam.toLowerCase().trim()];
  const ar = rankMap[awayTeam.toLowerCase().trim()];
  if (!hr || !ar) return null;
  return params.S * (orenRating(hr, params.A, params.k) - orenRating(ar, params.A, params.k)) - closingHome;
}

function grade(
  homeScore: number,
  awayScore: number,
  closingHome: number,
  edge: number
): "hit" | "miss" | "push" | null {
  if (edge === 0) return null;
  const ats = homeScore - awayScore + closingHome;
  if (ats === 0) return "push";
  return (edge > 0) === (ats > 0) ? "hit" : "miss";
}

// Fetch yesterday's finals from the live-games route (the real live source)
async function fetchFinals(baseUrl: string, dateKeyPT: string): Promise<any[]> {
  const url = `${baseUrl}/api/labs/nba/live-games?dateKeyPT=${dateKeyPT}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`live-games fetch failed: ${res.status}`);
  const json = await res.json();
  return (json?.items ?? []).filter(
    (g: any) => g.phase === "final" && g.homeScore != null && g.awayScore != null
  );
}

function yesterdayPT(): string {
  const now = new Date();
  // Subtract 1 day, then format as YYYY-MM-DD in PT
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const fromHeader = req.headers.get("authorization") === `Bearer ${secret}`;
  const fromQuery  = url.searchParams.get("secret") === secret;

  if (!secret || (!fromHeader && !fromQuery)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = getSupabase();
    const season = "2025-2026";

    // ── 1. Load Oren params ───────────────────────────────────────────────────
    const { data: p, error: pErr } = await sb
      .from("nba_oren_params").select("a,k,s").eq("season", season).single();
    if (pErr || !p) throw new Error("Oren params unavailable");
    const params = { A: Number(p.a), k: Number(p.k), S: Number(p.s) };

    // ── 2. Load rankings ──────────────────────────────────────────────────────
    const { data: ranks, error: rErr } = await sb
      .from("nba_power_rankings").select("team,rank").eq("season", season);
    if (rErr) throw new Error("Rankings unavailable");
    const rankMap: Record<string, number> = {};
    for (const r of ranks ?? []) rankMap[r.team.toLowerCase().trim()] = Number(r.rank);

    // ── 3. Fetch yesterday's finals from live-games ───────────────────────────
    // Use the request origin so this works in both prod and preview deployments
    const baseUrl = `${url.protocol}//${url.host}`;
    const dateKey = url.searchParams.get("date") ?? yesterdayPT();
    const finals = await fetchFinals(baseUrl, dateKey);

    if (!finals.length) {
      return NextResponse.json({ ok: true, graded: 0, skipped: 0, message: `No finals for ${dateKey}` });
    }

    const gameIds = finals.map((g: any) => g.gameId as string);

    // ── 4. Already-graded games ───────────────────────────────────────────────
    const { data: done } = await sb
      .from("nba_edge_scoreboard").select("game_id").in("game_id", gameIds);
    const doneSet = new Set((done ?? []).map((r: any) => r.game_id));

    // ── 5. Grade ──────────────────────────────────────────────────────────────
    const upserts: any[] = [];
    let skipped = 0;

    for (const g of finals) {
      if (doneSet.has(g.gameId)) { skipped++; continue; }

      // live-games already attaches closingSpreadHome
      const closingHome = g.closingSpreadHome != null ? Number(g.closingSpreadHome) : null;
      if (closingHome == null) { skipped++; continue; }

      const edge = computeEdge(g.homeTeam, g.awayTeam, closingHome, rankMap, params);
      if (edge == null) { skipped++; continue; }

      const mark = grade(Number(g.homeScore), Number(g.awayScore), closingHome, edge);
      if (!mark) { skipped++; continue; }

      upserts.push({
        game_id:             g.gameId,
        season,
        league:              "nba",
        sport:               "basketball",
        date_key_pt:         (g.gameId as string).split("|")[0] ?? "",
        mark,
        closing_home_spread: closingHome,
        oren_edge_pts:       edge,
        final_home_score:    Number(g.homeScore),
        final_away_score:    Number(g.awayScore),
        ts:                  Date.now(),
        updated_at:          new Date().toISOString(),
      });
    }

    if (upserts.length > 0) {
      const { error: uErr } = await sb
        .from("nba_edge_scoreboard")
        .upsert(upserts, { onConflict: "game_id" });
      if (uErr) throw new Error(`Upsert failed: ${uErr.message}`);
    }

    console.log(`[nba-grader] date=${dateKey} graded=${upserts.length} skipped=${skipped} finals=${finals.length}`);

    return NextResponse.json({
      ok: true,
      date: dateKey,
      graded: upserts.length,
      skipped,
      total_finals: finals.length,
    });

  } catch (err: any) {
    console.error("[nba-grader]", err?.message ?? err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown" }, { status: 500 });
  }
}