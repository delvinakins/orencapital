import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mark = "hit" | "miss" | "push";

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

function sign(x: number) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function orenRating(rank: number, A: number, k: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return A * Math.exp(-k * (rank - 1));
}

function computeOrenEdgePts(args: {
  homeTeam: string;
  awayTeam: string;
  closingSpreadHome: number;
  rankMap: Record<string, number>;
  params: { A: number; k: number; S: number };
}): number | null {
  const { homeTeam, awayTeam, closingSpreadHome, rankMap, params } = args;

  const homeRank = rankMap[normalizeTeam(homeTeam)];
  const awayRank = rankMap[normalizeTeam(awayTeam)];
  if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) return null;

  const homeRating = orenRating(homeRank, params.A, params.k);
  const awayRating = orenRating(awayRank, params.A, params.k);

  const impliedSpreadHome = params.S * (homeRating - awayRating);
  return impliedSpreadHome - closingSpreadHome;
}

function dateKeyFromGameId(gameId: string): string | null {
  const k = String(gameId || "").split("|")[0]?.trim();
  if (!k || k.length !== 10) return null;
  return k;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * POST /api/labs/nba/scoreboard/sync?season=2025-2026&league=nba&sport=basketball
 *
 * Server-trusted grading:
 * - pulls /api/labs/nba/live-games (finals included)
 * - pulls /api/labs/nba/oren-score (rank map + params)
 * - computes Oren edge sign vs ATS outcome vs closing spread
 * - upserts into public.nba_edge_scoreboard (PK = game_id)
 *
 * Returns global totals after sync.
 */
export async function POST(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  let sb;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    return jsonError(500, "Supabase misconfigured.", e?.message || String(e));
  }

  // 1) Pull Oren score model (server-side)
  const orenRes = await fetch(`${origin}/api/labs/nba/oren-score?season=${encodeURIComponent(season)}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!orenRes) return jsonError(502, "Unable to reach oren-score route.");
  const orenCt = orenRes.headers.get("content-type") || "";
  if (!orenCt.includes("application/json")) return jsonError(502, "oren-score returned non-JSON.");

  const orenJson = await orenRes.json().catch(() => null);
  const rankMap = orenJson?.map && typeof orenJson.map === "object" ? (orenJson.map as Record<string, number>) : null;

  const A = num(orenJson?.params?.A) ?? 10;
  const k = num(orenJson?.params?.k) ?? 0.12;
  const S = num(orenJson?.params?.S) ?? 1.0;

  if (!rankMap) {
    return jsonError(500, "Oren score map missing.", {
      hint: "Your /api/labs/nba/oren-score must return { ok: true, map: {...}, params: {A,k,S} }",
    });
  }

  // 2) Pull live-games (includes finals)
  const liveRes = await fetch(`${origin}/api/labs/nba/live-games`, { cache: "no-store" }).catch(() => null);
  if (!liveRes) return jsonError(502, "Unable to reach live-games route.");

  const liveCt = liveRes.headers.get("content-type") || "";
  if (!liveCt.includes("application/json")) return jsonError(502, "live-games returned non-JSON.");

  const liveJson = await liveRes.json().catch(() => null);
  if (!liveJson?.ok || !Array.isArray(liveJson.items)) {
    return jsonError(502, "live-games returned unexpected payload.", liveJson);
  }

  const finals = (liveJson.items as any[]).filter((g) => String(g?.phase ?? "").toLowerCase().trim() === "final");

  // 3) Build upsert payload from finals
  const nowTs = Date.now();
  const rows: any[] = [];

  for (const g of finals) {
    const gameId = String(g?.gameId ?? "").trim();
    if (!gameId) continue;

    const awayTeam = String(g?.awayTeam ?? "").trim();
    const homeTeam = String(g?.homeTeam ?? "").trim();

    const finalAway = int(g?.awayScore);
    const finalHome = int(g?.homeScore);

    const close = num(g?.closingSpreadHome);
    if (close == null) continue;
    if (finalHome == null || finalAway == null) continue;

    const dateKeyPT = dateKeyFromGameId(gameId);
    if (!dateKeyPT) continue;

    const edge = computeOrenEdgePts({
      homeTeam,
      awayTeam,
      closingSpreadHome: close,
      rankMap,
      params: { A, k, S },
    });
    if (edge == null || !Number.isFinite(edge)) continue;

    // ATS outcome from home perspective: (home - away) + closeHomeSpread
    const atsMargin = finalHome - finalAway + close;
    const atsSign = sign(atsMargin);

    let mark: Mark;
    if (atsSign === 0) {
      mark = "push";
    } else {
      const pred = sign(edge); // + => lean home, - => lean away
      mark = pred !== 0 && pred === atsSign ? "hit" : "miss";
    }

    rows.push({
      game_id: gameId,
      season,
      league,
      sport,
      date_key_pt: dateKeyPT,
      mark,
      closing_home_spread: close,
      oren_edge_pts: edge,
      final_home_score: finalHome,
      final_away_score: finalAway,
      ts: nowTs,
      updated_at: new Date().toISOString(),
    });
  }

  // 4) Upsert
  if (rows.length > 0) {
    const { error: upErr } = await sb.from("nba_edge_scoreboard").upsert(rows, {
      onConflict: "game_id",
      ignoreDuplicates: false,
    });
    if (upErr) return jsonError(500, "Supabase upsert failed.", upErr.message);
  }

  // 5) Return global totals (season scoped)
  const { data: all, error: readErr } = await sb
    .from("nba_edge_scoreboard")
    .select("mark")
    .eq("season", season)
    .eq("league", league)
    .eq("sport", sport)
    .limit(200000);

  if (readErr) return jsonError(500, "Supabase read failed.", readErr.message);

  let hits = 0;
  let misses = 0;
  let push = 0;

  for (const r of (all || []) as any[]) {
    if (r?.mark === "hit") hits++;
    else if (r?.mark === "miss") misses++;
    else if (r?.mark === "push") push++;
  }

  const denom = hits + misses;
  const hitRate = denom > 0 ? hits / denom : null;

  return NextResponse.json({
    ok: true,
    season,
    league,
    sport,
    syncedFinalsSeen: finals.length,
    upsertAttempted: rows.length,
    totals: { hits, misses, push, hitRate },
  });
}