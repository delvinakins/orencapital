import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  noStore();

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json(
        { isPro: false, status: "none", currentPeriodEnd: null },
        { status: 200 }
      );
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("subscription_status, current_period_end")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json(
        { isPro: false, status: "none", currentPeriodEnd: null },
        { status: 200 }
      );
    }

    const status = profile.subscription_status ?? "none";
    const isPro = status === "active" || status === "trialing";

    return NextResponse.json(
      {
        isPro,
        status,
        currentPeriodEnd: profile.current_period_end ?? null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { isPro: false, status: "none", currentPeriodEnd: null },
      { status: 200 }
    );
  }
}