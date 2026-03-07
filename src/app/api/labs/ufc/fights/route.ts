// src/app/api/labs/ufc/fights/route.ts
// Returns upcoming UFC/MMA fights with Oren Combat Rating (OCR) hype gap analysis.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMmaOdds } from "@/lib/labs/ufc/providers/odds-theoddsapi";
import {
  DEFAULT_ELO,
  FighterStyle,
  ocrWinProb,
  hypeTax,
} from "@/lib/labs/ufc/elo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FighterRow = {
  fighter_name: string;
  elo: number;
  fights: number;
  wins: number;
  ko_wins: number;
  sub_wins: number;
  td_accuracy: number | null;
  td_defense: number | null;
  ground_ctrl_pct: number | null;
  style: string;
  dob: string | null;
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

  // OCR data
  fighter1Elo: number;
  fighter2Elo: number;
  fighter1OcrProb: number;
  fighter2OcrProb: number;
  fighter1EloFights: number;
  fighter2EloFights: number;
  fighter1Style: FighterStyle;
  fighter2Style: FighterStyle;
  fighter1Age: number | null;
  fighter2Age: number | null;

  // Hype gap (market - OCR, positive = market overprices)
  fighter1HypeTax: number | null;
  fighter2HypeTax: number | null;
};

function supabaseOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Normalize a fighter name for lookup: lowercase, strip trailing period.
// Handles "Raul Rosas Jr" (odds API) matching "raul rosas jr." (DB).
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\.+$/, "");
}

async function getRatingsMap(names: string[]): Promise<Map<string, FighterRow>> {
  const map = new Map<string, FighterRow>();
  if (names.length === 0) return map;

  const sb = supabaseOrNull();
  if (!sb) return map;

  // Include trailing-period variants so "Raul Rosas Jr" also queries "raul rosas jr."
  const querySet = new Set<string>();
  for (const name of names) {
    const n = name.toLowerCase().trim();
    querySet.add(n);
    querySet.add(n.endsWith(".") ? n.slice(0, -1) : n + ".");
  }

  const { data, error } = await sb
    .from("ufc_fighter_ratings")
    .select("fighter_name, elo, fights, wins, ko_wins, sub_wins, td_accuracy, td_defense, ground_ctrl_pct, style, dob")
    .in("fighter_name", Array.from(querySet));

  if (error || !Array.isArray(data)) return map;

  for (const row of data as FighterRow[]) {
    // Index by both exact DB name and normalized name so either lookup hits
    map.set(row.fighter_name.toLowerCase(), row);
    map.set(normalizeName(row.fighter_name), row);
  }

  return map;
}

/** Fighter age at a given ISO datetime. Returns null if dob unavailable. */
function ageAtDate(dob: string | null, atIso: string | null): number | null {
  if (!dob || !atIso) return null;
  const birth = new Date(dob);
  const at    = new Date(atIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return null;

  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age--;
  return age;
}

// In-memory cache: 5 min
const TTL_MS = 5 * 60_000;
let cache: { at: number; data: FightItem[] } | null = null;

async function getFights(): Promise<FightItem[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const fights = await fetchMmaOdds();

  const allNames = fights.flatMap((f) => [f.fighter1.toLowerCase(), f.fighter2.toLowerCase()]);
  const ratingsMap = await getRatingsMap([...new Set(allNames)]);

  const defaultRow = (name: string): FighterRow => ({
    fighter_name: name.toLowerCase(),
    elo: DEFAULT_ELO,
    fights: 0,
    wins: 0,
    ko_wins: 0,
    sub_wins: 0,
    td_accuracy: null,
    td_defense: null,
    ground_ctrl_pct: null,
    style: "balanced",
    dob: null,
  });

  const items: FightItem[] = fights.map((f) => {
    const r1 = ratingsMap.get(f.fighter1.toLowerCase()) ?? ratingsMap.get(normalizeName(f.fighter1)) ?? defaultRow(f.fighter1);
    const r2 = ratingsMap.get(f.fighter2.toLowerCase()) ?? ratingsMap.get(normalizeName(f.fighter2)) ?? defaultRow(f.fighter2);

    const elo1 = Number(r1.elo);
    const elo2 = Number(r2.elo);

    const style1 = (r1.style ?? "balanced") as FighterStyle;
    const style2 = (r2.style ?? "balanced") as FighterStyle;

    const age1 = ageAtDate(r1.dob, f.commenceTimeIso);
    const age2 = ageAtDate(r2.dob, f.commenceTimeIso);

    const ocrProb1 = ocrWinProb({ eloA: elo1, eloB: elo2, ageA: age1, ageB: age2, styleA: style1, styleB: style2 });
    const ocrProb2 = 1 - ocrProb1;

    const hype1 = f.fighter1MarketProb != null ? hypeTax(f.fighter1MarketProb, ocrProb1) : null;
    const hype2 = f.fighter2MarketProb != null ? hypeTax(f.fighter2MarketProb, ocrProb2) : null;

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
      fighter1OcrProb: ocrProb1,
      fighter2OcrProb: ocrProb2,
      fighter1EloFights: r1.fights ?? 0,
      fighter2EloFights: r2.fights ?? 0,
      fighter1Style: style1,
      fighter2Style: style2,
      fighter1Age: age1,
      fighter2Age: age2,
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
