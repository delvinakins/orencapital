import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getSubscriptionByEmail } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  noStore();

  try {
    const supabase = await createClient();

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
