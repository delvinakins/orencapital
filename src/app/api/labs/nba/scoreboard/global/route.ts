// src/app/api/labs/nba/scoreboard/global/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, detail?: any) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * GET /api/labs/nba/scoreboard/global?season=2025-2026&league=nba&sport=basketball
 *
 * Returns season-scoped global totals from public.nba_edge_scoreboard.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  let sb;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    return jsonError(500, "Supabase misconfigured.", e?.message || String(e));
  }

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
    totals: { hits, misses, push, hitRate },
  });
}