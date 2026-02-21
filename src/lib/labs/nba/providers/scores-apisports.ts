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

function normalizeStatus(raw: any): LiveScoreGame["status"] {
  const s = String(raw ?? "").toLowerCase();

  // Common variants
  if (s.includes("not started") || s.includes("scheduled") || s === "ns") return "scheduled";

  if (
    s.includes("finished") ||
    s.includes("final") ||
    s === "ft" ||
    s.includes("ended") ||
    s.includes("end")
  )
    return "final";

  // Live variants
  if (
    s.includes("in play") ||
    s.includes("live") ||
    s.includes("in progress") ||
    s.includes("q1") ||
    s.includes("q2") ||
    s.includes("q3") ||
    s.includes("q4") ||
    s.includes("quarter") ||
    s.includes("halftime") ||
    s.includes("overtime") ||
    s.includes("ot")
  )
    return "in_progress";

  return "unknown";
}

function parseClockSecondsFromApiSports(game: any): number | null {
  // API-Sports products vary. Try several likely locations.
  const clock =
    pickFirstString(
      game?.time,
      game?.timer,
      game?.clock,
      game?.status?.clock,
      game?.status?.timer,
      game?.game?.clock,
      game?.game?.timer
    ) ?? null;

  if (!clock) return null;

  // Often provided as "MM:SS"
  return parseClockToSecondsRemaining(clock);
}

function parsePeriodFromApiSports(game: any): number | null {
  // Variants: periods.current, quarter, status.period, etc.
  return (
    toInt(game?.periods?.current) ??
    toInt(game?.quarter) ??
    toInt(game?.status?.period) ??
    toInt(game?.game?.period) ??
    toInt(game?.period) ??
    null
  );
}

function parseScores(game: any): { away: number | null; home: number | null } {
  // API-Sports variants seen across products:
  // - scores.home.total / scores.away.total
  // - scores.home.points / scores.away.points
  // - points.home / points.away
  // - score.home / score.away
  const home =
    toInt(game?.scores?.home?.total) ??
    toInt(game?.scores?.home?.points) ??
    toInt(game?.scores?.home) ??
    toInt(game?.points?.home) ??
    toInt(game?.score?.home) ??
    toInt(game?.home?.score) ??
    toInt(game?.home_score) ??
    null;

  const away =
    toInt(game?.scores?.away?.total) ??
    toInt(game?.scores?.away?.points) ??
    toInt(game?.scores?.away) ??
    toInt(game?.points?.away) ??
    toInt(game?.score?.away) ??
    toInt(game?.away?.score) ??
    toInt(game?.away_score) ??
    null;

  return { away, home };
}

function parseTeams(game: any): { away: string | null; home: string | null } {
  // Likely: teams.home.name, teams.away.name
  const home =
    pickFirstString(
      game?.teams?.home?.name,
      game?.home?.name,
      game?.home_team,
      game?.homeTeam
    ) ?? null;

  const away =
    pickFirstString(
      game?.teams?.away?.name,
      game?.away?.name,
      game?.away_team,
      game?.awayTeam
    ) ?? null;

  return { away, home };
}

function parseStartIso(game: any): string | null {
  return (
    pickFirstString(
      game?.date,
      game?.datetime,
      game?.start,
      game?.scheduled,
      game?.game?.date,
      game?.game?.datetime
    ) ?? null
  );
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
  // API-Sports typically uses { response: [...] }
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

  // Strategy:
  // 1) Try live=all (best for live-only)
  // 2) Fallback to date windows in UTC.
  //
  // IMPORTANT: PT evening games often fall on "tomorrow" in UTC.
  // So we include yesterday + today + tomorrow.
  const urls: string[] = [];

  // Attempt live endpoint
  urls.push(`${base}/games?live=all`);

  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  urls.push(`${base}/games?date=${encodeURIComponent(ymdUtc(yesterday))}`);
  urls.push(`${base}/games?date=${encodeURIComponent(ymdUtc(today))}`);
  urls.push(`${base}/games?date=${encodeURIComponent(ymdUtc(tomorrow))}`);

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
      const providerGameId =
        pickFirstString(g?.id, g?.game?.id, g?.gameId, g?.GameId) ?? null;
      if (!providerGameId) continue;
      if (seenProviderIds.has(providerGameId)) continue;
      seenProviderIds.add(providerGameId);

      const teams = parseTeams(g);
      if (!teams.home || !teams.away) continue;

      const homeTeam = canonicalTeamName(teams.home);
      const awayTeam = canonicalTeamName(teams.away);

      const startIso = parseStartIso(g);
      const laDateKey = dateKeyLosAngelesFromIso(startIso) ?? laDateKeyNow();

      const status = normalizeStatus(
        g?.status?.long ?? g?.status ?? g?.game?.status ?? g?.status?.short
      );

      const scores = parseScores(g);
      const period = parsePeriodFromApiSports(g);
      const secondsRemainingInPeriod = parseClockSecondsFromApiSports(g);

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