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

  phase: Phase;
};

type LiveOk = {
  ok: true;
  items: LiveGameItem[];
  meta: {
    stale: boolean;
    updatedAt: string;
    window: "active" | "offhours";
    storage?: "supabase" | "none";
    dateKeyPT?: string;
    allowedDateKeysPT?: string[];
    closingSeeded?: number;
    closingAttached?: number;
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

function addDaysUTC(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
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
  if (s.includes("live") || s.includes("inprogress") || s.includes("in_progress") || s.includes("playing")) return "live";
  if (s.includes("scheduled") || s.includes("not started") || s.includes("not_started") || s.includes("pregame"))
    return "pregame";

  const p = hasNumber(it.period) ? it.period : null;
  const sr = hasNumber(it.secondsRemaining) ? it.secondsRemaining : null;
  const hasScore = hasNumber(it.awayScore) && hasNumber(it.homeScore);

  // Key fix: Q4 + scores + no clock => FINAL (prevents “P4 • —” hanging forever)
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

function allowedDateKeys(now: Date) {
  const today = dateKeyPT(now);
  const yday = addDaysUTC(today, -1);

  const keys = new Set<string>([today]);
  // Early AM PT: allow yesterday for late games
  if (minutesPT(now) <= 5 * 60) keys.add(yday);

  return { today, keys: Array.from(keys) };
}

function filterItemsByAllowedDates(items: LiveGameItem[], allowed: Set<string>) {
  return items.filter((it) => {
    const k = itemDateKeyFromGameId(it.gameId);
    if (!k) return true;
    return allowed.has(k);
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
    const v = toNum(row?.closing_home_spread); // ✅ parses numeric strings
    if (k && v != null) map.set(k, roundHalf(v)!); // ✅ round to 0.5
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

/**
 * Slate-aware polling window:
 * Active if now is within (firstTip - PRE) .. (lastTip + POST).
 */
function computeSlateActive(
  odds: Array<{ laDateKey: string | null; commenceTimeIso: string | null }>,
  now: Date,
  allowed: Set<string>
) {
  const PRE_MIN = 120;
  const POST_MIN = 360;

  const times: number[] = [];
  for (const o of odds) {
    const dk = o.laDateKey ?? "";
    if (dk && !allowed.has(dk)) continue;

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

async function pollProviders(now: Date): Promise<LiveOk> {
  const { today, keys } = allowedDateKeys(now);
  const allowed = new Set(keys);

  const odds = await fetchTheOddsApiSpreads();
  const slateActive = computeSlateActive(
    odds.map((o) => ({ laDateKey: o.laDateKey, commenceTimeIso: o.commenceTimeIso })),
    now,
    allowed
  );

  // Seed closing from odds (first seen consensus)
  const closingCandidates = odds
    .filter((o) => (o.laDateKey ? allowed.has(o.laDateKey) : true))
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

  for (const o of odds) {
    const match = `${o.awayTeam}@${o.homeTeam}`;
    oddsByMatch.set(match, roundHalf(toNum(o.liveHomeSpread)) ?? null);

    const dk = o.laDateKey ?? "";
    if (dk && allowed.has(dk)) oddsByKey.set(`${dk}|${match}`, roundHalf(toNum(o.liveHomeSpread)) ?? null);
  }

  const items: LiveGameItem[] = [];

  for (const raw of scores as any[]) {
    const laKey = String(raw?.laDateKey ?? "").trim();
    if (laKey && !allowed.has(laKey)) continue;

    const awayTeam = canonicalTeamName(String(raw?.awayTeam ?? "").trim());
    const homeTeam = canonicalTeamName(String(raw?.homeTeam ?? "").trim());
    if (!awayTeam || !homeTeam) continue;

    const match = `${awayTeam}@${homeTeam}`;
    const gameKey = makeMatchKey(awayTeam, homeTeam, laKey);

    const liveSpreadHome =
      (laKey ? oddsByKey.get(`${laKey}|${match}`) : null) ?? oddsByMatch.get(match) ?? null;

    const awayScore = hasNumber(raw?.awayScore) ? raw.awayScore : null;
    const homeScore = hasNumber(raw?.homeScore) ? raw.homeScore : null;
    const period = hasNumber(raw?.period) ? raw.period : null;
    const secondsRemaining = hasNumber(raw?.secondsRemainingInPeriod) ? raw.secondsRemainingInPeriod : null;

    const hasAny = hasNumber(liveSpreadHome) || hasNumber(awayScore) || hasNumber(homeScore);
    if (!hasAny) continue;

    const phase = classifyPhase({ period, secondsRemaining, awayScore, homeScore }, raw?.status);

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
      phase,
    });
  }

  // Fallback to odds slate if scores missing
  if (items.length === 0 && odds.length > 0) {
    for (const o of odds) {
      const dk = o.laDateKey ?? "";
      if (dk && !allowed.has(dk)) continue;

      const gameKey = makeMatchKey(o.awayTeam, o.homeTeam, dk);

      items.push({
        gameId: gameKey,
        awayTeam: o.awayTeam,
        homeTeam: o.homeTeam,
        awayScore: null,
        homeScore: null,
        period: 0,
        secondsRemaining: null,
        liveSpreadHome: roundHalf(toNum(o.liveHomeSpread)),
        closingSpreadHome: null,
        phase: "pregame",
      });
    }
  }

  const filtered = filterItemsByAllowedDates(items, allowed);

  const closingMap = await getClosingMap(filtered.map((it) => it.gameId));
  const attached = filtered.map((it) => ({
    ...it,
    closingSpreadHome: closingMap.get(it.gameId) ?? null,
  }));

  return {
    ok: true,
    items: attached,
    meta: {
      stale: !slateActive,
      updatedAt: nowIso(),
      window: slateActive ? "active" : "offhours",
      storage: supabaseAdminOrNull() ? "supabase" : "none",
      dateKeyPT: today,
      allowedDateKeysPT: keys,
      closingSeeded,
      closingAttached: closingMap.size,
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