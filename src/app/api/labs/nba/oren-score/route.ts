// src/app/api/labs/nba/oren-score/route.ts
import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
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

    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      const key = normalizeTeam(r.team);
      const rank = Number(r.rank);
      if (key && Number.isFinite(rank)) map[key] = rank;
    }

    const params = {
      A: Number(pRow?.a ?? 10),
      k: Number(pRow?.k ?? 0.12),
      S: Number(pRow?.s ?? 1.0),
    };

    return NextResponse.json({
      ok: true,
      season,
      map,
      params,
      count: Object.keys(map).length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}