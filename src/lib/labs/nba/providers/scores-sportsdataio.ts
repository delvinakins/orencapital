// src/lib/labs/nba/providers/scores-sportsdataio.ts

import { canonicalTeamName, dateKeyLosAngelesFromIso, parseClockToSecondsRemaining } from "./normalize";

export type LiveScoreGame = {
  providerGameId: string;
  status: "scheduled" | "in_progress" | "final" | "unknown";

  awayTeam: string; // canonical
  homeTeam: string; // canonical

  awayScore: number | null;
  homeScore: number | null;

  period: number | null;
  secondsRemainingInPeriod: number | null;

  /**
   * YYYY-MM-DD in America/Los_Angeles derived from game start time (preferred),
   * used for robust joins with odds.
   */
  laDateKey: string;
};

function safeInt(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function parseStatus(raw: any): LiveScoreGame["status"] {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("scheduled")) return "scheduled";
  if (s.includes("inprogress") || s.includes("in progress") || s.includes("live")) return "in_progress";
  if (s.includes("final")) return "final";
  return "unknown";
}

function parseTimeRemaining(game: any): number | null {
  // SportsDataIO commonly includes TimeRemaining like "08:21"
  const tr = game?.TimeRemaining ?? game?.timeRemaining ?? null;
  if (typeof tr === "string") {
    return parseClockToSecondsRemaining(tr);
  }

  // Some feeds provide minutes/seconds
  const mm = safeInt(game?.TimeRemainingMinutes ?? game?.timeRemainingMinutes);
  const ss = safeInt(game?.TimeRemainingSeconds ?? game?.timeRemainingSeconds);
  if (mm != null && ss != null) return mm * 60 + ss;

  return null;
}

function fallbackLaDateKey(now: Date) {
  // Last-resort: LA dateKey from "now"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y ?? "0000"}-${m ?? "00"}-${d ?? "00"}`;
}

export async function fetchSportsDataIoScores(): Promise<LiveScoreGame[]> {
  const key = process.env.SPORTSDATAIO_NBA_KEY;
  if (!key) throw new Error("Missing SPORTSDATAIO_NBA_KEY");

  const base = "https://api.sportsdata.io/v3/nba/scores/json";

  // Pull today + yesterday (UTC) to catch games around midnight boundaries.
  const todayUtc = new Date();
  const yesterdayUtc = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dates = [yesterdayUtc.toISOString().slice(0, 10), todayUtc.toISOString().slice(0, 10)];
  const all: LiveScoreGame[] = [];

  for (const dateKeyUtc of dates) {
    const url = `${base}/GamesByDate/${dateKeyUtc}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;

    const json = await res.json().catch(() => null);
    if (!Array.isArray(json)) continue;

    for (const g of json) {
      const homeRaw = String(g?.HomeTeam ?? g?.homeTeam ?? "").trim();
      const awayRaw = String(g?.AwayTeam ?? g?.awayTeam ?? "").trim();
      if (!homeRaw || !awayRaw) continue;

      const homeTeam = canonicalTeamName(homeRaw);
      const awayTeam = canonicalTeamName(awayRaw);

      const providerGameId = String(g?.GameID ?? g?.GameId ?? g?.id ?? `${dateKeyUtc}:${awayTeam}@${homeTeam}`);

      // Prefer UTC start time field if present
      const startIso =
        (typeof g?.DateTimeUTC === "string" && g.DateTimeUTC) ||
        (typeof g?.DateTime === "string" && g.DateTime) ||
        null;

      const laDateKey = dateKeyLosAngelesFromIso(startIso) ?? fallbackLaDateKey(new Date());

      const status = parseStatus(g?.Status ?? g?.status);
      const period = safeInt(g?.Quarter ?? g?.quarter ?? null);

      const awayScore =
        safeInt(g?.AwayTeamScore ?? g?.AwayScore ?? g?.awayScore ?? g?.Score?.Away) ?? null;

      const homeScore =
        safeInt(g?.HomeTeamScore ?? g?.HomeScore ?? g?.homeScore ?? g?.Score?.Home) ?? null;

      all.push({
        providerGameId,
        status,
        awayTeam,
        homeTeam,
        awayScore,
        homeScore,
        period: period ?? null,
        secondsRemainingInPeriod: parseTimeRemaining(g),
        laDateKey,
      });
    }
  }

  // Deduplicate by providerGameId (latest wins)
  const map = new Map<string, LiveScoreGame>();
  for (const g of all) map.set(g.providerGameId, g);
  return Array.from(map.values());
}