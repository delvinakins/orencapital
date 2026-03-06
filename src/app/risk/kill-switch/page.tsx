// src/app/risk/kill-switch/page.tsx
"use client";

import * as React from "react";
import Tooltip from "@/components/Tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskState = "Normal" | "Caution" | "Restricted" | "Kill Switch";

type ClimateData = {
  score: number;
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  cap_bps: number | null;
};

type KillSwitchResult = {
  riskState: RiskState;
  allowedRiskPct: number;
  blocked: boolean;
  reasons: string[];
  multipliers: { regime: number; drawdown: number; survivability: number };
  survivalScore: number;
  survivalLabel: string;
  killSwitch: { active: boolean; reason: string | null; triggeredAt: string | null };
};

// ── Risk state engine ─────────────────────────────────────────────────────────
function computeRiskState(args: {
  drawdownPct: number;
  survivalScore: number;
  climateScore: number;
  baseRiskPct: number;
  killSwitchActive: boolean;
}): KillSwitchResult {
  const { drawdownPct, survivalScore, climateScore, baseRiskPct, killSwitchActive } = args;
  const reasons: string[] = [];

  if (killSwitchActive) {
    return {
      riskState: "Kill Switch", allowedRiskPct: 0, blocked: true,
      reasons: ["Kill switch active — no new risk allowed"],
      multipliers: { regime: 0, drawdown: 0, survivability: 0 },
      survivalScore, survivalLabel: survivalScore >= 80 ? "Strong" : survivalScore >= 60 ? "Watch" : "Fragile",
      killSwitch: { active: true, reason: null, triggeredAt: null },
    };
  }

  let regimeMult = 1.0;
  if (climateScore >= 70)      { regimeMult = 0.5;  reasons.push("Macro risk-off"); }
  else if (climateScore >= 45) { regimeMult = 0.75; reasons.push("Macro elevated"); }

  let drawdownMult = 1.0;
  if (drawdownPct >= 0.12)      { drawdownMult = 0.3;  reasons.push("Drawdown critical (≥12%)"); }
  else if (drawdownPct >= 0.08) { drawdownMult = 0.5;  reasons.push("Drawdown severe (≥8%)"); }
  else if (drawdownPct >= 0.05) { drawdownMult = 0.7;  reasons.push("Drawdown elevated (≥5%)"); }

  let survMult = 1.0;
  if (survivalScore < 40)      { survMult = 0.3;  reasons.push("Survivability critical (<40)"); }
  else if (survivalScore < 55) { survMult = 0.5;  reasons.push("Survivability low (<55)"); }
  else if (survivalScore < 70) { survMult = 0.75; reasons.push("Survivability watch (<70)"); }

  const allowedRiskPct = baseRiskPct * regimeMult * drawdownMult * survMult;
  const reduction = 1 - allowedRiskPct / baseRiskPct;

  let riskState: RiskState = "Normal";
  if (reduction >= 0.85)      riskState = "Kill Switch";
  else if (reduction >= 0.6)  riskState = "Restricted";
  else if (reduction >= 0.25) riskState = "Caution";

  return {
    riskState,
    allowedRiskPct: Math.max(0, allowedRiskPct),
    blocked: riskState === "Kill Switch",
    reasons,
    multipliers: { regime: regimeMult, drawdown: drawdownMult, survivability: survMult },
    survivalScore,
    survivalLabel: survivalScore >= 80 ? "Strong" : survivalScore >= 60 ? "Watch" : "Fragile",
    killSwitch: { active: false, reason: null, triggeredAt: null },
  };
}

function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

function stateAccent(state: RiskState) {
  switch (state) {
    case "Normal":      return "text-[color:var(--accent)]";
    case "Caution":     return "text-amber-400";
    case "Restricted":  return "text-orange-400";
    case "Kill Switch": return "text-rose-400";
  }
}

