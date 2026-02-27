// src/app/api/labs/nba/live-games/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchApiSportsScores } from "@/lib/labs/nba/providers/scores-apisports";
import { fetchTheOddsApiSpreads } from "@/lib/labs/nba/providers/odds-theoddsapi";
import { makeMatchKey, canonicalTeamName } from "@/lib/labs/nba/providers/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  liveMoneylineHome: number | null;
  liveMoneylineAway: number | null;

  phase: Phase;
};

type LiveOk = {
  ok: true;
  items: LiveGameItem[];
  meta: {
    stale: boolean;
    updatedAt: string;

    // display controls
    mode: "yesterday_finals" | "today_slate";
    dateKeyPT: string; // what we are showing (yday until noon PT, then today/next slate)
    allowedDateKeysPT: string[]; // for debugging
    firstTipIso?: string | null;
    unlockAtIso?: string | null;

    window: "active" | "offhours";
    storage?: "supabase" | "none";

    closingSeeded?: number;
    closingAttached?: number;
    moneylineAttached?: number;
  };
};

type LiveResponse = LiveOk | { ok: false };

const PT_TZ = "America/Los_Angeles";

function nowIso() {
  return new Date().toISOString();
}
function nowMs() {
  return Date.now();
}

function minutesPT(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function dateKeyPT(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function addDaysUTC(dateKeyStr: string, deltaDays: number): string {
  const [y, m, d] = dateKeyStr.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function hasNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function toNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function roundHalf(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 2) / 2;
}

function normalizeStatus(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function classifyPhase(
  it: { period: number | null; secondsRemaining: number | null; awayScore: number | null; homeScore: number | null },
  statusRaw?: unknown
): Phase {
  const s = normalizeStatus(statusRaw);

  if (s.includes("final") || s.includes("finished") || s.includes("ended")) return "final";
  if (s.includes("live") || s.includes("inprogress") || s.includes("in_progress") || s.includes("playing"))
    return "live";
  if (s.includes("scheduled") || s.includes("not started") || s.includes("not_started") || s.includes("pregame"))
    return "pregame";

  const p = hasNumber(it.period) ? it.period : null;
  const sr = hasNumber(it.secondsRemaining) ? it.secondsRemaining : null;
  const hasScore = hasNumber(it.awayScore) && hasNumber(it.homeScore);

  // Q4 + scores + no clock => FINAL
  if (p != null && p >= 4 && hasScore && (sr === 0 || sr === null)) return "final";

  if (p != null && p >= 1 && hasScore) return "live";
  if (p != null && p >= 1 && !hasScore) return "unknown";
  return "pregame";
}

function itemDateKeyFromGameId(gameId: string): string | null {
  const k = String(gameId || "").split("|")[0]?.trim();
  if (!k || k.length !== 10) return null;
  return k;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY RULES (your requirement)
// - Show yesterday finals until 12:00 PM PT (3:00 PM ET).
// - At/after 12:00 PM PT, show the upcoming slate for “today”.
// - If today has no slate, fall forward to the next available slate date (workaround).
// - Oren Edge + Close unlock at (firstTip - 2 hours).
// ─────────────────────────────────────────────────────────────────────────────

function chooseDisplayKey(now: Date) {
  const today = dateKeyPT(now);
  const yday = addDaysUTC(today, -1);
  const noonPT = 12 * 60;

  const mins = minutesPT(now);
  const mode: "yesterday_finals" | "today_slate" = mins < noonPT ? "yesterday_finals" : "today_slate";
  const primary = mode === "yesterday_finals" ? yday : today;

  return { today, yday, mode, primary };
}

function filterItemsByDateKey(items: LiveGameItem[], key: string) {
  return items.filter((it) => {
    const k = itemDateKeyFromGameId(it.gameId);
    if (!k) return true;
    return k === key;
  });
}

function supabaseAdminOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getClosingMap(keys: string[]) {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;

  const sb = supabaseAdminOrNull();
  if (!sb) return map;

  const { data, error } = await sb
    .from("nba_closing_lines")
    .select("game_key, closing_home_spread")
    .in("game_key", keys);

  if (error || !Array.isArray(data)) return map;

  for (const row of data as any[]) {
    const k = typeof row?.game_key === "string" ? row.game_key : null;
    const v = toNum(row?.closing_home_spread);
    if (k && v != null) map.set(k, roundHalf(v)!);
  }

  return map;
}

async function getMoneylineMap(
  odds: any[],
  wantDateKey: string
): Promise<Map<string, { home: number | null; away: number | null }>> {
  const map = new Map<string, { home: number | null; away: number | null }>();

  for (const o of odds || []) {
    const dk = String(o?.laDateKey ?? "").trim();
    if (dk && dk !== wantDateKey) continue;

    const awayTeam = canonicalTeamName(String(o?.awayTeam ?? "").trim());
    const homeTeam = canonicalTeamName(String(o?.homeTeam ?? "").trim());
    if (!awayTeam || !homeTeam) continue;

    const gameKey = makeMatchKey(awayTeam, homeTeam, dk);

    const home =
      toNum((o as any)?.liveMoneylineHome) ??
      toNum((o as any)?.moneylineHome) ??
      toNum((o as any)?.homeMoneyline) ??
      toNum((o as any)?.mlHome) ??
      toNum((o as any)?.moneyline?.home) ??
      toNum((o as any)?.moneyline?.homePrice) ??
      toNum((o as any)?.markets?.h2h?.home) ??
      toNum((o as any)?.h2h?.home) ??
      null;

    const away =
      toNum((o as any)?.liveMoneylineAway) ??
      toNum((o as any)?.moneylineAway) ??
      toNum((o as any)?.awayMoneyline) ??
      toNum((o as any)?.mlAway) ??
      toNum((o as any)?.moneyline?.away) ??
      toNum((o as any)?.moneyline?.awayPrice) ??
      toNum((o as any)?.markets?.h2h?.away) ??
      toNum((o as any)?.h2h?.away) ??
      null;

    if (home == null && away == null) continue;

    map.set(gameKey, { home: home != null ? Math.trunc(home) : null, away: away != null ? Math.trunc(away) : null });
  }

  return map;
}

async function seedClosingFromOdds(candidates: Array<{ gameKey: string; closingHomeSpread: number }>) {
  const sb = supabaseAdminOrNull();
  if (!sb) return 0;
  if (candidates.length === 0) return 0;

  const seen = new Set<string>();
  const unique: Array<{ gameKey: string; closingHomeSpread: number }> = [];
  for (const c of candidates) {
    if (!c.gameKey || !Number.isFinite(c.closingHomeSpread)) continue;
    if (seen.has(c.gameKey)) continue;
    seen.add(c.gameKey);
    unique.push({ ...c, closingHomeSpread: roundHalf(c.closingHomeSpread)! });
  }
  if (unique.length === 0) return 0;

  const existing = await getClosingMap(unique.map((u) => u.gameKey));
  const toInsert = unique
    .filter((u) => !existing.has(u.gameKey))
    .map((u) => ({ game_key: u.gameKey, closing_home_spread: u.closingHomeSpread }));

  if (toInsert.length === 0) return 0;

  const { error } = await sb.from("nba_closing_lines").insert(toInsert);
  if (error) {
    const msg = error.message.toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("conflict")) {
      console.error("[nba/live-games] seedClosingFromOdds insert error:", error.message);
    }
    return 0;
  }
  return toInsert.length;
}

function computeFirstTipIsoForDate(
  odds: Array<{ laDateKey: string | null; commenceTimeIso: string | null }>,
  wantDateKey: string
): string | null {
  const ts: number[] = [];
  for (const o of odds || []) {
    const dk = o.laDateKey ?? "";
    if (dk !== wantDateKey) continue;
    const iso = o.commenceTimeIso;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t)) ts.push(t);
  }
  if (ts.length === 0) return null;
  return new Date(Math.min(...ts)).toISOString();
}

function addHoursIso(iso: string, hours: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + hours * 60 * 60 * 1000).toISOString();
}

