// src/app/api/admin/nba/power-rankings/save/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function supabaseServer() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(url, anon, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function num(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : fallback;
}

export async function POST(req: Request) {
  try {
    // auth gate (signed in + admin email)
    const supa = await supabaseServer();
    const { data } = await supa.auth.getUser();
    const email = data.user?.email ?? null;

    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(email)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const season = String(body?.season ?? "2025-2026").trim() || "2025-2026";

    const A = clamp(num(body?.params?.A, 10), 0.1, 200);
    const k = clamp(num(body?.params?.k, 0.12), 0.001, 2.0);
    const S = clamp(num(body?.params?.S, 1.0), 0.01, 20);

    const orderedTeamsRaw: any[] = Array.isArray(body?.orderedTeams) ? body.orderedTeams : [];
    const orderedTeams = orderedTeamsRaw.map((t) => String(t ?? "").trim()).filter(Boolean);

    if (orderedTeams.length === 0) {
      return NextResponse.json({ ok: false, error: "orderedTeams is required" }, { status: 400 });
    }

    // ensure unique teams (no dupes)
    const uniq = Array.from(new Set(orderedTeams));
    if (uniq.length !== orderedTeams.length) {
      return NextResponse.json({ ok: false, error: "orderedTeams contains duplicates" }, { status: 400 });
    }

    const svc = supabaseService();

    // upsert params (one row per season)
    const { error: perr } = await svc
      .from("nba_oren_params")
      .upsert({ season, a: A, k, s: S }, { onConflict: "season" });

    if (perr) throw perr;

    // upsert rankings (one row per team per season)
    const rows = uniq.map((team, idx) => ({
      season,
      team,
      rank: idx + 1,
    }));

    const { error: rerr } = await svc
      .from("nba_power_rankings")
      .upsert(rows, { onConflict: "season,team" });

    if (rerr) throw rerr;

    return NextResponse.json({ ok: true, season, count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}