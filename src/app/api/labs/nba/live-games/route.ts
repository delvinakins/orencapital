// src/app/api/labs/nba/live-games/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchApiSportsScores } from "@/lib/labs/nba/providers/scores-apisports";
import { fetchTheOddsApiSpreads } from "@/lib/labs/nba/providers/odds-theoddsapi";
import { makeMatchKey } from "@/lib/labs/nba/providers/normalize";
import { inPollingWindow } from "@/lib/labs/nba/poll-window";

type Phase = "pregame" | "live" | "final" | "unknown";

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
  phase: Phase;
};

type LiveOk = {
  ok: true;
  items: LiveGameItem[];
  meta: {
    stale: boolean;
    updatedAt: string;
    window: "active" | "offhours";
    storage: "supabase" | "none";
  };
};

type LiveResponse = LiveOk | { ok: false };

function nowIso() {
  return new Date().toISOString();
}

function supabaseAdminOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getClosingMap(keys: string[]) {
  const sb = supabaseAdminOrNull();
  if (!sb || keys.length === 0) return new Map<string, number>();

  const { data } = await sb
    .from("nba_closing_lines")
    .select("game_key, closing_home_spread")
    .in("game_key", keys);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    if (row?.game_key && typeof row?.closing_home_spread === "number") {
      map.set(row.game_key, row.closing_home_spread);
    }
  }
  return map;
}

async function seedClosingLines(rows: { gameKey: string; spread: number }[]) {
  const sb = supabaseAdminOrNull();
  if (!sb || rows.length === 0) return;

  const existing = await getClosingMap(rows.map(r => r.gameKey));
  const toInsert = rows.filter(r => !existing.has(r.gameKey));
  if (toInsert.length === 0) return;

  await sb.from("nba_closing_lines").upsert(
    toInsert.map(r => ({
      game_key: r.gameKey,
      closing_home_spread: r.spread,
    })),
    { onConflict: "game_key" }
  );
}

function classifyPhase(period: number | null, status: string): Phase {
  const s = status.toLowerCase();
  if (s.includes("finished") || s.includes("final")) return "final";
  if (period != null && period >= 1) return "live";
  return "pregame";
}

async function pollProviders(withinActiveWindow: boolean): Promise<LiveOk> {
  const [scores, odds] = await Promise.all([
    fetchApiSportsScores(),
    fetchTheOddsApiSpreads(),
  ]);

  const oddsMap = new Map<string, number | null>();
  for (const o of odds) {
    const key = makeMatchKey(
      o.awayTeam,
      o.homeTeam,
      o.laDateKey ?? ""   // ✅ FIXED null safety
    );
    oddsMap.set(key, o.liveHomeSpread ?? null);
  }

  const items: LiveGameItem[] = [];
  const seen = new Set<string>();

  for (const s of scores) {
    const gameKey = makeMatchKey(
      s.awayTeam,
      s.homeTeam,
      s.laDateKey ?? ""   // ✅ FIXED null safety
    );

    if (seen.has(gameKey)) continue;
    seen.add(gameKey);

    const liveSpreadHome = oddsMap.get(gameKey) ?? null;
    const phase = classifyPhase(s.period, s.status);

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
      phase,
    });
  }

  // --------------------------------
  // Seed baseline ONLY during pregame
  // --------------------------------
  const toSeed = items
    .filter(
      g =>
        g.phase === "pregame" &&
        (g.period == null || g.period === 0) &&
        typeof g.liveSpreadHome === "number"
    )
    .map(g => ({
      gameKey: g.gameId,
      spread: g.liveSpreadHome as number,
    }));

  await seedClosingLines(toSeed);

  const closingMap = await getClosingMap(items.map(i => i.gameId));

  const enriched = items.map(g => ({
    ...g,
    closingSpreadHome:
      closingMap.get(g.gameId) ??
      (typeof g.liveSpreadHome === "number"
        ? g.liveSpreadHome
        : null),
  }));

  return {
    ok: true,
    items: enriched,
    meta: {
      stale: !withinActiveWindow,
      updatedAt: nowIso(),
      window: withinActiveWindow ? "active" : "offhours",
      storage: supabaseAdminOrNull() ? "supabase" : "none",
    },
  };
}

/** Simple in-memory cache */
const ACTIVE_REFRESH_MS = 90_000;
const OFFHOURS_REFRESH_MS = 15 * 60_000;

let cached: { at: number; payload: LiveOk } | null = null;

function isFresh(ts: number, ttl: number) {
  return Date.now() - ts <= ttl;
}

async function getData(): Promise<LiveResponse> {
  const withinActiveWindow = inPollingWindow(new Date());
  const ttl = withinActiveWindow
    ? ACTIVE_REFRESH_MS
    : OFFHOURS_REFRESH_MS;

  if (cached && isFresh(cached.at, ttl)) return cached.payload;

  try {
    const payload = await pollProviders(withinActiveWindow);
    cached = { at: Date.now(), payload };
    return payload;
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const payload = await getData();
  return NextResponse.json(payload);
}