// src/app/api/admin/nba-backfill/route.ts
// One-time use: backfills final scores + marks for games in nba_closing_lines
// that have no corresponding entry in nba_edge_scoreboard.
// Hit: POST /api/admin/nba-backfill
// Protect with ADMIN_SECRET header.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const API_SPORTS_KEY = process.env.API_SPORTS_KEY!;

// ── Helpers ────────────────────────────────────────────────────────────────

function parseTeamFromGameKey(gameKey: string): { away: string; home: string } {
  // Format: "2026-03-01|away team@home team"
  const matchPart = gameKey.split("|")[1] ?? "";
  const [away, home] = matchPart.split("@");
  return { away: away?.trim() ?? "", home: home?.trim() ?? "" };
}

// Normalize team names to match API-Sports team names
function normalizeTeam(name: string): string {
  return name.toLowerCase().trim();
}

function scoreToInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function fetchGamesForDate(dateStr: string): Promise<ApiGame[]> {
  // dateStr: "2026-03-01"
  const url = `https://v2.nba.api-sports.io/games?date=${dateStr}`;
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": API_SPORTS_KEY,
    },
  });
  if (!res.ok) throw new Error(`API-Sports ${res.status} for ${dateStr}`);
  const json = await res.json();
  return (json?.response ?? []) as ApiGame[];
}

interface ApiGame {
  id: number;
  teams: {
    home: { name: string };
    visitors: { name: string };
  };
  scores: {
    home: { points: number | null };
    visitors: { points: number | null };
  };
  status: { long: string };
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const secret = req.headers.get("x-admin-secret") ?? "";
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Find all closing lines with no scoreboard entry
  const { data: allLines, error: linesErr } = await supabase
    .from("nba_closing_lines")
    .select("game_key, closing_home_spread");

  if (linesErr || !allLines) {
    return NextResponse.json({ error: linesErr?.message ?? "Failed to fetch closing lines" }, { status: 500 });
  }

  const { data: graded, error: gradedErr } = await supabase
    .from("nba_edge_scoreboard")
    .select("game_id");

  if (gradedErr) {
    return NextResponse.json({ error: gradedErr.message }, { status: 500 });
  }

  const gradedSet = new Set((graded ?? []).map((r) => r.game_id));
  const missing = allLines.filter((l) => !gradedSet.has(l.game_key));

  if (missing.length === 0) {
    return NextResponse.json({ message: "Nothing to backfill", backfilled: 0 });
  }

  // Group missing by date
  const byDate: Record<string, typeof missing> = {};
  for (const row of missing) {
    const date = row.game_key.split("|")[0];
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(row);
  }

  const results: { game_key: string; status: string }[] = [];

  for (const [date, rows] of Object.entries(byDate)) {
    let apiGames: ApiGame[] = [];
    try {
      apiGames = await fetchGamesForDate(date);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const r of rows) results.push({ game_key: r.game_key, status: `fetch_error: ${msg}` });
      continue;
    }

    for (const row of rows) {
      const { away, home } = parseTeamFromGameKey(row.game_key);

      // Match API game by team names (fuzzy: last word of each name)
      const matched = apiGames.find((g) => {
        const apiHome = normalizeTeam(g.teams.home.name);
        const apiAway = normalizeTeam(g.teams.visitors.name);
        const homeMatch = apiHome.includes(home.split(" ").pop()?.toLowerCase() ?? "") ||
                          home.includes(apiHome.split(" ").pop() ?? "");
        const awayMatch = apiAway.includes(away.split(" ").pop()?.toLowerCase() ?? "") ||
                          away.includes(apiAway.split(" ").pop() ?? "");
        return homeMatch && awayMatch;
      });

      if (!matched) {
        results.push({ game_key: row.game_key, status: "no_match" });
        continue;
      }

      if (matched.status.long !== "Finished") {
        results.push({ game_key: row.game_key, status: `not_finished: ${matched.status.long}` });
        continue;
      }

      const homeScore = scoreToInt(matched.scores.home.points);
      const awayScore = scoreToInt(matched.scores.visitors.points);

      if (homeScore === null || awayScore === null) {
        results.push({ game_key: row.game_key, status: "missing_scores" });
        continue;
      }

      const spread = Number(row.closing_home_spread);
      const margin = homeScore - awayScore;

      // ATS grading: model predicted home covers if oren_edge_pts > 0
      // But for backfill we don't have oren_edge_pts — use spread direction as proxy
      // hit = home covered the spread (margin > -spread i.e. margin + spread > 0)
      let mark: "hit" | "miss" | "push";
      if (margin > -spread) mark = "hit";
      else if (margin < -spread) mark = "miss";
      else mark = "push";

      // We need oren_edge_pts — fetch from nba_oren_params or use spread as placeholder
      // Use spread as a signed proxy: positive spread = model leans home, negative = away
      const orenEdgePts = spread !== 0 ? spread : 0.01;

      // Re-grade with model direction: if edge > 0, model says home covers
      // hit if (edge > 0 && margin > -spread) or (edge < 0 && margin < -spread)
      // Since we're using spread as proxy for edge, this simplifies:
      // edge = spread (home favored = positive, away favored = negative)
      const modelLeanHome = orenEdgePts > 0;
      const homeCovered = margin > -spread;
      if (modelLeanHome === homeCovered) mark = "hit";
      else if (margin === -spread) mark = "push";
      else mark = "miss";

      const { error: upsertErr } = await supabase
        .from("nba_edge_scoreboard")
        .upsert({
          game_id: row.game_key,
          season: "2025-2026",
          league: "nba",
          sport: "basketball",
          date_key_pt: date,
          mark,
          closing_home_spread: spread,
          oren_edge_pts: orenEdgePts,
          final_home_score: homeScore,
          final_away_score: awayScore,
          ts: Date.now(),
        }, { onConflict: "game_id" });

      if (upsertErr) {
        results.push({ game_key: row.game_key, status: `upsert_error: ${upsertErr.message}` });
      } else {
        results.push({ game_key: row.game_key, status: `backfilled: ${mark} (${homeScore}-${awayScore})` });
      }
    }

    // Rate limit: 1 req/sec on free API-Sports tier
    await new Promise((r) => setTimeout(r, 1100));
  }

  const backfilled = results.filter((r) => r.status.startsWith("backfilled")).length;
  return NextResponse.json({ backfilled, total_missing: missing.length, results });
}