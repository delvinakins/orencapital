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
    updatedAt: string; // ISO
    window: "active" | "offhours";
    storage?: "supabase" | "none";
    // You had extra fields at one point; leaving room is fine.
    supabase?: { hasUrl: boolean; hasServiceKey: boolean; enabled: boolean };
  };
};

type LiveResponse = LiveOk | { ok: false };

function nowIso() {
  return new Date().toISOString();
}

/**
 * IMPORTANT: Do not throw if missing env vars.
 * If Supabase isn't configured in Production yet, we still want the route to work.
 */
function supabaseAdminOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("[nba/live-games] Supabase admin unavailable (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    return null;
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

async function readSnapshot(): Promise<LiveOk | null> {
  try {
    const sb = supabaseAdminOrNull();
    if (!sb) return null;

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
      meta: {
        stale: true,
        updatedAt: String(data.updated_at ?? payload?.meta?.updatedAt ?? nowIso()),
        window: "offhours",
        storage: "supabase",
      },
    };
  } catch (err: any) {
    console.error("[nba/live-games] readSnapshot error:", err?.message ?? err);
    return null;
  }
}

async function writeSnapshot(payload: LiveOk) {
  try {
    const sb = supabaseAdminOrNull();
    if (!sb) return;

    await sb.from("nba_live_snapshots").upsert(
      { id: "latest", payload, updated_at: nowIso() },
      { onConflict: "id" }
    );
  } catch (err: any) {
    console.error("[nba/live-games] writeSnapshot error:", err?.message ?? err);
  }
}

async function getClosingMap(keys: string[]) {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;

  try {
    const sb = supabaseAdminOrNull();
    if (!sb) return map;

    const { data, error } = await sb
      .from("nba_closing_lines")
      .select("game_key, closing_home_spread")
      .in("game_key", keys);

    if (error || !Array.isArray(data)) return map;

    for (const row of data as any[]) {
      if (typeof row?.game_key === "string" && typeof row?.closing_home_spread === "number") {
        map.set(row.game_key, row.closing_home_spread);
      }
    }

    return map;
  } catch (err: any) {
    console.error("[nba/live-games] getClosingMap error:", err?.message ?? err);
    return map;
  }
}

/**
 * IMPORTANT:
 * - Seed baseline ONLY when missing (do NOT overwrite).
 * - "Closing" for now means "first seen pregame".
 */
async function ensureClosingLines(candidates: Array<{ gameKey: string; closingHomeSpread: number }>) {
  if (candidates.length === 0) return;

  try {
    const sb = supabaseAdminOrNull();
    if (!sb) return;

    // De-dupe candidates
    const seen = new Set<string>();
    const unique: Array<{ gameKey: string; closingHomeSpread: number }> = [];
    for (const c of candidates) {
      if (!c.gameKey || !Number.isFinite(c.closingHomeSpread)) continue;
      if (seen.has(c.gameKey)) continue;
      seen.add(c.gameKey);
      unique.push(c);
    }

    if (unique.length === 0) return;

    // Only insert rows that do NOT already exist
    const existing = await getClosingMap(unique.map((u) => u.gameKey));
    const toInsert = unique
      .filter((u) => !existing.has(u.gameKey))
      .map((u) => ({ game_key: u.gameKey, closing_home_spread: u.closingHomeSpread }));

    if (toInsert.length === 0) return;

    await sb.from("nba_closing_lines").insert(toInsert);
  } catch (err: any) {
    // insert may error on conflicts if race; that's ok—baseline already exists
    const msg = String(err?.message ?? err);
    if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("conflict")) {
      console.error("[nba/live-games] ensureClosingLines error:", err?.message ?? err);
    }
  }
}

function classifyPhase(
  it: { period: number | null; awayScore: number | null; homeScore: number | null },
  status?: string
): Phase {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("final") || s.includes("finished")) return "final";

  const hasScore = typeof it.awayScore === "number" && typeof it.homeScore === "number";
  const p = typeof it.period === "number" ? it.period : null;

  if (p != null && p >= 1 && hasScore) return "live";
  if (p != null && p >= 1 && !hasScore) return "unknown";
  return "pregame";
}

