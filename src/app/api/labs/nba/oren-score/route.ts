// src/app/api/labs/nba/oren-score/route.ts
import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

async function readRankings(args: { season: string; table: string }) {
  const { season, table } = args;
  const svc = supabaseService();

  const { data, error } = await svc
    .from(table)
    .select("team, rank")
    .eq("season", season)
    .order("rank", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = (searchParams.get("season") || "2025-2026").trim();

    const svc = supabaseService();

    // 1) Try the table your code writes to
    let source = "nba_power_rankings";
    let rows = await readRankings({ season, table: source });

    // 2) If empty, fall back to the table that likely has your real data
    if (!rows || rows.length === 0) {
      source = "oren_power_rankings_current";
      rows = await readRankings({ season, table: source });
    }

    // params (safe defaults)
    const { data: pRow, error: perr } = await svc
      .from("nba_oren_params")
      .select("a, k, s")
      .eq("season", season)
      .maybeSingle();

    if (perr) throw perr;

    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      const key = normalizeTeam((r as any).team);
      const rank = Number((r as any).rank);
      if (key && Number.isFinite(rank)) map[key] = rank;
    }

    const params = {
      A: Number((pRow as any)?.a ?? 10),
      k: Number((pRow as any)?.k ?? 0.12),
      S: Number((pRow as any)?.s ?? 1.0),
    };

    return NextResponse.json({
      ok: true,
      season,
      map,
      params,
      count: Object.keys(map).length,
      source,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}