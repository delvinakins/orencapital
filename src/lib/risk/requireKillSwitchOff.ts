// src/lib/risk/requireKillSwitchOff.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type KillSwitchGate =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 423; error: string; killSwitch?: { reason: string | null; triggeredAt: string | null } };

export async function requireKillSwitchOff(): Promise<KillSwitchGate> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  if (error || !user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: prof, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("kill_switch_active, kill_switch_reason, kill_switch_triggered_at")
    .eq("id", user.id)
    .maybeSingle();

  if (pErr) {
    // Fail-closed would be harsh here; we’ll fail-open but you can change this.
    // If you want fail-closed: return { ok:false, status:423, error:"Account locked" ... }
    return { ok: true, userId: user.id };
  }

  const active = Boolean(prof?.kill_switch_active);
  if (active) {
    return {
      ok: false,
      status: 423,
      error: "Account locked (Kill Switch active).",
      killSwitch: {
        reason: (prof?.kill_switch_reason as string | null) ?? null,
        triggeredAt: (prof?.kill_switch_triggered_at as string | null) ?? null,
      },
    };
  }

  return { ok: true, userId: user.id };
}