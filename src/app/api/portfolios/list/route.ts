import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionByEmail } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET() {
  try {
    const testEmail = "test@gmail.com"; // TEMP until auth

    const sub = await getSubscriptionByEmail(testEmail);
    if (!sub.isPro) {
      return NextResponse.json({ error: "Pro required." }, { status: 402 });
    }

    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .select("id,name,created_at,updated_at,data")
      .eq("email", testEmail)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to list portfolios" },
      { status: 500 }
    );
  }
}
