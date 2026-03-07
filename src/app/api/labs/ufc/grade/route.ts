// src/app/api/labs/ufc/grade/route.ts
// POST endpoint to record a UFC fight result and update OCR ratings.
//
// Auth: requires Authorization: Bearer <GRADE_SECRET> header.
// Set GRADE_SECRET in Vercel env vars.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_ELO,
  FinishMethod,
  FighterStyle,
  K_BY_METHOD,
  updateElo,
  classifyStyle,
} from "@/lib/labs/ufc/elo";

export const dynamic = "force-dynamic";

type GradeRequest = {
  fighter1: string;
  fighter2: string;
  /** "fighter1" or "fighter2" */
  winner: "fighter1" | "fighter2";
  method: FinishMethod;
  /** Fighter age at time of fight (for record-keeping) */
  fighter1Age?: number | null;
  fighter2Age?: number | null;
  /** Optional grappling stats to seed simultaneously */
  fighter1Stats?: GrapplingStats | null;
  fighter2Stats?: GrapplingStats | null;
};

type GrapplingStats = {
  td_accuracy?: number | null;     // 0–1
  td_defense?: number | null;      // 0–1
  ground_ctrl_pct?: number | null; // 0–1
  dob?: string | null;             // ISO date
};

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
  updated_at?: string;
};

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.GRADE_SECRET;
  if (!secret) return false; // must be set in env
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

async function getOrCreateFighter(
  sb: ReturnType<typeof supabaseAdmin>,
  name: string
): Promise<FighterRow> {
  const key = name.toLowerCase();
  const { data } = await sb
    .from("ufc_fighter_ratings")
    .select("fighter_name, elo, fights, wins, ko_wins, sub_wins, td_accuracy, td_defense, ground_ctrl_pct, style, dob")
    .eq("fighter_name", key)
    .single();

  if (data) return data as FighterRow;

  // Create new fighter at baseline
  const fresh: FighterRow = {
    fighter_name: key,
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
  };

  await sb.from("ufc_fighter_ratings").upsert({ ...fresh }, { onConflict: "fighter_name" });
  return fresh;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: GradeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { fighter1, fighter2, winner, method, fighter1Stats, fighter2Stats } = body;

  if (!fighter1 || !fighter2) {
    return NextResponse.json({ ok: false, error: "fighter1 and fighter2 required" }, { status: 400 });
  }
  if (winner !== "fighter1" && winner !== "fighter2") {
    return NextResponse.json({ ok: false, error: "winner must be 'fighter1' or 'fighter2'" }, { status: 400 });
  }
  if (!(method in K_BY_METHOD)) {
    return NextResponse.json({ ok: false, error: `Invalid method: ${method}` }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();

    const [f1Row, f2Row] = await Promise.all([
      getOrCreateFighter(sb, fighter1),
      getOrCreateFighter(sb, fighter2),
    ]);

    const winnerRow = winner === "fighter1" ? f1Row : f2Row;
    const loserRow  = winner === "fighter1" ? f2Row : f1Row;
    const winnerStats = winner === "fighter1" ? fighter1Stats : fighter2Stats;
    const loserStats  = winner === "fighter1" ? fighter2Stats : fighter1Stats;

    const { winnerNew, loserNew } = updateElo(Number(winnerRow.elo), Number(loserRow.elo), method);

    const isKo  = method === "ko" || method === "tko";
    const isSub = method === "submission";

    // Build updated winner record
    const winnerUpdated: Partial<FighterRow> = {
      elo: winnerNew,
      fights: (winnerRow.fights ?? 0) + 1,
      wins: (winnerRow.wins ?? 0) + 1,
      ko_wins: (winnerRow.ko_wins ?? 0) + (isKo ? 1 : 0),
      sub_wins: (winnerRow.sub_wins ?? 0) + (isSub ? 1 : 0),
      td_accuracy:    winnerStats?.td_accuracy    ?? winnerRow.td_accuracy,
      td_defense:     winnerStats?.td_defense     ?? winnerRow.td_defense,
      ground_ctrl_pct: winnerStats?.ground_ctrl_pct ?? winnerRow.ground_ctrl_pct,
      dob: winnerStats?.dob ?? winnerRow.dob,
      updated_at: new Date().toISOString(),
    };
    winnerUpdated.style = classifyStyle({
      fights: winnerUpdated.fights!,
      ko_wins: winnerUpdated.ko_wins!,
      sub_wins: winnerUpdated.sub_wins!,
      td_accuracy: winnerUpdated.td_accuracy ?? null,
      ground_ctrl_pct: winnerUpdated.ground_ctrl_pct ?? null,
    } as any);

    // Build updated loser record
    const loserUpdated: Partial<FighterRow> = {
      elo: loserNew,
      fights: (loserRow.fights ?? 0) + 1,
      td_accuracy:    loserStats?.td_accuracy    ?? loserRow.td_accuracy,
      td_defense:     loserStats?.td_defense     ?? loserRow.td_defense,
      ground_ctrl_pct: loserStats?.ground_ctrl_pct ?? loserRow.ground_ctrl_pct,
      dob: loserStats?.dob ?? loserRow.dob,
      updated_at: new Date().toISOString(),
    };
    loserUpdated.style = classifyStyle({
      fights: loserUpdated.fights!,
      ko_wins: loserRow.ko_wins ?? 0,
      sub_wins: loserRow.sub_wins ?? 0,
      td_accuracy: loserUpdated.td_accuracy ?? null,
      ground_ctrl_pct: loserUpdated.ground_ctrl_pct ?? null,
    } as any);

    await Promise.all([
      sb.from("ufc_fighter_ratings")
        .update(winnerUpdated)
        .eq("fighter_name", winnerRow.fighter_name),
      sb.from("ufc_fighter_ratings")
        .update(loserUpdated)
        .eq("fighter_name", loserRow.fighter_name),
    ]);

    return NextResponse.json({
      ok: true,
      winner: winnerRow.fighter_name,
      loser:  loserRow.fighter_name,
      method,
      k: K_BY_METHOD[method],
      winnerEloOld: Number(winnerRow.elo),
      winnerEloNew: winnerNew,
      loserEloOld:  Number(loserRow.elo),
      loserEloNew:  loserNew,
      winnerStyle: winnerUpdated.style,
      loserStyle:  loserUpdated.style,
    });
  } catch (err: any) {
    console.error("[ufc/grade] error:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
