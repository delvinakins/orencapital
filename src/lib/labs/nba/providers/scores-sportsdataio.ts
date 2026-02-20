// src/lib/labs/nba/providers/scores-sportsdataio.ts

import { parseClockToSecondsRemaining } from "./normalize";

export type LiveScoreGame = {
  providerGameId: string;
  status: "scheduled" | "in_progress" | "final" | "unknown";

  awayTeam: string;
  homeTeam: string;

  awayScore: number | null;
  homeScore: number | null;

  period: number | null;
  secondsRemainingInPeriod: number | null;

  dateKey: string;
};

function safeInt(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function dateKeyUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseStatus(raw: any): LiveScoreGame["status"] {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("scheduled")) return "scheduled";
  if (s.includes("inprogress") || s.includes("live")) return "in_progress";
  if (s.includes("final")) return "final";
  return "unknown";
}

function parseTimeRemaining(game: any): number | null {
  const tr = game?.TimeRemaining ?? game?.timeRemaining ?? null;

  if (typeof tr === "string") {
    return parseClockToSecondsRemaining(tr);
  }

  const mm = safeInt(game?.TimeRemainingMinutes);
  const ss = safeInt(game?.TimeRemainingSeconds);
  if (mm != null && ss != null) return mm * 60 + ss;

  return null;
}

export async function fetchSportsDataIoScores(): Promise<
  LiveScoreGame[]
> {
  const key = process.env.SPORTSDATAIO_NBA_KEY;
  if (!key) throw new Error("Missing SPORTSDATAIO_NBA_KEY");

  const base = "https://api.sportsdata.io/v3/nba/scores/json";

  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const dates = [dateKeyUtc(yesterday), dateKeyUtc(today)];

  const all: LiveScoreGame[] = [];

  for (const dateKey of dates) {
    const url = `${base}/GamesByDate/${dateKey}?key=${encodeURIComponent(
      key
    )}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;

    const json = await res.json().catch(() => null);
    if (!Array.isArray(json)) continue;

    for (const g of json) {
      const homeTeam = String(g?.HomeTeam ?? "").trim();
      const awayTeam = String(g?.AwayTeam ?? "").trim();
      if (!homeTeam || !awayTeam) continue;

      all.push({
        providerGameId: String(g?.GameID ?? `${dateKey}:${awayTeam}@${homeTeam}`),
        status: parseStatus(g?.Status),
        awayTeam,
        homeTeam,
        awayScore: safeInt(g?.AwayTeamScore),
        homeScore: safeInt(g?.HomeTeamScore),
        period: safeInt(g?.Quarter),
        secondsRemainingInPeriod: parseTimeRemaining(g),
        dateKey,
      });
    }
  }

  const map = new Map<string, LiveScoreGame>();
  for (const g of all) map.set(g.providerGameId, g);

  return Array.from(map.values());
}