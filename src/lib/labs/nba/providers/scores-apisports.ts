// src/lib/labs/nba/providers/scores-apisports.ts

import {
  canonicalTeamName,
  dateKeyLosAngelesFromIso,
  parseClockToSecondsRemaining,
} from "./normalize";

export type LiveScoreGame = {
  providerGameId: string;
  status: "scheduled" | "in_progress" | "final" | "unknown";

  awayTeam: string; // canonical
  homeTeam: string; // canonical

  awayScore: number | null;
  homeScore: number | null;

  period: number | null;
  secondsRemainingInPeriod: number | null;

  // YYYY-MM-DD in America/Los_Angeles derived from game start time (preferred)
  laDateKey: string;
};

function toNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toInt(x: any): number | null {
  const v = toNum(x);
  return v == null ? null : Math.trunc(v);
}

function pickFirstString(...vals: any[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function laDateKeyNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

/**
 * API-Sports NBA v2 "status" typically contains:
 * - status.long  (e.g. "Not Started", "In Play", "Finished")
 * - status.short (e.g. "NS", "LIVE", "FT")
 * - status.clock (e.g. "09:41") when live
 */
function normalizeStatusFromV2(statusObj: any): LiveScoreGame["status"] {
  const long = String(statusObj?.long ?? "");
  const short = String(statusObj?.short ?? "");

  const s = `${long} ${short}`.toLowerCase();
  const shortUp = short.toUpperCase();

  if (shortUp === "NS") return "scheduled";
  if (shortUp === "FT") return "final";
  if (shortUp === "LIVE") return "in_progress";

  if (s.includes("not started") || s.includes("scheduled")) return "scheduled";
  if (s.includes("finished") || s.includes("final")) return "final";
  if (s.includes("in play") || s.includes("live") || s.includes("in progress")) return "in_progress";

  return "unknown";
}

function parseClockSecondsFromV2(game: any): number | null {
  const clock =
    pickFirstString(
      game?.status?.clock,
      game?.status?.timer,
      game?.clock,
      game?.time
    ) ?? null;

  if (!clock) return null;
  return parseClockToSecondsRemaining(clock);
}

function parsePeriodFromV2(game: any): number | null {
  // Based on your debug keys: periods exists
  return toInt(game?.periods?.current) ?? toInt(game?.status?.period) ?? null;
}

function parseScoresFromV2(game: any): { away: number | null; home: number | null } {
  // Based on your debug keys: scores exists
  const home = toInt(game?.scores?.home?.total) ?? toInt(game?.scores?.home) ?? null;
  const away = toInt(game?.scores?.away?.total) ?? toInt(game?.scores?.away) ?? null;
  return { away, home };
}

function parseTeamsFromV2(game: any): { away: string | null; home: string | null } {
  const home = pickFirstString(game?.teams?.home?.name, game?.home?.name, game?.homeTeam) ?? null;
  const away = pickFirstString(game?.teams?.away?.name, game?.away?.name, game?.awayTeam) ?? null;
  return { away, home };
}

function parseStartIsoFromV2(game: any): string | null {
  return pickFirstString(game?.date, game?.datetime, game?.start) ?? null;
}

async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API-SPORTS error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json().catch(() => null);
  if (!json) throw new Error("API-SPORTS returned invalid JSON");
  return json;
}

function extractResponseArray(json: any): any[] {
  // API-Sports uses { response: [...] }
  if (Array.isArray(json?.response)) return json.response;
  if (Array.isArray(json)) return json;
  return [];
}

function ymdUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function fetchApiSportsScores(): Promise<LiveScoreGame[]> {
  const apiKey = process.env.APISPORTS_NBA_KEY;
  if (!apiKey) throw new Error("Missing APISPORTS_NBA_KEY");

  const base = (process.env.APISPORTS_NBA_BASE_URL || "https://v2.nba.api-sports.io").replace(/\/+$/, "");

  // Rolling UTC window catches PT evening games that are "tomorrow" in UTC.
  const now = new Date();
  const dates = [addDays(now, -1), now, addDays(now, 1)].map(ymdUtc);

  const urls = dates.map((d) => `${base}/games?date=${encodeURIComponent(d)}`);

  const collected: LiveScoreGame[] = [];
  const seenProviderIds = new Set<string>();

  for (const url of urls) {
    let json: any = null;

    try {
      json = await fetchJson(url, apiKey);
    } catch (e: any) {
      console.error("[apisports] fetch failed:", url, e?.message ?? e);
      continue;
    }

    const arr = extractResponseArray(json);

    for (const g of arr) {
      const providerGameId = pickFirstString(g?.id, g?.game?.id, g?.gameId, g?.GameId) ?? null;
      if (!providerGameId) continue;
      if (seenProviderIds.has(providerGameId)) continue;
      seenProviderIds.add(providerGameId);

      const teams = parseTeamsFromV2(g);
      if (!teams.home || !teams.away) continue;

      const homeTeam = canonicalTeamName(teams.home);
      const awayTeam = canonicalTeamName(teams.away);

      const startIso = parseStartIsoFromV2(g);
      const laDateKey = dateKeyLosAngelesFromIso(startIso) ?? laDateKeyNow();

      const status = normalizeStatusFromV2(g?.status);

      const scores = parseScoresFromV2(g);
      const period = parsePeriodFromV2(g);
      const secondsRemainingInPeriod = parseClockSecondsFromV2(g);

      collected.push({
        providerGameId,
        status,
        awayTeam,
        homeTeam,
        awayScore: scores.away,
        homeScore: scores.home,
        period,
        secondsRemainingInPeriod,
        laDateKey,
      });
    }
  }

  return collected;
}