function computeSlateActive(
  odds: Array<{ laDateKey: string | null; commenceTimeIso: string | null }>,
  now: Date,
  wantDateKey: string
) {
  // more forgiving window: start 2h before first tip, end 6h after last tip
  const PRE_MIN = 120;
  const POST_MIN = 360;

  const times: number[] = [];
  for (const o of odds || []) {
    const dk = o.laDateKey ?? "";
    if (dk !== wantDateKey) continue;

    const iso = o.commenceTimeIso;
    if (!iso) continue;

    const t = Date.parse(iso);
    if (Number.isFinite(t)) times.push(t);
  }

  if (times.length === 0) return false;

  const first = Math.min(...times);
  const last = Math.max(...times);

  const start = first - PRE_MIN * 60_000;
  const end = last + POST_MIN * 60_000;

  const nowT = now.getTime();
  return nowT >= start && nowT <= end;
}

function nextSlateDateKeyFromOdds(odds: any[], todayKey: string): string | null {
  const keys = new Set<string>();
  for (const o of odds || []) {
    const dk = String(o?.laDateKey ?? "").trim();
    if (dk && dk.length === 10) keys.add(dk);
  }
  const arr = Array.from(keys).sort((a, b) => a.localeCompare(b));
  const next = arr.find((k) => k >= todayKey) ?? null;
  return next;
}

