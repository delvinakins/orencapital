// src/app/api/admin/kill-switch/clear/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Body = {
  // optional: admin can clear a specific user; if omitted, clear self
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

    // Default: clear the currently signed-in admin (self)
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

    // 🔧 change if your table is named differently
    const TABLE = "account_kill_switch";
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from(TABLE)
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

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: targetUserId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}