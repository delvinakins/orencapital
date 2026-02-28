import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type Profile = "conservative" | "tactical" | "aggressive";
type Reason = "ruin_prob" | "drawdown" | "loss_streak" | "vol_spike" | "manual";

type Metrics = {
  ruin_probability: number; // 0..1
  drawdown_pct: number;     // 0..1 (e.g. 0.18 = -18%)
  consecutive_losses: number;
  volatility_score?: number;
};

const ARC_DURATION_HOURS = 24;
const CPM_DURATION_HOURS = 48;

const ARC_CAP_BPS: Record<Profile, number> = {
  conservative: 50,
  tactical: 75,
  aggressive: 100,
};

const CPM_CAP_BPS = 25;

const THRESHOLDS: Record<
  Profile,
  {
    soft: { ruin: number; dd: number; streak: number };
    hard: { ruin: number; dd: number; streak: number };
  }
> = {
  conservative: {
    soft: { ruin: 0.15, dd: 0.12, streak: 3 },
    hard: { ruin: 0.20, dd: 0.15, streak: 4 },
  },
  tactical: {
    soft: { ruin: 0.22, dd: 0.16, streak: 4 },
    hard: { ruin: 0.30, dd: 0.20, streak: 5 },
  },
  aggressive: {
    soft: { ruin: 0.30, dd: 0.22, streak: 5 },
    hard: { ruin: 0.40, dd: 0.28, streak: 6 },
  },
};

function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pickReason(
  m: Metrics,
  tier: "soft" | "hard",
  profile: Profile
): Reason {
  const t = THRESHOLDS[profile][tier];
  if (m.ruin_probability > t.ruin) return "ruin_prob";
  if (m.drawdown_pct > t.dd) return "drawdown";
  if (m.consecutive_losses >= t.streak) return "loss_streak";
  return "manual";
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

  const metrics: Metrics | undefined = body?.metrics;
  if (!metrics) {
    return NextResponse.json({ error: "Missing metrics" }, { status: 400 });
  }

  const m: Metrics = {
    ruin_probability: clamp01(Number(metrics.ruin_probability)),
    drawdown_pct: clamp01(Number(metrics.drawdown_pct)),
    consecutive_losses: Math.max(0, Number(metrics.consecutive_losses ?? 0) | 0),
    volatility_score:
      metrics.volatility_score == null ? undefined : Number(metrics.volatility_score),
  };

  // Load user settings
  const { data: existing, error: selErr } = await supabase
    .from("user_risk_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const profile = (existing?.survivability_profile ?? "tactical") as Profile;

  const now = new Date();

  const cpmActive = Boolean(existing?.capital_protection_active);
  const cpmExpiresAt = existing?.cpm_expires_at ? new Date(existing.cpm_expires_at) : null;

  const arcActive = Boolean(existing?.risk_cap_active);
  const arcExpiresAt = existing?.risk_cap_expires_at ? new Date(existing.risk_cap_expires_at) : null;

  const t = THRESHOLDS[profile];

  const hardBreach =
    m.ruin_probability > t.hard.ruin ||
    m.drawdown_pct > t.hard.dd ||
    m.consecutive_losses >= t.hard.streak;

  const softBreach =
    hardBreach ||
    m.ruin_probability > t.soft.ruin ||
    m.drawdown_pct > t.soft.dd ||
    m.consecutive_losses >= t.soft.streak;

  const cpmShouldBeActive = hardBreach;
  const arcShouldBeActive = softBreach && !cpmShouldBeActive;

  const updates: any = { user_id: user.id };

  // ---- CPM LOGIC ----
  if (cpmShouldBeActive) {
    updates.capital_protection_active = true;
    updates.cpm_expires_at = addHours(now, CPM_DURATION_HOURS).toISOString();
    updates.cpm_reason = pickReason(m, "hard", profile);

    updates.risk_cap_active = false;
    updates.risk_cap_expires_at = null;
    updates.risk_cap_max_risk_bps = null;
    updates.risk_cap_reason = null;
  } else {
    const expired = cpmExpiresAt ? now >= cpmExpiresAt : false;
    if (cpmActive && expired) {
      updates.capital_protection_active = false;
      updates.cpm_expires_at = null;
      updates.cpm_reason = null;
    }
  }

  // ---- ARC LOGIC ----
  if (!cpmShouldBeActive) {
    if (arcShouldBeActive) {
      updates.risk_cap_active = true;
      updates.risk_cap_expires_at = addHours(now, ARC_DURATION_HOURS).toISOString();
      updates.risk_cap_max_risk_bps = ARC_CAP_BPS[profile];
      updates.risk_cap_reason = pickReason(m, "soft", profile);
    } else {
      const expired = arcExpiresAt ? now >= arcExpiresAt : false;
      if (arcActive && expired) {
        updates.risk_cap_active = false;
        updates.risk_cap_expires_at = null;
        updates.risk_cap_max_risk_bps = null;
        updates.risk_cap_reason = null;
      }
    }
  }

  const { data: saved, error: upErr } = await supabase
    .from("user_risk_settings")
    .upsert(updates, { onConflict: "user_id" })
    .select("*")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const effectiveCapBps = saved.capital_protection_active
    ? CPM_CAP_BPS
    : saved.risk_cap_active
      ? saved.risk_cap_max_risk_bps
      : null;

  return NextResponse.json({
    ok: true,
    profile,
    hardBreach,
    softBreach,
    effective_cap_bps: effectiveCapBps,
    settings: saved,
  });
}