import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getKillSwitchStateForUser } from "@/lib/risk/killSwitch";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Optional but recommended: if your table expects email NOT NULL, enforce it.
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "User email is required but missing." },
        { status: 400 }
      );
    }

    // Optional: block reads too when kill switch active (keeps system consistent)
    // If you prefer “read-only mode” during kill switch, remove this block.
    const ks = await getKillSwitchStateForUser(user.id);
    if (ks.active) {
      return NextResponse.json(
        { ok: false, error: "Account locked.", killSwitch: ks },
        { status: 423 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .select("id,name,created_at,updated_at,data")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to list portfolios" },
      { status: 500 }
    );
  }
}