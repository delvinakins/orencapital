// src/app/api/admin/nba/power-rankings/save/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function supabaseServer() {
  const cookieStore = cookies();
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

export async function POST(req: Request) {
  try {
    // auth gate
    const supa = supabaseServer();
    const { data } = await supa.auth.getUser();
    const email = data.user?.email ?? null;
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(email)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const season = String(body?.season || "2025-2026").trim();

    const orderedTeams: string[] = Array.isArray(body?.orderedTeams) ? body.orderedTeams.map((x: any) => String(x)) : [];
    if (orderedTeams.length < 10) {
      return NextResponse.json({ ok: false, error: "orderedTeams missing/too short" }, { status: 400 });
    }

    const A = clamp(Number(body?.params?.A ?? 10), 0.1, 200);
    const k = clamp(Number(body?.params?.k ?? 0.12), 0.001, 2.0);
    const S = clamp(Number(body?.params?.S ?? 1.0), 0.01, 20);

    const svc = supabaseService();

    // Upsert params
    {
      const { error } = await svc
        .from("nba_oren_params")
        .upsert({ season, a: A, k, s: S, updated_at: new Date().toISOString() }, { onConflict: "season" });
      if (error) throw error;
    }

    // Upsert ranks
    const payload = orderedTeams.map((team, i) => ({
      season,
      team,
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: upErr } = await svc
      .from("nba_power_rankings")
      .upsert(payload, { onConflict: "season,team" });

    if (upErr) throw upErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}