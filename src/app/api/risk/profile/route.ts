import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type Profile = "conservative" | "tactical" | "aggressive";

const RANK: Record<Profile, number> = {
  conservative: 0,
  tactical: 1,
  aggressive: 2,
};

const UPGRADE_LOCK_DAYS = 30;

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requested = body?.profile as Profile | undefined;
  if (!requested || !(requested in RANK)) {
    return NextResponse.json(
      { error: "Invalid profile. Use conservative|tactical|aggressive." },
      { status: 400 }
    );
  }

  // Ensure settings row exists (reuse GET logic pattern but inline to avoid extra HTTP hop)
  const { data: existing, error: selErr } = await supabase
    .from("user_risk_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const current: Profile = (existing?.survivability_profile ??
    "tactical") as Profile;

  const now = new Date();
  const lockedUntil = existing?.profile_locked_until
    ? new Date(existing.profile_locked_until)
    : null;

  const isUpgrade = RANK[requested] > RANK[current];
  const isDowngrade = RANK[requested] < RANK[current];

  // No-op
  if (requested === current) {
    return NextResponse.json({
      ok: true,
      settings: existing ?? {
        user_id: user.id,
        survivability_profile: current,
        profile_locked_until: lockedUntil?.toISOString() ?? null,
      },
      note: "No change",
    });
  }

  // Upgrades are locked, downgrades always allowed
  if (isUpgrade && lockedUntil && now < lockedUntil) {
    return NextResponse.json(
      {
        error: "Profile upgrade locked",
        lockedUntil: lockedUntil.toISOString(),
        current,
        requested,
      },
      { status: 403 }
    );
  }

  // Compute next lock:
  // - If upgrading: set lock = now + 30 days
  // - If downgrading: do NOT reset lock
  const nextLockedUntil = isUpgrade ? addDays(now, UPGRADE_LOCK_DAYS) : lockedUntil;

  // Upsert settings row (insert if missing, else update)
  const { data: upserted, error: upErr } = await supabase
    .from("user_risk_settings")
    .upsert(
      {
        user_id: user.id,
        survivability_profile: requested,
        profile_locked_until: nextLockedUntil ? nextLockedUntil.toISOString() : null,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Audit event (best-effort; do not fail the request if insert fails)
  await supabase.from("risk_events").insert({
    user_id: user.id,
    kind: "PROFILE_CHANGE",
    from_profile: current,
    to_profile: requested,
    meta: {
      isUpgrade,
      isDowngrade,
      lockedUntilBefore: lockedUntil?.toISOString() ?? null,
      lockedUntilAfter: nextLockedUntil?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ ok: true, settings: upserted });
}