function stateBorder(state: RiskState) {
  switch (state) {
    case "Normal":      return "border-[color:var(--accent)]/30";
    case "Caution":     return "border-amber-500/30";
    case "Restricted":  return "border-orange-500/30";
    case "Kill Switch": return "border-rose-500/40";
  }
}

function multColor(v: number) {
  if (v < 0.5) return "text-rose-400";
  if (v < 0.8) return "text-amber-400";
  return "text-[color:var(--accent)]";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function KillSwitchPage() {
  const [currentEquity, setCurrentEquity] = React.useState("");
  const [peakEquity, setPeakEquity]       = React.useState("");
  const [baseRisk, setBaseRisk]           = React.useState("1.0");

  const [climate, setClimate]             = React.useState<ClimateData | null>(null);
  const [climateLoading, setClimateLoading] = React.useState(true);

  const [result, setResult]   = React.useState<KillSwitchResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/market/climate", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setClimate(d.climate); })
      .catch(() => {})
      .finally(() => setClimateLoading(false));
  }, []);

  async function evaluate() {
    setError(null);
    const curr  = parseFloat(currentEquity);
    const peak  = parseFloat(peakEquity);
    const base  = parseFloat(baseRisk) / 100;

    if (!Number.isFinite(curr) || curr <= 0) { setError("Enter a valid current equity."); return; }
    if (!Number.isFinite(peak) || peak <= 0) { setError("Enter a valid peak equity."); return; }
    if (!Number.isFinite(base) || base <= 0) { setError("Enter a valid base risk %."); return; }
    if (curr > peak)                         { setError("Current equity cannot exceed peak equity."); return; }

    setLoading(true);
    try {
      const drawdownPct = (peak - curr) / peak;

      const res = await fetch("/api/risk/survival-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: { drawdown_pct: drawdownPct, risk_pct: base } }),
      });

      const data = await res.json();
      if (!data.ok && !data.score) throw new Error(data.error ?? "Score failed");

      const computed = computeRiskState({
        drawdownPct,
        survivalScore: data.score ?? 50,
        climateScore:  climate?.score ?? 0,
        baseRiskPct:   base,
        killSwitchActive: data.killSwitch?.active ?? false,
      });

      computed.killSwitch = {
        active:      data.killSwitch?.active ?? false,
        reason:      data.killSwitch?.reason ?? null,
        triggeredAt: data.killSwitch?.triggeredAt ?? null,
      };

      setResult(computed);
    } catch (e: any) {
      setError(e?.message ?? "Evaluation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16 space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Account Kill Switch</h1>
          <p className="text-sm text-foreground/70">
            Advisory risk governor. Cuts allowed risk automatically when conditions deteriorate.
          </p>
        </header>

        {/* Macro climate */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-foreground/40">Macro Climate</span>
          {climateLoading ? (
            <span className="text-foreground/30">Loading…</span>
          ) : climate ? (
            <span className={`rounded-full border px-2.5 py-1 font-medium ${
              climate.tone === "accent"  ? "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]" :
              climate.tone === "neutral" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" :
                                          "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}>
              {climate.label} · {climate.score}
            </span>
          ) : (
            <span className="text-foreground/30">Unavailable</span>
          )}
        </div>

        {/* Inputs */}
        <section className="oc-glass rounded-2xl p-6 space-y-5">
          <div className="text-xs tracking-[0.22em] text-foreground/50">ACCOUNT INPUTS</div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Current Equity", value: currentEquity, set: setCurrentEquity, prefix: "$", placeholder: "50000" },
              { label: "Peak Equity",    value: peakEquity,    set: setPeakEquity,    prefix: "$", placeholder: "55000" },
              { label: "Base Risk / Trade", value: baseRisk,   set: setBaseRisk,      suffix: "%", placeholder: "1.0" },
            ].map(({ label, value, set, prefix, suffix, placeholder }) => (
              <div key={label}>
                <label className="block text-xs text-foreground/60 mb-1.5">{label}</label>
                <div className="flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden focus-within:border-[color:var(--accent)]/40 transition-colors">
                  {prefix && <span className="px-3 text-xs text-foreground/40 border-r border-[color:var(--border)]">{prefix}</span>}
                  <input
                    type="number"
                    step="any"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder-foreground/20 outline-none"
                  />
                  {suffix && <span className="px-3 text-xs text-foreground/40 border-l border-[color:var(--border)]">{suffix}</span>}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            onClick={evaluate}
            disabled={loading}
            className="oc-btn oc-btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Evaluating…" : "Evaluate Risk State"}
          </button>
        </section>

        {/* Result */}
        {result && (
          <>
            {/* State card */}
            <section className={`oc-glass rounded-2xl p-6 border ${stateBorder(result.riskState)} space-y-5`}>
              <div className="text-xs tracking-[0.22em] text-foreground/50">RISK STATE</div>

              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-4xl font-semibold ${stateAccent(result.riskState)}`}>
                    {result.riskState}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-foreground/50 mb-1">Allowed / Trade</div>
                  <div className="text-3xl font-semibold tabular-nums">
                    {result.blocked ? "—" : fmtPct(result.allowedRiskPct)}
                  </div>
                </div>
              </div>

              {/* Multipliers */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["Regime",         result.multipliers.regime],
                  ["Drawdown",       result.multipliers.drawdown],
                  ["Survivability",  result.multipliers.survivability],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3 text-center">
                    <div className="text-[11px] text-foreground/40 mb-1">{label}</div>
                    <div className={`text-sm font-semibold tabular-nums ${multColor(val)}`}>×{val.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Survival score */}
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3">
                <div className="text-xs text-foreground/50">
                  <Tooltip label="Survival Score">
                    Computed from drawdown severity and risk per trade. Drives the survivability multiplier.
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold tabular-nums ${multColor(result.survivalScore / 100)}`}>
                    {result.survivalScore}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    result.survivalScore >= 80 ? "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]" :
                    result.survivalScore >= 60 ? "border-amber-500/30 bg-amber-500/10 text-amber-300" :
                                                 "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  }`}>{result.survivalLabel}</span>
                </div>
              </div>

              {/* Active conditions */}
              {result.reasons.length > 0 && (
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3">
                  <div className="text-[11px] text-foreground/40 mb-2">Active Conditions</div>
                  <ul className="space-y-1.5">
                    {result.reasons.map((r) => (
                      <li key={r} className="flex items-start gap-2 text-xs text-foreground/70">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${stateAccent(result.riskState).replace("text-", "bg-")}`} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.reasons.length === 0 && (
                <p className="text-xs text-foreground/40">No active conditions — full risk approved.</p>
              )}
            </section>

            {/* Formula */}
            {!result.blocked && (
              <section className="oc-glass rounded-xl p-4 text-xs text-foreground/50">
                <span className="text-foreground/30">Formula: </span>
                {fmtPct(parseFloat(baseRisk) / 100)} base
                {" × "}×{result.multipliers.regime.toFixed(2)} regime
                {" × "}×{result.multipliers.drawdown.toFixed(2)} drawdown
                {" × "}×{result.multipliers.survivability.toFixed(2)} survivability
                {" = "}
                <span className="text-foreground font-medium">{fmtPct(result.allowedRiskPct)} allowed</span>
              </section>
            )}

            {/* Persisted kill switch warning */}
            {result.killSwitch.active && (
              <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
                <div className="text-sm font-semibold text-rose-300 mb-1">Kill Switch Persisted to Account</div>
                <p className="text-xs text-rose-200/70">
                  Your kill switch is active and saved.
                  {result.killSwitch.triggeredAt && (
                    <> Triggered {new Date(result.killSwitch.triggeredAt).toLocaleDateString()}.</>
                  )}
                  {" "}Auto-clears after 7 days. Contact support to reset early.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
