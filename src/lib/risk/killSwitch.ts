import { supabaseAdmin } from "@/lib/supabase/admin";

export type KillSwitchState = {
  active: boolean;
  reason: string | null;
  triggeredAt: string | null;
};

export async function getKillSwitchStateForUser(
  userId: string
): Promise<KillSwitchState> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "kill_switch_active, kill_switch_reason, kill_switch_triggered_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    active: Boolean(data?.kill_switch_active),
    reason: (data?.kill_switch_reason as string | null) ?? null,
    triggeredAt:
      (data?.kill_switch_triggered_at as string | null) ?? null,
  };
}
