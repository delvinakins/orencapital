import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isProUserByEmail } from "@/lib/pro";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const testEmail = "test@gmail.com"; // TEMP until auth

    const isPro = await isProUserByEmail(testEmail);
    if (!isPro) {
      return NextResponse.json({ error: "Pro required to load portfolios." }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const id = body?.id as string | undefined;

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .select("id,name,data,updated_at,created_at")
      .eq("email", testEmail)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Load failed" }, { status: 500 });
  }
}