async function pollProviders(now: Date): Promise<LiveOk> {
  const { today, yday, mode, primary } = chooseDisplayKey(now);

  const odds = await fetchTheOddsApiSpreads();

  // Workaround for “tricky days”:
  // after noon PT, if there is no slate for today, show the next slate date key available.
  let wantDateKey = primary;
  if (mode === "today_slate") {
    const next = nextSlateDateKeyFromOdds(odds as any[], today);
    if (next) wantDateKey = next;
  }

  const slateActive = computeSlateActive(
    odds.map((o: any) => ({ laDateKey: o.laDateKey, commenceTimeIso: o.commenceTimeIso })),
    now,
    wantDateKey
  );

  const firstTipIso = computeFirstTipIsoForDate(
    odds.map((o: any) => ({ laDateKey: o.laDateKey, commenceTimeIso: o.commenceTimeIso })),
    wantDateKey
  );
  const unlockAtIso = firstTipIso ? addHoursIso(firstTipIso, -2) : null;

  const moneylineMap = await getMoneylineMap(odds as any[], wantDateKey);

  // Seed closing from odds (first seen consensus) — only for the date we’re showing
  const closingCandidates = (odds as any[])
    .filter((o) => String(o?.laDateKey ?? "").trim() === wantDateKey)
    .map((o) => ({
      gameKey: makeMatchKey(o.awayTeam, o.homeTeam, o.laDateKey || ""),
      closingHomeSpread: toNum(o.liveHomeSpread) ?? NaN,
    }))
    .filter((x) => Number.isFinite(x.closingHomeSpread));

  const closingSeeded = await seedClosingFromOdds(
    closingCandidates.map((c) => ({ gameKey: c.gameKey, closingHomeSpread: c.closingHomeSpread }))
  );

  const scores = await fetchApiSportsScores();

  // odds maps for live spread attach
  const oddsByKey = new Map<string, number | null>();
  const oddsByMatch = new Map<string, number | null>();

  for (const o of odds as any[]) {
    const dk = String(o?.laDateKey ?? "").trim();
    const match = `${o.awayTeam}@${o.homeTeam}`;

    if (dk === wantDateKey) {
      oddsByKey.set(`${dk}|${match}`, roundHalf(toNum(o.liveHomeSpread)) ?? null);
    }
    oddsByMatch.set(match, roundHalf(toNum(o.liveHomeSpread)) ?? null);
  }

  const items: LiveGameItem[] = [];

  for (const raw of scores as any[]) {
    const laKey = String(raw?.laDateKey ?? "").trim();
    if (laKey && laKey !== wantDateKey) continue;

    const awayTeam = canonicalTeamName(String(raw?.awayTeam ?? "").trim());
    const homeTeam = canonicalTeamName(String(raw?.homeTeam ?? "").trim());
    if (!awayTeam || !homeTeam) continue;

    const match = `${awayTeam}@${homeTeam}`;
    const gameKey = makeMatchKey(awayTeam, homeTeam, laKey);

    const liveSpreadHome = (laKey ? oddsByKey.get(`${laKey}|${match}`) : null) ?? oddsByMatch.get(match) ?? null;

    const awayScore = hasNumber(raw?.awayScore) ? raw.awayScore : null;
    const homeScore = hasNumber(raw?.homeScore) ? raw.homeScore : null;
    const period = hasNumber(raw?.period) ? raw.period : null;
    const secondsRemaining = hasNumber(raw?.secondsRemainingInPeriod) ? raw.secondsRemainingInPeriod : null;

    const hasAny = hasNumber(liveSpreadHome) || hasNumber(awayScore) || hasNumber(homeScore);
    if (!hasAny) continue;

    const phase = classifyPhase({ period, secondsRemaining, awayScore, homeScore }, raw?.status);
    const ml = moneylineMap.get(gameKey) ?? null;

    items.push({
      gameId: gameKey,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      period,
      secondsRemaining,
      liveSpreadHome: liveSpreadHome,
      closingSpreadHome: null,
      liveMoneylineHome: ml?.home ?? null,
      liveMoneylineAway: ml?.away ?? null,
      phase,
    });
  }

  // Fallback to odds slate if scores missing (pregame tiles)
  if (items.length === 0 && (odds as any[]).length > 0) {
    for (const o of odds as any[]) {
      const dk = String(o?.laDateKey ?? "").trim();
      if (dk !== wantDateKey) continue;

      const awayTeam = canonicalTeamName(String(o?.awayTeam ?? "").trim());
      const homeTeam = canonicalTeamName(String(o?.homeTeam ?? "").trim());
      if (!awayTeam || !homeTeam) continue;

      const gameKey = makeMatchKey(awayTeam, homeTeam, dk);
      const ml = moneylineMap.get(gameKey) ?? null;

      items.push({
        gameId: gameKey,
        awayTeam,
        homeTeam,
        awayScore: null,
        homeScore: null,
        period: 0,
        secondsRemaining: null,
        liveSpreadHome: roundHalf(toNum(o.liveHomeSpread)),
        closingSpreadHome: null,
        liveMoneylineHome: ml?.home ?? null,
        liveMoneylineAway: ml?.away ?? null,
        phase: "pregame",
      });
    }
  }

  const filtered = filterItemsByDateKey(items, wantDateKey);

  const closingMap = await getClosingMap(filtered.map((it) => it.gameId));
  const attached = filtered.map((it) => ({
    ...it,
    closingSpreadHome: closingMap.get(it.gameId) ?? null,
  }));

  let moneylineAttached = 0;
  for (const it of attached) {
    if (it.liveMoneylineHome != null || it.liveMoneylineAway != null) moneylineAttached++;
  }

  return {
    ok: true,
    items: attached,
    meta: {
      stale: !slateActive,
      updatedAt: nowIso(),
      mode,
      dateKeyPT: wantDateKey,
      allowedDateKeysPT: mode === "yesterday_finals" ? [yday] : [wantDateKey],
      firstTipIso: firstTipIso ?? null,
      unlockAtIso: unlockAtIso ?? null,
      window: slateActive ? "active" : "offhours",
      storage: supabaseAdminOrNull() ? "supabase" : "none",
      closingSeeded,
      closingAttached: closingMap.size,
      moneylineAttached,
    },
  };
}

// warm cache
const TTL_MS = 60_000;
let cached: { at: number; payload: LiveOk } | null = null;
let inflight: Promise<LiveOk> | null = null;

function isFresh(ts: number) {
  return nowMs() - ts <= TTL_MS;
}

async function getData(): Promise<LiveResponse> {
  if (cached && isFresh(cached.at)) return cached.payload;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await pollProviders(new Date());
      cached = { at: nowMs(), payload };
      return payload;
    } catch (err: any) {
      console.error("[nba/live-games] error:", err?.message ?? err);
      return cached?.payload ?? ({ ok: false } as any);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function GET() {
  const payload = await getData();

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}