// src/app/api/cron/ufc-rankings-sync/route.ts
//
// Vercel cron: Monday 8PM ET (01:00 UTC Tuesday — covers both EDT & EST)
// Syncs the current UFC top-15 rankings from ESPN into ufc_fighter_ratings.
//
// What it updates:  weight_class, current_rank, updated_at
// What it preserves: elo, style, dob, td_accuracy, ground_ctrl_pct, fights, wins, etc.
//
// Fighters that fall out of the top-15 have current_rank set to NULL (not deleted).
// New fighters that appear in rankings but aren't in the DB are inserted with
// default elo=1500 so the OCR engine can still work with them.
//
// Manual trigger: GET /api/cron/ufc-rankings-sync?secret=<CRON_SECRET>

import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings";

// Maps ESPN division names → our canonical weight class strings.
// ESPN sometimes appends "(Men)" / "(Women)" or other suffixes — we strip those.
const DIVISION_MAP: Record<string, string> = {
  "heavyweight":             "Heavyweight",
  "light heavyweight":       "Light Heavyweight",
  "middleweight":            "Middleweight",
  "welterweight":            "Welterweight",
  "lightweight":             "Lightweight",
  "featherweight":           "Featherweight",
  "bantamweight":            "Bantamweight",
  "flyweight":               "Flyweight",
  "women's strawweight":     "Women's Strawweight",
  "women's flyweight":       "Women's Flyweight",
  "women's bantamweight":    "Women's Bantamweight",
  "women strawweight":       "Women's Strawweight",
  "women flyweight":         "Women's Flyweight",
  "women bantamweight":      "Women's Bantamweight",
};

function mapDivision(raw: string): string | null {
  // Strip parenthetical qualifiers like "(Men)", "(Women)", "(P4P)" etc.
  const key = raw
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Skip pound-for-pound lists — not a true weight class
  if (key.includes("pound") || key.includes("p4p")) return null;
  return DIVISION_MAP[key] ?? null;
}

type ParsedFighter = {
  name: string;       // lowercased — matches fighter_name PK in DB
  rank: number;       // 0 = champion, 1-15 = contender
  weightClass: string;
};

function parseEspnRankings(json: any): ParsedFighter[] {
  const divisions: any[] = Array.isArray(json?.rankings) ? json.rankings : [];
  const out: ParsedFighter[] = [];

  for (const div of divisions) {
    const weightClass = mapDivision(String(div?.name ?? ""));
    if (!weightClass) continue;

    const ranks: any[] = Array.isArray(div?.ranks) ? div.ranks : [];

    for (const r of ranks) {
      const displayName = String(
        r?.athlete?.displayName ?? r?.displayName ?? ""
      ).trim();
      if (!displayName) continue;

      // ESPN uses current=0 for champions in some responses, 1-based for contenders.
      // If current is missing, fall back to the array index (0-based → champion at 0).
      const espnRank =
        typeof r?.current === "number" ? r.current : ranks.indexOf(r);

      out.push({
        name: displayName.toLowerCase(),
        rank: espnRank,        // 0 = champion, 1-15 = contender
        weightClass,
      });
    }
  }

  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const fromHeader = req.headers.get("authorization") === `Bearer ${secret}`;
  const fromQuery  = url.searchParams.get("secret") === secret;

  if (!secret || (!fromHeader && !fromQuery)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Fetch ESPN rankings ────────────────────────────────────────────────
    const espnRes = await fetch(ESPN_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!espnRes.ok) throw new Error(`ESPN API returned ${espnRes.status}`);

    const espnJson = await espnRes.json().catch(() => null);
    if (!espnJson) throw new Error("ESPN returned non-JSON response");

    const fighters = parseEspnRankings(espnJson);
    if (fighters.length === 0) {
      throw new Error("Parsed 0 fighters from ESPN — response format may have changed");
    }

    // Group by division
    const byDivision = new Map<string, ParsedFighter[]>();
    for (const f of fighters) {
      const list = byDivision.get(f.weightClass) ?? [];
      list.push(f);
      byDivision.set(f.weightClass, list);
    }

    const sb = supabaseService();
    const now = new Date().toISOString();
    let upserted = 0;
    let cleared = 0;

    // ── 2. Per-division: clear stale ranks, then upsert new ones ─────────────
    for (const [weightClass, divFighters] of Array.from(byDivision.entries())) {
      const rankedNames = new Set(divFighters.map((f) => f.name));

      // Find fighters in this division who had a rank but aren't in the new list
      const { data: prevRanked } = await sb
        .from("ufc_fighter_ratings")
        .select("fighter_name")
        .eq("weight_class", weightClass)
        .not("current_rank", "is", null);

      const toUnrank = (prevRanked ?? [])
        .map((r: any) => String(r.fighter_name))
        .filter((name: string) => !rankedNames.has(name));

      if (toUnrank.length > 0) {
        await sb
          .from("ufc_fighter_ratings")
          .update({ current_rank: null, updated_at: now })
          .in("fighter_name", toUnrank);
        cleared += toUnrank.length;
      }

      // Upsert ranked fighters.
      // onConflict="fighter_name" means existing fighters get weight_class + current_rank
      // updated while elo, style, dob, etc. are left untouched.
      // New fighters (not yet in DB) are inserted with elo=1500 defaults.
      const rows = divFighters.map((f) => ({
        fighter_name: f.name,
        weight_class: f.weightClass,
        current_rank: f.rank,
        elo:          1500,   // only applied on INSERT — existing rows keep their elo
        updated_at:   now,
      }));

      const { error } = await sb
        .from("ufc_fighter_ratings")
        .upsert(rows, {
          onConflict: "fighter_name",
          ignoreDuplicates: false,
        });

      if (error) {
        throw new Error(`Upsert failed for ${weightClass}: ${error.message}`);
      }

      upserted += rows.length;
    }

    console.log(
      `[ufc-rankings-sync] divisions=${byDivision.size} upserted=${upserted} cleared=${cleared}`
    );

    return NextResponse.json({
      ok: true,
      divisions: byDivision.size,
      upserted,
      cleared,
      fighters: fighters.length,
    });
  } catch (e: any) {
    console.error("[ufc-rankings-sync]", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
