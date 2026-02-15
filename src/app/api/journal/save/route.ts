import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionByEmail } from "@/lib/subscription";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const testEmail = "test@gmail.com"; // TEMP until auth

    const sub = await getSubscriptionByEmail(testEmail);
    if (!sub.isPro) {
      return NextResponse.json({ error: "Pro required." }, { status: 402 });
    }

    const body = await req.json().catch(() => ({}));
    const tag = (body?.tag ?? "").toString().trim();
    const note = (body?.note ?? "").toString().trim();
    const snapshot = body?.snapshot;

    if (!snapshot) {
      return NextResponse.json({ error: "Missing snapshot." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("journal_entries").insert({
      email: testEmail,
      tag: tag || null,
      note: note || null,
      snapshot,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Save failed" }, { status: 500 });
  }
}
