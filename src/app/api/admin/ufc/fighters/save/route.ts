// src/app/api/admin/ufc/fighters/save/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";
import { classifyStyle } from "@/lib/labs/ufc/elo";

export const dynamic = "force-dynamic";

function num(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : fallback;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: gate.status }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const weightClass = String(body?.weightClass ?? "").trim();
    if (!weightClass) {
      return NextResponse.json({ ok: false, error: "weightClass required" }, { status: 400 });
    }

    const rawFighters: any[] = Array.isArray(body?.fighters) ? body.fighters : [];
    if (rawFighters.length === 0) {
      return NextResponse.json({ ok: false, error: "fighters array required" }, { status: 400 });
    }

    const svc = supabaseService();

    const rows = rawFighters
      .map((f: any) => {
        const name = String(f?.name ?? "").trim().toLowerCase();
        if (!name) return null;

        const elo = clamp(num(f?.elo, 1500), 500, 3000);
        const style = ["ko_artist", "grappler", "balanced"].includes(f?.style)
          ? f.style
          : "balanced";
        const dob = typeof f?.dob === "string" && f.dob.trim() ? f.dob.trim() : null;
        const tdAccuracy =
          f?.tdAccuracy != null ? clamp(num(f.tdAccuracy, 0), 0, 1) : null;
        const groundCtrlPct =
          f?.groundCtrlPct != null ? clamp(num(f.groundCtrlPct, 0), 0, 1) : null;

        return {
          fighter_name: name,
          elo,
          style,
          dob,
          weight_class: weightClass,
          td_accuracy: tdAccuracy,
          ground_ctrl_pct: groundCtrlPct,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fighters" }, { status: 400 });
    }

    const { error } = await svc
      .from("ufc_fighter_ratings")
      .upsert(rows as any[], { onConflict: "fighter_name" });

    if (error) throw error;

    return NextResponse.json({ ok: true, weightClass, count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
