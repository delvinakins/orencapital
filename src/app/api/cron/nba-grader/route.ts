// src/app/api/cron/nba-grader/route.ts
//
// Vercel cron: runs nightly at 9:00 AM PT (17:00 UTC)
// Calls providers directly (no self-HTTP), grades Oren Edge vs ATS,
// upserts to nba_edge_scoreboard. Idempotent.
//
// Manual run: GET /api/cron/nba-grader?secret=<CRON_SECRET>
// Backfill:   GET /api/cron/nba-grader?secret=<CRON_SECRET>&date=2026-03-05

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchApiSportsScores } from "@/lib/labs/nba/providers/scores-apisports";
import { fetchTheOddsApiSpreads } from "@/lib/labs/nba/providers/odds-theoddsapi";
import { makeMatchKey, canonicalTeamName } from "@/lib/labs/nba/providers/normalize";

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

function yesterdayPT(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function toNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") { const n = Number(x); if (Number.isFinite(n)) return n; }
  return null;
}

function roundHalf(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 2) / 2;
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
    const dateKey = url.searchParams.get("date") ?? yesterdayPT();

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

    // ── 3. Fetch scores + odds directly from providers ────────────────────────
    const [scores, odds] = await Promise.all([
      fetchApiSportsScores(),
      fetchTheOddsApiSpreads(),
    ]);

    // Build closing line map from odds (keyed by game_key)
    const closingMap = new Map<string, number>();
    for (const o of odds as any[]) {
      const dk = String(o?.laDateKey ?? "").trim();
      if (dk !== dateKey) continue;
      const away = canonicalTeamName(String(o?.awayTeam ?? "").trim());
      const home = canonicalTeamName(String(o?.homeTeam ?? "").trim());
      if (!away || !home) continue;
      const spread = roundHalf(toNum(o?.liveHomeSpread));
      if (spread != null) closingMap.set(makeMatchKey(away, home, dk), spread);
    }

    // Also load from nba_closing_lines for any games where odds didn't have spread
    const potentialKeys = (scores as any[])
      .filter((s: any) => String(s?.laDateKey ?? "").trim() === dateKey)
      .map((s: any) => {
        const away = canonicalTeamName(String(s?.awayTeam ?? "").trim());
        const home = canonicalTeamName(String(s?.homeTeam ?? "").trim());
        return away && home ? makeMatchKey(away, home, dateKey) : null;
      })
      .filter(Boolean) as string[];

    if (potentialKeys.length > 0) {
      const { data: lines } = await sb
        .from("nba_closing_lines").select("game_key,closing_home_spread").in("game_key", potentialKeys);
      for (const l of lines ?? []) {
        if (!closingMap.has(l.game_key)) {
          const v = roundHalf(toNum(l.closing_home_spread));
          if (v != null) closingMap.set(l.game_key, v);
        }
      }
    }

    // ── 4. Filter finals for target date ──────────────────────────────────────
    const finals = (scores as any[]).filter((s: any) => {
      const dk = String(s?.laDateKey ?? "").trim();
      if (dk !== dateKey) return false;
      const status = String(s?.status ?? "").toLowerCase();
      const isFinal = status.includes("final") || status.includes("finished") || status.includes("ended");
      return isFinal && s?.homeScore != null && s?.awayScore != null;
    });

    if (!finals.length) {
      return NextResponse.json({ ok: true, graded: 0, skipped: 0, message: `No finals for ${dateKey}` });
    }

    // ── 5. Already-graded games ───────────────────────────────────────────────
    const gameIds = finals.map((s: any) => {
      const away = canonicalTeamName(String(s?.awayTeam ?? "").trim());
      const home = canonicalTeamName(String(s?.homeTeam ?? "").trim());
      return makeMatchKey(away, home, dateKey);
    });

    const { data: done } = await sb
      .from("nba_edge_scoreboard").select("game_id").in("game_id", gameIds);
    const doneSet = new Set((done ?? []).map((r: any) => r.game_id));

    // ── 6. Grade and upsert ───────────────────────────────────────────────────
    const upserts: any[] = [];
    let skipped = 0;

    for (const s of finals) {
      const away = canonicalTeamName(String(s?.awayTeam ?? "").trim());
      const home = canonicalTeamName(String(s?.homeTeam ?? "").trim());
      const gameId = makeMatchKey(away, home, dateKey);

      if (doneSet.has(gameId)) { skipped++; continue; }

      const closingHome = closingMap.get(gameId);
      if (closingHome == null) { skipped++; continue; }

      const edge = computeEdge(home, away, closingHome, rankMap, params);
      if (edge == null) { skipped++; continue; }

      const mark = grade(Number(s.homeScore), Number(s.awayScore), closingHome, edge);
      if (!mark) { skipped++; continue; }

      upserts.push({
        game_id:             gameId,
        season,
        league:              "nba",
        sport:               "basketball",
        date_key_pt:         dateKey,
        mark,
        closing_home_spread: closingHome,
        oren_edge_pts:       edge,
        final_home_score:    Number(s.homeScore),
        final_away_score:    Number(s.awayScore),
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