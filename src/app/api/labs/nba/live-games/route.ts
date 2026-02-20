// src/app/api/labs/nba/live-games/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSportsDataIoScores } from "@/lib/labs/nba/providers/scores-sportsdataio";
import { fetchTheOddsApiSpreads } from "@/lib/labs/nba/providers/odds-theoddsapi";
import { makeMatchKey, canonicalTeamName } from "@/lib/labs/nba/providers/normalize";
import { inPollingWindow } from "@/lib/labs/nba/poll-window";

type LiveGameItem = {
  gameId: string;

  awayTeam: string;
  homeTeam: string;

  awayScore: number | null;
  homeScore: number | null;

  period: number | null;
  secondsRemaining: number | null;

  liveSpreadHome: number | null;
  closingSpreadHome: number | null;
};

type LiveResponse = { ok: true; items: LiveGameItem[] } | { ok: false };

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getClosingMap(keys: string[]) {
  if (keys.length === 0) return new Map<string, number>();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("nba_closing_lines")
    .select("game_key, closing_home_spread")
    .in("game_key", keys);

  if (error || !Array.isArray(data)) return new Map<string, number>();

  const map = new Map<string, number>();
  for (const row of data as any[]) {
    if (typeof row?.game_key === "string" && typeof row?.closing_home_spread === "number") {
      map.set(row.game_key, row.closing_home_spread);
    }
  }
  return map;
}

async function ensureClosingLines(candidates: Array<{ gameKey: string; closingHomeSpread: number }>) {
  if (candidates.length === 0) return;

  const sb = supabaseAdmin();

  const seen = new Set<string>();
  const rows = [];
  for (const c of candidates) {
    if (!c.gameKey || !Number.isFinite(c.closingHomeSpread)) continue;
    if (seen.has(c.gameKey)) continue;
    seen.add(c.gameKey);
    rows.push({ game_key: c.gameKey, closing_home_spread: c.closingHomeSpread });
  }
  if (rows.length === 0) return;

  // Idempotent: if already exists, we accept existing. (Upsert avoids throwing.)
  await sb.from("nba_closing_lines").upsert(rows, { onConflict: "game_key" });
}

/** -------------------------------
 *  In-memory cache + lock
 *  (prevents N concurrent requests from triggering N provider polls)
 ---------------------------------*/
const CACHE_TTL_MS = 90_000; // target refresh interval
const STALE_GRACE_MS = 10_000; // allow slightly stale without re-polling
const HARD_STALE_MS = 10 * 60_000; // if super stale, we still return it but label ok:false on errors

let cached: { at: number; payload: LiveResponse } | null = null;
let inflight: Promise<LiveResponse> | null = null;

function nowMs() {
  return Date.now();
}

function isFresh(ts: number) {
  return nowMs() - ts <= CACHE_TTL_MS + STALE_GRACE_MS;
}

function isHardStale(ts: number) {
  return nowMs() - ts > HARD_STALE_MS;
}

/** -------------------------------
 *  Provider poll + normalization
 ---------------------------------*/
async function pollProviders(): Promise<LiveResponse> {
  const [scores, odds] = await Promise.all([fetchSportsDataIoScores(), fetchTheOddsApiSpreads()]);

  // Odds map by canonical "away@home"
  const oddsByMatch = new Map<string, { liveHomeSpread: number | null }>();
  for (const o of odds) {
    const away = canonicalTeamName(o.awayTeam);
    const home = canonicalTeamName(o.homeTeam);
    oddsByMatch.set(`${away}@${home}`, { liveHomeSpread: o.liveHomeSpread });
  }

  // Build game keys from score feed (dateKey included there)
  const gameKeys: string[] = [];
  const matchKeyForScore = new Map<string, string>(); // providerGameId -> gameKey
  const closingCandidates: Array<{ gameKey: string; closingHomeSpread: number }> = [];

  for (const s of scores) {
    const away = canonicalTeamName(s.awayTeam);
    const home = canonicalTeamName(s.homeTeam);

    const gameKey = makeMatchKey(away, home, s.dateKey);
    matchKeyForScore.set(s.providerGameId, gameKey);
    gameKeys.push(gameKey);

    const oddsKey = `${away}@${home}`;
    const o = oddsByMatch.get(oddsKey);
    const live = o?.liveHomeSpread ?? null;

    // Store "closing" as the first pre-tip spread we see (simple, stable baseline).
    if (s.status === "scheduled" && typeof live === "number" && Number.isFinite(live)) {
      closingCandidates.push({ gameKey, closingHomeSpread: live });
    }
  }

  await ensureClosingLines(closingCandidates);

  const closingMap = await getClosingMap(gameKeys);

  const items: LiveGameItem[] = [];

  for (const s of scores) {
    const away = canonicalTeamName(s.awayTeam);
    const home = canonicalTeamName(s.homeTeam);

    const oddsKey = `${away}@${home}`;
    const o = oddsByMatch.get(oddsKey);
    const liveSpreadHome = o?.liveHomeSpread ?? null;

    const gameKey = matchKeyForScore.get(s.providerGameId) ?? makeMatchKey(away, home, s.dateKey);
    const closingSpreadHome = closingMap.get(gameKey) ?? null;

    const hasAny =
      typeof liveSpreadHome === "number" ||
      typeof s.homeScore === "number" ||
      typeof s.awayScore === "number";

    if (!hasAny) continue;

    items.push({
      gameId: gameKey,

      awayTeam: away,
      homeTeam: home,

      awayScore: s.awayScore,
      homeScore: s.homeScore,

      period: s.period,
      secondsRemaining: s.secondsRemainingInPeriod,

      liveSpreadHome,
      closingSpreadHome,
    });
  }

  return { ok: true, items };
}

/** -------------------------------
 *  Cached fetch with window control
 ---------------------------------*/
async function getLiveData(): Promise<LiveResponse> {
  // If we already have fresh cache, serve it
  if (cached && cached.payload.ok && isFresh(cached.at)) return cached.payload;

  // Outside window: do NOT poll providers. Serve last cached snapshot if available.
  const within = inPollingWindow(new Date());
  if (!within) {
    if (cached?.payload?.ok) return cached.payload;
    return { ok: false };
  }

  // Inside window: allow polling, but only one at a time
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await pollProviders();
      cached = { at: nowMs(), payload };
      return payload;
    } catch (err: any) {
      // Server-only detail
      console.error("[nba/live-games] poll error:", err?.message ?? err);

      // If we have any cached snapshot (even stale), serve it rather than blanking out.
      if (cached?.payload?.ok) {
        // If it's extremely stale, you might prefer ok:false; we keep serving it as ok:true
        // because the UI is "watchlist" and stale is better than empty.
        return cached.payload;
      }

      return { ok: false };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function GET() {
  try {
    const payload = await getLiveData();

    // Always return JSON. UI already handles ok:false safely.
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[nba/live-games] handler error:", err?.message ?? err);

    // Serve cached if possible
    if (cached?.payload?.ok && !isHardStale(cached.at)) {
      return NextResponse.json(cached.payload, { status: 200 });
    }

    return NextResponse.json({ ok: false }, { status: 200 });
  }
}