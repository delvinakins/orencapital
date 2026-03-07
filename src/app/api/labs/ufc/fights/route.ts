// src/app/api/labs/ufc/fights/route.ts
// Returns upcoming UFC/MMA fights with Elo-based hype gap analysis.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMmaOdds } from "@/lib/labs/ufc/providers/odds-theoddsapi";
import { DEFAULT_ELO, eloWinProb, hypeTax } from "@/lib/labs/ufc/elo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FighterRatingRow = {
  fighter_name: string;
  elo: number;
  fights: number;
  wins: number;
};

export type FightItem = {
  fightId: string;
  commenceTimeIso: string | null;
  eventTitle: string | null;

  fighter1: string;
  fighter2: string;

  // Market data
  fighter1AmericanOdds: number | null;
  fighter2AmericanOdds: number | null;
  fighter1MarketProb: number | null;
  fighter2MarketProb: number | null;

  // Elo data
  fighter1Elo: number;
  fighter2Elo: number;
  fighter1EloProb: number;
  fighter2EloProb: number;
  fighter1EloFights: number;
  fighter2EloFights: number;

  // Hype gap (market - elo, positive = market overprices)
  fighter1HypeTax: number | null;
  fighter2HypeTax: number | null;
};

function supabaseOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getRatingsMap(names: string[]): Promise<Map<string, FighterRatingRow>> {
  const map = new Map<string, FighterRatingRow>();
  if (names.length === 0) return map;

  const sb = supabaseOrNull();
  if (!sb) return map;

  // Lowercase match — store fighter names lowercased for lookup
  const lower = names.map((n) => n.toLowerCase());

  const { data, error } = await sb
    .from("ufc_fighter_ratings")
    .select("fighter_name, elo, fights, wins")
    .in("fighter_name", lower);

  if (error || !Array.isArray(data)) return map;

  for (const row of data as FighterRatingRow[]) {
    map.set(row.fighter_name.toLowerCase(), row);
  }

  return map;
}

// In-memory cache
const TTL_MS = 5 * 60_000;
let cache: { at: number; data: FightItem[] } | null = null;

async function getFights(): Promise<FightItem[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const fights = await fetchMmaOdds();

  const allNames = fights.flatMap((f) => [f.fighter1.toLowerCase(), f.fighter2.toLowerCase()]);
  const ratingsMap = await getRatingsMap([...new Set(allNames)]);

  const items: FightItem[] = fights.map((f) => {
    const r1 = ratingsMap.get(f.fighter1.toLowerCase());
    const r2 = ratingsMap.get(f.fighter2.toLowerCase());

    const elo1 = r1 ? Number(r1.elo) : DEFAULT_ELO;
    const elo2 = r2 ? Number(r2.elo) : DEFAULT_ELO;

    const eloProb1 = eloWinProb(elo1, elo2);
    const eloProb2 = 1 - eloProb1;

    const hype1 =
      f.fighter1MarketProb != null ? hypeTax(f.fighter1MarketProb, eloProb1) : null;
    const hype2 =
      f.fighter2MarketProb != null ? hypeTax(f.fighter2MarketProb, eloProb2) : null;

    return {
      fightId: f.fightId,
      commenceTimeIso: f.commenceTimeIso,
      eventTitle: f.eventTitle,
      fighter1: f.fighter1,
      fighter2: f.fighter2,
      fighter1AmericanOdds: f.fighter1AmericanOdds,
      fighter2AmericanOdds: f.fighter2AmericanOdds,
      fighter1MarketProb: f.fighter1MarketProb,
      fighter2MarketProb: f.fighter2MarketProb,
      fighter1Elo: elo1,
      fighter2Elo: elo2,
      fighter1EloProb: eloProb1,
      fighter2EloProb: eloProb2,
      fighter1EloFights: r1?.fights ?? 0,
      fighter2EloFights: r2?.fights ?? 0,
      fighter1HypeTax: hype1,
      fighter2HypeTax: hype2,
    };
  });

  cache = { at: Date.now(), data: items };
  return items;
}

export async function GET() {
  try {
    const items = await getFights();
    return NextResponse.json(
      { ok: true, items, updatedAt: new Date().toISOString() },
      {
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate",
          pragma: "no-cache",
          expires: "0",
        },
      }
    );
  } catch (err: any) {
    console.error("[ufc/fights] error:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
