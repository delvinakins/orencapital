// src/app/api/risk/survival-score/route.ts
import { NextResponse } from "next/server";

type Metrics = {
  ruin_probability?: number; // 0..1 (practical ruin / death proxy)
  drawdown_pct?: number; // 0..1 (p90 or similar)
  consecutive_losses?: number; // integer
  ev_r?: number; // optional expectancy in R
  risk_pct?: number; // 0..1 (per trade / per bet risk fraction)
};

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

  // Streak penalty (beyond "normal" variance)
  // 6 is a “normal” losing streak threshold; beyond that it gets structurally harder to endure.
  score -= clamp(Math.max(0, streak - 6) * 2, 0, 20);

  // Expectancy penalty (only if provided and negative)
  if (Number.isFinite(evR) && evR < 0) {
    // -0.10R or worse is significant
    score -= clamp((Math.abs(evR) / 0.1) * 18, 0, 25);
  }

  // Oversizing penalty (if they’re risking >2% per trade/bet)
  if (riskPct > 0.02) {
    score -= clamp(((riskPct - 0.02) / 0.01) * 8, 0, 25);
  }

  score = clamp(Math.round(score), 0, 100);

  const b = band(score);

  // Plain-language message
  let message = "Structurally survivable if your edge assumptions are real.";
  if (b.label === "Watch") {
    message = "Survivability is sensitive to variance. Sizing is the first lever.";
  }
  if (b.label === "Fragile") {
    message = "Structurally fragile under variance. Reduce risk% and re-run.";
  }

  return { score, ...b, message };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const metrics = (body?.metrics ?? {}) as Metrics;

    const result = computeScore(metrics);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, score: 0, label: "Fragile", tone: "warn", message: "Unable to score." }, { status: 200 });
  }
}