import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SavePayload = {
  id?: string;
  name: string;
  data: unknown;
};

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // If your DB requires email NOT NULL, enforce it here too.
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "User email is required but missing." },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as SavePayload;

    if (!body?.name) {
      return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const row = {
      id: body.id,
      user_id: user.id,     // requires portfolios.user_id
      email: user.email,    // requires portfolios.email NOT NULL
      name: body.name,
      data: body.data,
      updated_at: now,
    };

    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .upsert(row, { onConflict: "id" })
      .select("id, name, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, portfolio: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}