// src/app/api/portfolios/save/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getKillSwitchStateForUser } from "@/lib/risk/killSwitch";

export const runtime = "nodejs";

type SavePayload = {
  id?: string;
  name: string;
  data: unknown;
};

export async function POST(req: Request) {
  try {
    // 1) Auth: must be signed in
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    // 2) Account Kill Switch gate (server-trusted)
    const ks = await getKillSwitchStateForUser(userId);
    if (ks.active) {
      return NextResponse.json(
        {
          ok: false,
          error: "Account Kill Switch active: trading actions are temporarily locked.",
          killSwitch: ks,
        },
        { status: 423 }
      );
    }

    // 3) Parse payload
    const body = (await req.json().catch(() => null)) as SavePayload | null;

    if (!body?.name) {
      return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
    }

    // 4) Persist (server-side service role)
    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .upsert(
        {
          id: body.id ?? undefined,
          user_id: userId,
          name: String(body.name).trim(),
          data: body.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
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