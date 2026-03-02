// src/app/api/risk/survival-score/route.ts
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Metrics = {
  ruin_probability?: number; // 0..1 (practical ruin / death proxy)
  drawdown_pct?: number; // 0..1 (p90 or similar)
  consecutive_losses?: number; // integer
  ev_r?: number; // optional expectancy in R
  risk_pct?: number; // 0..1 (per trade / per bet risk fraction)
};

type KillReason = "drawdown" | "daily_loss" | "low_survival";

const KILL = {
  // Soft kill switch triggers (v1)
  // NOTE: you currently do not have daily loss in this endpoint.
  // We'll keep the hook for it, but it will be ignored unless you pass daily_loss_pct.
  drawdownOn: 0.20, // 20%
  dailyLossOn: 0.06, // 6% (optional input)
  survivalOn: 30, // <= 30

  // Auto-clear (time-based only, cannot be spoofed)
  clearAfterDays: 7,
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function n01(x: unknown) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, 1);
}

function nInt(x: unknown) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function band(score: number) {
  if (score >= 80) return { label: "Strong", tone: "accent" as const };
  if (score >= 60) return { label: "Watch", tone: "neutral" as const };
  return { label: "Fragile", tone: "warn" as const };
}

/**
 * Server-trusted score.
 * Key idea: survivability is dominated by (1) ruin probability and (2) drawdown severity,
 * with secondary penalties for streak vulnerability, negative EV, and oversized risk%.
 */
function computeScore(metrics: Metrics) {
  const ruin = n01(metrics.ruin_probability);
  const dd = n01(metrics.drawdown_pct);
  const streak = nInt(metrics.consecutive_losses);
  const evR = Number(metrics.ev_r);
  const riskPct = n01(metrics.risk_pct);

  // Base 100 → subtract penalties (institutional, not gamified)
  let score = 100;

  // Primary penalties
  score -= clamp(ruin * 120, 0, 60); // ruin dominates
  score -= clamp(dd * 80, 0, 40); // deep drawdowns matter

  // Streak penalty
  score -= clamp(Math.max(0, streak - 6) * 2, 0, 20);

  // Expectancy penalty (only if provided and negative)
  if (Number.isFinite(evR) && evR < 0) {
    score -= clamp((Math.abs(evR) / 0.1) * 18, 0, 25);
  }

  // Oversizing penalty (if they’re risking >2% per trade/bet)
  if (riskPct > 0.02) {
    score -= clamp(((riskPct - 0.02) / 0.01) * 8, 0, 25);
  }

  score = clamp(Math.round(score), 0, 100);

  const b = band(score);

  let message = "Structurally survivable if your edge assumptions are real.";
  if (b.label === "Watch") {
    message = "Survivability is sensitive to variance. Sizing is the first lever.";
  }
  if (b.label === "Fragile") {
    message = "Structurally fragile under variance. Reduce risk% and re-run.";
  }

  return { score, ...b, message };
}

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function computeKillTrigger(args: {
  survivalScore: number; // 0..100
  drawdownPct: number; // 0..1
  dailyLossPct?: number; // 0..1 optional
}): { trigger: boolean; reason: KillReason | null } {
  const { survivalScore, drawdownPct, dailyLossPct } = args;

  if (Number.isFinite(drawdownPct) && drawdownPct >= KILL.drawdownOn) {
    return { trigger: true, reason: "drawdown" };
  }

  // Optional: only if provided by caller
  if (Number.isFinite(dailyLossPct) && (dailyLossPct as number) >= KILL.dailyLossOn) {
    return { trigger: true, reason: "daily_loss" };
  }

  if (Number.isFinite(survivalScore) && survivalScore <= KILL.survivalOn) {
    return { trigger: true, reason: "low_survival" };
  }

  return { trigger: false, reason: null };
}

export async function POST(req: Request) {
  noStore();

  try {
    const body = await req.json().catch(() => ({}));
    const metrics = (body?.metrics ?? {}) as Metrics;

    // Optional daily loss hook (not part of Metrics yet)
    const dailyLossPct = body?.daily_loss_pct != null ? n01(body.daily_loss_pct) : undefined;

    // 1) Score (your existing logic)
    const result = computeScore(metrics);

    // 2) Authenticated user required to persist kill switch
    const supabase = await createSupabaseServerClient();
    const { data, error: userErr } = await supabase.auth.getUser();
    const user = data.user;

    // If not signed in, still return score, just don’t write kill switch state
    if (userErr || !user?.id) {
      return NextResponse.json({
        ok: true,
        ...result,
        killSwitch: {
          persisted: false,
          active: false,
          reason: null,
          note: "Not signed in; kill switch state not persisted.",
          thresholds: KILL,
        },
      });
    }

    const drawdownPct = n01(metrics.drawdown_pct);
    const survivalScore = Number(result.score);

    // 3) Read current state (for time-based clear + “no spoofed disable”)
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("kill_switch_active, kill_switch_triggered_at, kill_switch_reason")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { ok: false, error: pErr.message, ...result },
        { status: 500 }
      );
    }

    const prevActive = Boolean(prof?.kill_switch_active);
    const prevTriggeredAt = (prof?.kill_switch_triggered_at as string | null) ?? null;

    // 4) Time-based clear only (cannot be bypassed by spoofed “better” metrics)
    let clearedByTime = false;
    if (prevActive && prevTriggeredAt) {
      const age = daysSince(prevTriggeredAt);
      if (age >= KILL.clearAfterDays) clearedByTime = true;
    }

    // 5) Trigger evaluation (can only turn ON; turning OFF only happens via time-based clear)
    const trig = computeKillTrigger({
      survivalScore,
      drawdownPct,
      dailyLossPct,
    });

    let nextActive = prevActive;
    let nextReason: KillReason | null = (prof?.kill_switch_reason as KillReason | null) ?? null;
    let nextTriggeredAt: string | null = prevTriggeredAt;

    if (clearedByTime) {
      nextActive = false;
      nextReason = null;
      nextTriggeredAt = null;
    }

    // Trigger ON (even if clearedByTime just flipped it off, a trigger can re-activate)
    if (trig.trigger) {
      nextActive = true;
      nextReason = trig.reason;

      if (!prevActive || !prevTriggeredAt) {
        nextTriggeredAt = new Date().toISOString();
      }
    }

    // 6) Persist (service role)
    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update({
        kill_switch_active: nextActive,
        kill_switch_reason: nextActive ? nextReason : null,
        kill_switch_triggered_at: nextActive ? nextTriggeredAt : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (uErr) {
      return NextResponse.json(
        { ok: false, error: uErr.message, ...result },
        { status: 500 }
      );
    }

    // 7) Response includes kill switch state
    return NextResponse.json({
      ok: true,
      ...result,
      killSwitch: {
        persisted: true,
        active: nextActive,
        reason: nextReason,
        triggeredAt: nextTriggeredAt,
        clearedByTime,
        inputs: {
          drawdownPct,
          dailyLossPct: dailyLossPct ?? null,
          survivalScore,
        },
        thresholds: KILL,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, score: 0, label: "Fragile", tone: "warn", message: "Unable to score." },
      { status: 200 }
    );
  }
}