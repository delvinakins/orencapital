// src/app/api/labs/nba/snapshots/ingest/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only ingest:
 * - Calls your existing /api/labs/nba/live-games
 * - Stores periodic snapshots into public.nba_line_snapshots
 *
 * This is what makes "real distributions" possible over time.
 *
 * Security:
 * - Requires header: x-admin-token == process.env.ADMIN_SEED_TOKEN
 */

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

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, key, { auth: { persistSession: false } });
}

type LiveGame = any;

export async function POST(req: Request) {
  const adminToken = req.headers.get("x-admin-token") || "";
  const expected = process.env.ADMIN_SEED_TOKEN || "";

  if (!expected) return jsonError(500, "Server misconfigured.", "Missing ADMIN_SEED_TOKEN env var.");
  if (!adminToken || adminToken !== expected) return jsonError(401, "Unauthorized.");

  const { searchParams, origin } = new URL(req.url);

  const season = (searchParams.get("season") || "2025-2026").trim();
  const league = (searchParams.get("league") || "nba").trim();
  const sport = (searchParams.get("sport") || "basketball").trim();

  // dryRun=1 will validate + count without writing
  const dryRun = searchParams.get("dryRun") === "1";

  // Call your live feed API (server-side) so we reuse whatever provider logic you already built.
  const liveRes = await fetch(`${origin}/api/labs/nba/live-games`, { cache: "no-store" }).catch(() => null);
  if (!liveRes) return jsonError(502, "Unable to reach live feed route.");

  const ct = liveRes.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return jsonError(502, "Live feed returned non-JSON response.", { contentType: ct });
  }

  const liveJson = await liveRes.json().catch(() => null);
  if (!liveJson?.ok || !Array.isArray(liveJson.items)) {
    return jsonError(502, "Live feed returned unexpected payload.", liveJson);
  }

  const items = liveJson.items as LiveGame[];
  if (items.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: 0, note: "No games available." });
  }

  // Map live feed items -> snapshots rows
  const payload: any[] = [];
  let skipped = 0;

  for (const g of items) {
    const gameId = String(g?.gameId ?? g?.id ?? "").trim();
    const period = int(g?.period);
    const secondsRemaining = int(g?.secondsRemaining ?? g?.seconds_remaining);

    // Your client uses these names; keep tolerant mapping anyway.
    const closing = num(g?.closingSpreadHome ?? g?.closing_home_spread ?? g?.closingSpread);
    const live = num(g?.liveSpreadHome ?? g?.live_home_spread ?? g?.liveSpread);

    if (!gameId || period == null || secondsRemaining == null || closing == null || live == null) {
      skipped++;
      continue;
    }

    // Only regulation for now. OT can be added later.
    if (period < 1 || period > 4) {
      skipped++;
      continue;
    }

    payload.push({
      sport,
      league,
      season,
      game_id: gameId,
      period,
      seconds_remaining_in_period: secondsRemaining,
      closing_home_spread: closing,
      live_home_spread: live,
      // created_at defaults to now()
    });
  }

  if (payload.length === 0) {
    return jsonError(
      400,
      "No usable rows to ingest.",
      `All games were skipped. skipped=${skipped}. Check live-games payload fields.`
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      season,
      sport,
      league,
      wouldInsert: payload.length,
      skipped,
    });
  }

  // Write
  let sb;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    return jsonError(500, "Supabase misconfigured.", e?.message || String(e));
  }

  const { error } = await sb.from("nba_line_snapshots").insert(payload);
  if (error) return jsonError(500, "Supabase insert failed.", error.message);

  return NextResponse.json({
    ok: true,
    season,
    sport,
    league,
    inserted: payload.length,
    skipped,
  });
}