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
 * Fix in this version:
 * - Tolerant field mapping for period/clock/spreads + supports multiple payload shapes
 * - Debug mode to return why rows are being skipped
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

function pick<T>(...vals: T[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function getGameId(g: any): string | null {
  const v = pick(g?.gameId, g?.game_id, g?.id, g?.eventId, g?.event_id);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function getPeriod(g: any): number | null {
  // common
  const direct = int(pick(g?.period, g?.q, g?.quarter, g?.currentPeriod, g?.current_period));
  if (direct != null) return direct;

  // sometimes nested: g.clock.period, g.game.clock.period, g.state.period
  const nested = int(
    pick(
      g?.clock?.period,
      g?.game?.clock?.period,
      g?.state?.period,
      g?.status?.period,
      g?.status?.periodNumber
    )
  );
  return nested;
}

function getSecondsRemaining(g: any): number | null {
  // common
  const direct = int(
    pick(
      g?.secondsRemaining,
      g?.seconds_remaining,
      g?.secondsRemainingInPeriod,
      g?.seconds_remaining_in_period,
      g?.clockSecondsRemaining,
      g?.clock_seconds_remaining
    )
  );
  if (direct != null) return direct;

  // sometimes nested: g.clock.secondsRemainingInPeriod, g.state.secondsRemainingInPeriod
  const nested = int(
    pick(
      g?.clock?.secondsRemaining,
      g?.clock?.secondsRemainingInPeriod,
      g?.game?.clock?.secondsRemainingInPeriod,
      g?.state?.secondsRemainingInPeriod,
      g?.status?.clock?.secondsRemainingInPeriod
    )
  );
  return nested;
}

function getClosingHomeSpread(g: any): number | null {
  const v = num(
    pick(
      g?.closingSpreadHome,
      g?.closing_spread_home,
      g?.closingSpread,
      g?.closing_spread,
      g?.closingHomeSpread,
      g?.market?.closingHomeSpread,
      g?.market?.closing_home_spread,
      g?.lines?.closing?.spreadHome,
      g?.lines?.closing?.homeSpread,
      g?.closing?.homeSpread,
      g?.close?.homeSpread,
      g?.closingSpread?.home
    )
  );
  return v;
}

function getLiveHomeSpread(g: any): number | null {
  const v = num(
    pick(
      g?.liveSpreadHome,
      g?.live_spread_home,
      g?.liveSpread,
      g?.live_spread,
      g?.liveHomeSpread,
      g?.market?.liveHomeSpread,
      g?.market?.live_home_spread,
      g?.lines?.live?.spreadHome,
      g?.lines?.live?.homeSpread,
      g?.live?.homeSpread,
      g?.inplay?.homeSpread
    )
  );
  return v;
}

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
  // debug=1 returns sample of skip reasons + first item keys
  const debug = searchParams.get("debug") === "1";

  // Call your live feed API (server-side) so we reuse provider logic
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

  const payload: any[] = [];
  let skipped = 0;

  const skipReasons: Record<string, number> = {
    missing_game_id: 0,
    missing_period: 0,
    missing_seconds_remaining: 0,
    missing_closing_spread: 0,
    missing_live_spread: 0,
    non_regulation_period: 0,
  };

  const firstItemKeys = debug
    ? Object.keys(items[0] || {}).slice(0, 80) // enough to see the shape
    : null;

  const examples: any[] = [];

  for (const g of items) {
    const gameId = getGameId(g);
    const period = getPeriod(g);
    const secondsRemaining = getSecondsRemaining(g);
    const closing = getClosingHomeSpread(g);
    const live = getLiveHomeSpread(g);

    let ok = true;

    if (!gameId) {
      skipReasons.missing_game_id++;
      ok = false;
    }
    if (period == null) {
      skipReasons.missing_period++;
      ok = false;
    }
    if (secondsRemaining == null) {
      skipReasons.missing_seconds_remaining++;
      ok = false;
    }
    if (closing == null) {
      skipReasons.missing_closing_spread++;
      ok = false;
    }
    if (live == null) {
      skipReasons.missing_live_spread++;
      ok = false;
    }
    if (period != null && (period < 1 || period > 4)) {
      skipReasons.non_regulation_period++;
      ok = false;
    }

    if (!ok) {
      skipped++;
      if (debug && examples.length < 3) {
        examples.push({
          gameId,
          period,
          secondsRemaining,
          closing,
          live,
          // show a small slice of the object so we can adapt mapping further if needed
          sample: {
            gameId: g?.gameId,
            id: g?.id,
            period: g?.period,
            secondsRemaining: g?.secondsRemaining,
            secondsRemainingInPeriod: g?.secondsRemainingInPeriod,
            closingSpreadHome: g?.closingSpreadHome,
            liveSpreadHome: g?.liveSpreadHome,
            market: g?.market,
            clock: g?.clock,
            state: g?.state,
            lines: g?.lines,
            phase: g?.phase,
          },
        });
      }
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
    });
  }

  if (payload.length === 0) {
    return jsonError(
      400,
      "No usable rows to ingest.",
      debug
        ? {
            message: `All games were skipped. skipped=${skipped}.`,
            skipReasons,
            firstItemKeys,
            examples,
            hint: "Your live-games route likely uses different field names for period/clock/spreads. Use debug output above to update mapping.",
          }
        : `All games were skipped. skipped=${skipped}. Check live-games payload fields.`
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
      ...(debug ? { skipReasons, firstItemKeys, examples } : {}),
    });
  }

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