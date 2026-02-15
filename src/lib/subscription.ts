import { supabaseAdmin } from "@/lib/supabase/admin";

const ACTIVE = new Set(["active", "trialing"]);

export async function getSubscriptionByEmail(email: string | null | undefined) {
  if (!email) return { isPro: false, status: "none" as const };

  const { data, error } = await supabaseAdmin
    .from("stripe_subscriptions")
    .select("subscription_status, current_period_end")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    return { isPro: false, status: "none" as const };
  }

  const status = (data.subscription_status ?? "none") as string;

  return {
    isPro: ACTIVE.has(status),
    status,
    currentPeriodEnd: data.current_period_end ?? null,
  };
}
