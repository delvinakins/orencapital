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
 * API-Sports NBA v2 schema confirmed in your debug:
 * - teams.visitors.name (away)
 * - teams.home.name (home)
 * - scores.visitors.points / scores.home.points
 * - periods.current
 * - status.long ("In Play" | "Finished" | "Not Started")
 * - status.clock ("8:36")
 * - status.short is numeric in your payload (2/3), so don't depend on it.
 */
function normalizeStatusFromV2(statusObj: any): LiveScoreGame["status"] {
  const long = String(statusObj?.long ?? "").toLowerCase();

  if (long.includes("finished") || long.includes("final")) return "final";
  if (long.includes("in play") || long.includes("live") || long.includes("in progress")) return "in_progress";
  if (long.includes("not started") || long.includes("scheduled")) return "scheduled";

  // If unknown but clock exists, treat as in_progress
  if (typeof statusObj?.clock === "string" && statusObj.clock.trim()) return "in_progress";

  return "unknown";
}

function parsePeriodFromV2(game: any): number | null {
  return toInt(game?.periods?.current) ?? toInt(game?.periods?.total) ?? null;
}

function parseClockSecondsFromV2(game: any): number | null {
  const clock = pickFirstString(game?.status?.clock, game?.status?.timer, game?.clock, game?.time);
  if (!clock) return null;
  return parseClockToSecondsRemaining(clock);
}

function parseScoresFromV2(game: any): { away: number | null; home: number | null } {
  // confirmed: scores.visitors.points and scores.home.points
  const away =
    toInt(game?.scores?.visitors?.points) ??
    toInt(game?.scores?.visitors?.total) ??
    toInt(game?.scores?.away?.points) ??
    toInt(game?.scores?.away?.total) ??
    null;

  const home =
    toInt(game?.scores?.home?.points) ??
    toInt(game?.scores?.home?.total) ??
    null;

  return { away, home };
}

function parseTeamsFromV2(game: any): { away: string | null; home: string | null } {
  // confirmed: teams.visitors and teams.home
  const home =
    pickFirstString(game?.teams?.home?.name, game?.home?.name, game?.homeTeam) ?? null;

  const away =
    pickFirstString(
      game?.teams?.visitors?.name, // v2 NBA
      game?.teams?.away?.name,
      game?.visitors?.name,
      game?.away?.name,
      game?.awayTeam
    ) ?? null;

  return { away, home };
}

function parseStartIsoFromV2(game: any): string | null {
  // confirmed: date.start
  return (
    pickFirstString(
      game?.date?.start,
      game?.date,
      game?.datetime,
      game?.start
    ) ?? null
  );
}

async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-apisports-key": apiKey },
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

  // Rolling UTC window catches PT evening games that fall on "tomorrow" UTC.
  const now = new Date();
  const dates = [addDays(now, -1), now, addDays(now, 1)].map(ymdUtc);

  const collected: LiveScoreGame[] = [];
  const seenProviderIds = new Set<string>();

  for (const d of dates) {
    const url = `${base}/games?date=${encodeURIComponent(d)}`;

    let json: any = null;
    try {
      json = await fetchJson(url, apiKey);
    } catch (e: any) {
      console.error("[apisports] fetch failed:", url, e?.message ?? e);
      continue;
    }

    const arr = extractResponseArray(json);

    for (const g of arr) {
      const providerGameId = String(g?.id ?? "").trim();
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