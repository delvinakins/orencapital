import { supabaseAdmin } from "@/lib/supabase/admin";
import { unstable_noStore as noStore } from "next/cache";

const ACTIVE = new Set(["active", "trialing"]);

export async function getSubscriptionByEmail(email: string | null | undefined) {
  // Prevent Next.js from caching this result (critical for nav/pro status updates)
  noStore();

  if (!email) return { isPro: false, status: "none" as const };

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("stripe_subscriptions")
    .select("subscription_status, current_period_end")
    // Case-insensitive match to avoid subtle email casing issues
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error || !data) {
    return { isPro: false, status: "none" as const };
  }

  const status = String(data.subscription_status ?? "none").trim().toLowerCase();

  return {
    isPro: ACTIVE.has(status),
    status,
    currentPeriodEnd: data.current_period_end ?? null,
  };
}
