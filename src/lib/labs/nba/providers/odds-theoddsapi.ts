// src/lib/labs/nba/providers/odds-theoddsapi.ts

import { canonicalTeamName, dateKeyLosAngelesFromIso } from "./normalize";

export type OddsGame = {
  providerGameId: string;
  commenceTimeIso: string | null;
  laDateKey: string | null;

  awayTeam: string; // canonical
  homeTeam: string; // canonical

  // Consensus live spread for HOME (negative = home favored)
  liveHomeSpread: number | null;
};

function toNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function avg(nums: number[]) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function fetchTheOddsApiSpreads(): Promise<OddsGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("Missing ODDS_API_KEY");

  const url =
    "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/" +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    "&regions=us&markets=spreads&oddsFormat=american&dateFormat=iso";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Odds API failed: ${res.status}`);

  const json = await res.json().catch(() => null);
  if (!Array.isArray(json)) throw new Error("Odds API returned non-array");

  const out: OddsGame[] = [];

  for (const g of json) {
    const commenceTimeIso = typeof g?.commence_time === "string" ? g.commence_time : null;
    const laDateKey = dateKeyLosAngelesFromIso(commenceTimeIso);

    const homeRaw = String(g?.home_team ?? "").trim();
    const awayRaw = String(g?.away_team ?? "").trim();
    if (!homeRaw || !awayRaw) continue;

    const homeTeam = canonicalTeamName(homeRaw);
    const awayTeam = canonicalTeamName(awayRaw);

    const spreadsForHome: number[] = [];

    const bookmakers = Array.isArray(g?.bookmakers) ? g.bookmakers : [];
    for (const b of bookmakers) {
      const markets = Array.isArray(b?.markets) ? b.markets : [];
      const spreads = markets.find((m: any) => m?.key === "spreads");
      if (!spreads) continue;

      const outcomes = Array.isArray(spreads?.outcomes) ? spreads.outcomes : [];
      for (const o of outcomes) {
        const name = canonicalTeamName(String(o?.name ?? "").trim());
        const point = toNum(o?.point);
        if (point == null) continue;

        if (name === homeTeam) spreadsForHome.push(point);
      }
    }

    out.push({
      providerGameId: String(g?.id ?? `${awayTeam}@${homeTeam}`),
      commenceTimeIso,
      laDateKey,
      awayTeam,
      homeTeam,
      liveHomeSpread: avg(spreadsForHome),
    });
  }

  return out;
}