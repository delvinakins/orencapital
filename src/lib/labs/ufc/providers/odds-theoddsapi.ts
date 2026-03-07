// src/lib/labs/ufc/providers/odds-theoddsapi.ts
// Fetches upcoming MMA fight moneylines from The Odds API.

import { americanToImpliedProb } from "../elo";

export type MmaFight = {
  fightId: string;

  commenceTimeIso: string | null;

  /** Primary fighter (home_team in API) */
  fighter1: string;
  /** Secondary fighter (away_team in API) */
  fighter2: string;

  /** Average American odds across bookmakers */
  fighter1AmericanOdds: number | null;
  fighter2AmericanOdds: number | null;

  /** Consensus market-implied win probability (0–1, includes vig) */
  fighter1MarketProb: number | null;
  fighter2MarketProb: number | null;

  eventTitle: string | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function toNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function fetchMmaOdds(): Promise<MmaFight[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("Missing ODDS_API_KEY");

  const url =
    "https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/" +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    "&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Odds API MMA failed: ${res.status}`);

  const json = await res.json().catch(() => null);
  if (!Array.isArray(json)) throw new Error("Odds API MMA returned non-array");

  const out: MmaFight[] = [];

  for (const g of json) {
    const commenceTimeIso =
      typeof g?.commence_time === "string" ? g.commence_time : null;

    const fighter1 = String(g?.home_team ?? "").trim();
    const fighter2 = String(g?.away_team ?? "").trim();
    if (!fighter1 || !fighter2) continue;

    const f1Odds: number[] = [];
    const f2Odds: number[] = [];

    const bookmakers = Array.isArray(g?.bookmakers) ? g.bookmakers : [];
    for (const b of bookmakers) {
      const markets = Array.isArray(b?.markets) ? b.markets : [];
      const h2h = markets.find((m: any) => m?.key === "h2h");
      if (!h2h) continue;

      const outcomes = Array.isArray(h2h?.outcomes) ? h2h.outcomes : [];
      for (const o of outcomes) {
        const name = String(o?.name ?? "").trim();
        const price = toNum(o?.price);
        if (price == null) continue;
        if (name === fighter1) f1Odds.push(price);
        else if (name === fighter2) f2Odds.push(price);
      }
    }

    const fighter1AmericanOdds = avg(f1Odds) != null ? Math.round(avg(f1Odds)!) : null;
    const fighter2AmericanOdds = avg(f2Odds) != null ? Math.round(avg(f2Odds)!) : null;

    const fighter1MarketProb =
      fighter1AmericanOdds != null ? americanToImpliedProb(fighter1AmericanOdds) : null;
    const fighter2MarketProb =
      fighter2AmericanOdds != null ? americanToImpliedProb(fighter2AmericanOdds) : null;

    out.push({
      fightId: String(g?.id ?? `${fighter1}-vs-${fighter2}`),
      commenceTimeIso,
      fighter1,
      fighter2,
      fighter1AmericanOdds,
      fighter2AmericanOdds,
      fighter1MarketProb,
      fighter2MarketProb,
      eventTitle: typeof g?.sport_title === "string" ? g.sport_title : null,
    });
  }

  // Sort chronologically
  out.sort((a, b) => {
    const ta = a.commenceTimeIso ? Date.parse(a.commenceTimeIso) : Infinity;
    const tb = b.commenceTimeIso ? Date.parse(b.commenceTimeIso) : Infinity;
    return ta - tb;
  });

  return out;
}
