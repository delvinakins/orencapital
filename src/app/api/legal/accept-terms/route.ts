// src/app/api/legal/accept-terms/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function currentTermsVersion() {
  return process.env.NEXT_PUBLIC_TERMS_VERSION || "v1";
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const v = currentTermsVersion();

    // Use service role to ensure we can always persist acceptance
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          terms_version: v,
          terms_accepted_at: now,
          updated_at: now,
        },
        { onConflict: "id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, terms_version: v, terms_accepted_at: now });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}