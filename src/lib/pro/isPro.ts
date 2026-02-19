import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-truth Pro check.
 * Keep this logic aligned with /api/pro/status so Pro gating is consistent.
 *
 * Update ONE place (here) when your billing model evolves.
 */
export async function isUserPro(userId: string): Promise<{ isPro: boolean; status?: string }> {
  const supabase = await createSupabaseServerClient();

  // --- Option A: profiles table with boolean flag ---
  // If you have profiles.is_pro, this will work.
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", userId)
      .maybeSingle();

    if (!error && profile && typeof (profile as any).is_pro === "boolean") {
      return { isPro: !!(profile as any).is_pro, status: (profile as any).is_pro ? "active" : "inactive" };
    }
  } catch {
    // ignore and fall through
  }

  // --- Option B: subscriptions table with status ---
  // If you have subscriptions.status in {active, trialing}, this will work.
  try {
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (!error && sub && typeof (sub as any).status === "string") {
      return { isPro: true, status: String((sub as any).status) };
    }
  } catch {
    // ignore and fall through
  }

  // --- Option C: pro_access table existence ---
  // If you have a simple allowlist table.
  try {
    const { data: row, error } = await supabase
      .from("pro_access")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && row) {
      return { isPro: true, status: "active" };
    }
  } catch {
    // ignore
  }

  return { isPro: false, status: "inactive" };
}
