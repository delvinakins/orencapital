import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Enforce NOT NULL email if your DB requires it
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "User email is required but missing." },
        { status: 400 }
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