// src/app/api/admin/nba/power-rankings/get/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DEFAULT_TEAMS = [
  "Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls","Cleveland Cavaliers",
  "Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors","Houston Rockets","Indiana Pacers",
  "Los Angeles Clippers","Los Angeles Lakers","Memphis Grizzlies","Miami Heat","Milwaukee Bucks","Minnesota Timberwolves",
  "New Orleans Pelicans","New York Knicks","Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns",
  "Portland Trail Blazers","Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards",
];

export async function GET(req: Request) {
  try {
    // auth gate (signed in + is_admin in profiles)
    const gate = await requireAdmin();
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
    }

    const { searchParams } = new URL(req.url);
    const season = (searchParams.get("season") || "2025-2026").trim();

    const svc = supabaseService();

    const { data: rows, error: rerr } = await svc
      .from("nba_power_rankings")
      .select("team, rank")
      .eq("season", season)
      .order("rank", { ascending: true });

    if (rerr) throw rerr;

    const { data: pRow, error: perr } = await svc
      .from("nba_oren_params")
      .select("a, k, s")
      .eq("season", season)
      .maybeSingle();

    if (perr) throw perr;

    const items =
      rows && rows.length > 0
        ? rows.map((x, i) => ({ team: x.team, rank: Number(x.rank ?? i + 1) }))
        : DEFAULT_TEAMS.map((t, i) => ({ team: t, rank: i + 1 }));

    const params = {
      A: Number(pRow?.a ?? 10),
      k: Number(pRow?.k ?? 0.12),
      S: Number(pRow?.s ?? 1.0),
    };

    return NextResponse.json({ ok: true, season, items, params });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}