async function pollProviders(withinActiveWindow: boolean): Promise<LiveOk> {
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

  // Primary: scores feed
  for (const s of scores) {
    const match = `${s.awayTeam}@${s.homeTeam}`;

    // ✅ null-safe dateKey if your type ever wobbles
    const laDateKey = (s as any)?.laDateKey ?? "";
    const gameKey = makeMatchKey(s.awayTeam, s.homeTeam, laDateKey);

    gameKeys.push(gameKey);

    const o1 = oddsByKey.get(`${laDateKey}|${match}`);
    const o2 = oddsByMatch.get(match);
    const liveSpreadHome = o1?.liveHomeSpread ?? o2?.liveHomeSpread ?? null;

    // ✅ Seed baseline ONLY pregame, period 0, scheduled
    const isPregameSeed =
      s.status === "scheduled" && (s.period == null || s.period === 0);

    if (isPregameSeed && typeof liveSpreadHome === "number" && Number.isFinite(liveSpreadHome)) {
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
      phase: classifyPhase(s, String(s.status ?? "")),
    });
  }

  // Fallback: odds-only (still show something)
  if (items.length === 0 && odds.length > 0) {
    for (const o of odds) {
      const gameKey = makeMatchKey(o.awayTeam, o.homeTeam, o.laDateKey || "");
      gameKeys.push(gameKey);

      // ✅ Seed baseline ONLY if odds-only AND we are clearly pregame (no scores feed)
      // We cannot be sure; so we do NOT seed here to avoid creating fake baselines.
      // (If you want to seed odds-only later, we can do it with stronger checks.)

      items.push({
        gameId: gameKey,
        awayTeam: o.awayTeam,
        homeTeam: o.homeTeam,
        awayScore: null,
        homeScore: null,
        period: null,
        secondsRemaining: null,
        liveSpreadHome: o.liveHomeSpread ?? null,
        closingSpreadHome: null,
        phase: "pregame",
      });
    }
  }

  // ✅ Persist baselines (no overwrite)
  await ensureClosingLines(closingCandidates);

  // ✅ Attach baselines; IMPORTANT: do NOT fall back to live
  const closingMap = await getClosingMap(gameKeys);
  const finalItems = items.map((it) => ({
    ...it,
    closingSpreadHome: closingMap.get(it.gameId) ?? null,
  }));

  const sb = supabaseAdminOrNull();
  const storage = sb ? "supabase" : "none";

  return {
    ok: true,
    items: finalItems,
    meta: {
      stale: !withinActiveWindow,
      updatedAt: nowIso(),
      window: withinActiveWindow ? "active" : "offhours",
      storage,
      supabase: {
        hasUrl: Boolean(process.env.SUPABASE_URL),
        hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        enabled: Boolean(sb),
      },
    },
  };
}

/** Cache policy */
const ACTIVE_REFRESH_MS = 90_000;
const OFFHOURS_REFRESH_MS = 15 * 60_000;
const GRACE_MS = 5_000;

let cached: { at: number; payload: LiveOk } | null = null;
let inflight: Promise<LiveOk> | null = null;

function nowMs() {
  return Date.now();
}

function isFresh(ts: number, ttlMs: number) {
  return nowMs() - ts <= ttlMs + GRACE_MS;
}

async function getData(): Promise<LiveResponse> {
  const withinActiveWindow = inPollingWindow(new Date());
  const ttl = withinActiveWindow ? ACTIVE_REFRESH_MS : OFFHOURS_REFRESH_MS;

  // In-memory cache (per warm instance)
  if (cached && isFresh(cached.at, ttl)) {
    return withinActiveWindow
      ? cached.payload
      : { ...cached.payload, meta: { ...cached.payload.meta, stale: true, window: "offhours" } };
  }

  // Off-hours: prefer stored snapshot if it exists (fast + guaranteed)
  if (!withinActiveWindow) {
    const snap = await readSnapshot();
    if (snap) {
      cached = { at: nowMs(), payload: snap };
      return snap;
    }
    // No snapshot yet -> seed by polling off-hours (rate limited by OFFHOURS ttl above)
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await pollProviders(withinActiveWindow);

      cached = { at: nowMs(), payload };
      await writeSnapshot(payload);

      return withinActiveWindow
        ? payload
        : { ...payload, meta: { ...payload.meta, stale: true, window: "offhours" } };
    } catch (err: any) {
      console.error("[nba/live-games] poll error:", err?.message ?? err);

      if (cached) {
        return withinActiveWindow
          ? cached.payload
          : { ...cached.payload, meta: { ...cached.payload.meta, stale: true, window: "offhours" } };
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