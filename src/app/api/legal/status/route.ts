// src/app/api/legal/status/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function currentTermsVersion() {
  return process.env.NEXT_PUBLIC_TERMS_VERSION || "v1";
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: true, signedIn: false, accepted: true });
    }

    const { data: prof, error } = await supabase
      .from("profiles")
      .select("terms_version, terms_accepted_at")
      .eq("id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const v = currentTermsVersion();
    const accepted = Boolean(prof?.terms_accepted_at) && prof?.terms_version === v;

    return NextResponse.json({
      ok: true,
      signedIn: true,
      accepted,
      currentVersion: v,
      terms_version: prof?.terms_version ?? null,
      terms_accepted_at: prof?.terms_accepted_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}