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

  if (s.includes("not started") || s.includes("scheduled") || s === "ns") return "scheduled";
  if (s.includes("finished") || s.includes("final") || s === "ft") return "final";

  if (
    s.includes("in play") ||
    s.includes("live") ||
    s.includes("in progress") ||
    s.includes("quarter") ||
    s.includes("q1") ||
    s.includes("q2") ||
    s.includes("q3") ||
    s.includes("q4") ||
    s.includes("halftime") ||
    s.includes("overtime") ||
    s.includes("ot")
  )
    return "in_progress";

  return "unknown";
}

function parseClockSecondsFromApiSports(game: any): number | null {
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
  return parseClockToSecondsRemaining(clock);
}

function parsePeriodFromApiSports(game: any): number | null {
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

/**
 * NBA season inference for Basketball API usage.
 * NBA season typically starts in Oct; use Aug (8) as safe cutoff.
 * Returns the season YEAR (e.g., 2025 for 2025-26).
 */
function inferNbaSeasonYear(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  return m >= 8 ? y : y - 1;
}

function isMethodNotSupported(json: any) {
  const msg = String(json?.errors?.token ?? "");
  return msg.toLowerCase().includes("method not supported");
}

async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-apisports-key": apiKey },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg = String(json?.errors?.token ?? json?.message ?? "");
    throw new Error(`API-SPORTS http ${res.status}: ${errMsg || "request failed"}`);
  }
  if (!json) throw new Error("API-SPORTS returned invalid JSON");
  return json;
}

/**
 * Build date query URLs for:
 * - NBA host: /games?date=YYYY-MM-DD
 * - Basketball host: /games?date=YYYY-MM-DD&league=12&season=YYYY
 */
function buildUrlsForBase(base: string, dateYmd: string) {
  const clean = base.replace(/\/+$/, "");
  const isBasketballHost = clean.includes("basketball.api-sports.io");

  if (isBasketballHost) {
    const season = inferNbaSeasonYear();
    // league=12 is commonly NBA in API-Sports Basketball.
    return [`${clean}/games?date=${encodeURIComponent(dateYmd)}&league=12&season=${season}`];
  }

  // Default (NBA host style)
  return [`${clean}/games?date=${encodeURIComponent(dateYmd)}`];
}

export async function fetchApiSportsScores(): Promise<LiveScoreGame[]> {
  const apiKey = process.env.APISPORTS_NBA_KEY;
  if (!apiKey) throw new Error("Missing APISPORTS_NBA_KEY");

  // If you know the correct one, set APISPORTS_NBA_BASE_URL in Vercel.
  const configured = (process.env.APISPORTS_NBA_BASE_URL || "").trim().replace(/\/+$/, "");

  const baseCandidates = [
    configured || null,
    "https://v2.nba.api-sports.io",
    "https://v1.basketball.api-sports.io",
  ].filter(Boolean) as string[];

  // Date window: yesterday/today/tomorrow UTC
  const now = new Date();
  const dates = [addDays(now, -1), now, addDays(now, 1)].map(ymdUtc);

  const collected: LiveScoreGame[] = [];
  const seenProviderIds = new Set<string>();

  // Try each base until we successfully get ANY results without "method not supported".
  for (const base of baseCandidates) {
    let anySuccess = false;
    let anyResults = false;

    for (const d of dates) {
      const urls = buildUrlsForBase(base, d);

      for (const url of urls) {
        let json: any = null;

        try {
          json = await fetchJson(url, apiKey);
        } catch (e: any) {
          console.error("[apisports] fetch failed:", url, e?.message ?? e);
          continue;
        }

        if (isMethodNotSupported(json)) {
          // This base is not usable with this key.
          console.error("[apisports] method not supported for base:", base);
          anySuccess = false;
          anyResults = false;
          break;
        }

        anySuccess = true;

        const arr = extractResponseArray(json);
        if (arr.length > 0) anyResults = true;

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

      // if we broke due to "method not supported", stop trying more dates for this base
      if (!anySuccess && collected.length === 0) break;
    }

    // If this base gave us any results, stop here (don’t spam other bases).
    if (anyResults) {
      return collected;
    }

    // If it succeeded but yielded no results, try the next base.
    // (This can happen if we queried wrong league/season on the basketball host.)
    if (anySuccess && collected.length > 0) {
      return collected;
    }
  }

  return collected;
}