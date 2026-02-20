// src/app/api/labs/nba/live-games/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchApiSportsScores } from "@/lib/labs/nba/providers/scores-apisports";
import { fetchTheOddsApiSpreads } from "@/lib/labs/nba/providers/odds-theoddsapi";
import { makeMatchKey } from "@/lib/labs/nba/providers/normalize";
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

type LiveOk = { ok: true; items: LiveGameItem[]; meta?: { stale?: boolean; updatedAt?: string } };
type LiveResponse = LiveOk | { ok: false };

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
  await sb.from("nba_closing_lines").upsert(rows, { onConflict: "game_key" });
}

/** -------------------------------
 *  Snapshot persistence (Supabase)
 ---------------------------------*/
async function writeSnapshot(payload: LiveOk) {
  const sb = supabaseAdmin();
  await sb
    .from("nba_live_snapshots")
    .upsert({ id: "latest", payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
}

async function readSnapshot(): Promise<LiveOk | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("nba_live_snapshots")
    .select("updated_at, payload")
    .eq("id", "latest")
    .maybeSingle();

  if (error || !data?.payload) return null;

  const payload = data.payload as any;
  if (!payload?.ok || !Array.isArray(payload.items)) return null;

  return {
    ok: true,
    items: payload.items as LiveGameItem[],
    meta: { stale: true, updatedAt: String(data.updated_at ?? "") },
  };
}

/** -------------------------------
 *  Cache + refresh policy
 ---------------------------------*/
// Active window: 90s target refresh (matches your UI interval)
const ACTIVE_REFRESH_MS = 90_000;

// Off-hours: 15 min target refresh
const OFFHOURS_REFRESH_MS = 15 * 60_000;

// small grace so we don't thrash right at boundaries
const GRACE_MS = 5_000;

let cached: { at: number; payload: LiveOk } | null = null;
let inflight: Promise<LiveOk> | null = null;

function nowMs() {
  return Date.now();
}

function isFresh(ts: number, ttlMs: number) {
  return nowMs() - ts <= ttlMs + GRACE_MS;
}

/** -------------------------------
 *  Provider poll + join
 ---------------------------------*/
async function pollProviders(): Promise<LiveOk> {
  const [scores, odds] = await Promise.all([fetchApiSportsScores(), fetchTheOddsApiSpreads()]);

  const oddsByKey = new Map<string, { liveHomeSpread: number | null }>();
  const oddsByMatch = new Map<string, { liveHomeSpread: number | null }>();

  for (const o of odds) {
    const match = `${o.awayTeam}@${o.homeTeam}`;
    oddsByMatch.set(match, { liveHomeSpread: o.liveHomeSpread });
    if (o.laDateKey) oddsByKey.set(`${o.laDateKey}|${match}`, { liveHomeSpread: o.liveHomeSpread });
  }

  const items: LiveGameItem[] = [];
  const gameKeys: string[] = [];
  const closingCandidates: Array<{ gameKey: string; closingHomeSpread: number }> = [];

  for (const s of scores) {
    const match = `${s.awayTeam}@${s.homeTeam}`;
    const gameKey = makeMatchKey(s.awayTeam, s.homeTeam, s.laDateKey);

    gameKeys.push(gameKey);

    const o1 = oddsByKey.get(`${s.laDateKey}|${match}`);
    const o2 = oddsByMatch.get(match);
    const liveSpreadHome = o1?.liveHomeSpread ?? o2?.liveHomeSpread ?? null;

    if (s.status === "scheduled" && typeof liveSpreadHome === "number" && Number.isFinite(liveSpreadHome)) {
      closingCandidates.push({ gameKey, closingHomeSpread: liveSpreadHome });
    }

    const hasAny =
      typeof liveSpreadHome === "number" ||
      typeof s.homeScore === "number" ||
      typeof s.awayScore === "number";

    if (!hasAny) continue;

    items.push({
      gameId: gameKey,
      awayTeam: s.awayTeam,
      homeTeam: s.homeTeam,
      awayScore: s.awayScore,
      homeScore: s.homeScore,
      period: s.period,
      secondsRemaining: s.secondsRemainingInPeriod,
      liveSpreadHome,
      closingSpreadHome: null,
    });
  }

  await ensureClosingLines(closingCandidates);

  const closingMap = await getClosingMap(gameKeys);
  const finalItems = items.map((it) => ({
    ...it,
    closingSpreadHome: closingMap.get(it.gameId) ?? null,
  }));

  return { ok: true, items: finalItems, meta: { stale: false, updatedAt: new Date().toISOString() } };
}

/** -------------------------------
 *  Refresh logic (active vs off-hours)
 ---------------------------------*/
async function getData(): Promise<LiveResponse> {
  const withinActiveWindow = inPollingWindow(new Date());
  const ttl = withinActiveWindow ? ACTIVE_REFRESH_MS : OFFHOURS_REFRESH_MS;

  // If we have fresh in-memory cache for the relevant mode, use it.
  if (cached && isFresh(cached.at, ttl)) {
    // mark stale if off-hours (even if we refreshed recently)
    return withinActiveWindow ? cached.payload : { ...cached.payload, meta: { ...(cached.payload.meta ?? {}), stale: true } };
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await pollProviders();

      cached = { at: nowMs(), payload };
      await writeSnapshot(payload);

      // If we're off-hours, mark stale in response even though it's refreshed
      return withinActiveWindow
        ? payload
        : { ...payload, meta: { ...(payload.meta ?? {}), stale: true } };
    } catch (err: any) {
      console.error("[nba/live-games] poll error:", err?.message ?? err);

      // fall back to in-memory then persisted snapshot
      if (cached) {
        return withinActiveWindow
          ? cached.payload
          : { ...cached.payload, meta: { ...(cached.payload.meta ?? {}), stale: true } };
      }

      const snap = await readSnapshot();
      return snap ?? ({ ok: false } as any);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function GET() {
  try {
    const payload = await getData();
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[nba/live-games] handler error:", err?.message ?? err);
    const snap = await readSnapshot();
    if (snap) return NextResponse.json(snap, { status: 200 });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}