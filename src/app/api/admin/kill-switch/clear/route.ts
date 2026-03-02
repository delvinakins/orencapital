// src/app/api/admin/kill-switch/clear/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  // If omitted, clears the currently signed-in admin (self)
  userId?: string;
};

export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: gate.status }
      );
    }

    const {
      data: { user },
      error: userErr,
    } = await gate.supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const targetUserId = (body?.userId ?? user.id)?.trim();

    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ✅ Source of truth used by killSwitch.ts + survival-score route:
    // profiles.kill_switch_active / kill_switch_reason / kill_switch_triggered_at
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        kill_switch_active: false,
        kill_switch_reason: null,
        kill_switch_triggered_at: null,
        updated_at: now,
      })
      .eq("id", targetUserId);

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    // Optional: also clear legacy table if it exists (ignore if missing)
    let legacyCleared = false;
    const { error: legacyErr } = await supabaseAdmin
      .from("account_kill_switch")
      .upsert(
        {
          user_id: targetUserId,
          active: false,
          reason: null,
          triggered_at: null,
          cleared_at: now,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

    if (!legacyErr) legacyCleared = true;

    return NextResponse.json({
      ok: true,
      userId: targetUserId,
      cleared: { profiles: true, account_kill_switch: legacyCleared },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}