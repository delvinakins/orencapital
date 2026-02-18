import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSubscriptionByEmail } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  noStore();

  try {
    const cookieStore = await cookies();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.email) {
      return NextResponse.json(
        { isPro: false, status: "none", currentPeriodEnd: null },
        { status: 200 }
      );
    }

    const sub = await getSubscriptionByEmail(user.email);

    return NextResponse.json(
      {
        isPro: sub.isPro,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
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
