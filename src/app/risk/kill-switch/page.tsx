// src/app/risk/kill-switch/page.tsx
"use client";

import * as React from "react";
import Tooltip from "@/components/Tooltip";

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

function computeRiskState(args: {
  drawdownPct: number;
  survivalScore: number;
  climateScore: number;
  baseRiskPct: number;
  killSwitchActive: boolean;
}): KillSwitchResult {
  const { drawdownPct, survivalScore, climateScore, baseRiskPct, killSwitchActive } = args;
  const reasons: string[] = [];

  // Always compute real multipliers so they're visible even in kill switch state
  let regimeMult = 1.0;
  if (climateScore >= 70)      { regimeMult = 0.5;  reasons.push("Macro risk-off (climate ≥ 70)"); }
  else if (climateScore >= 45) { regimeMult = 0.75; reasons.push("Macro elevated (climate ≥ 45)"); }

  let drawdownMult = 1.0;
  if (drawdownPct >= 0.12)      { drawdownMult = 0.3;  reasons.push("Drawdown critical (≥ 12%)"); }
  else if (drawdownPct >= 0.08) { drawdownMult = 0.5;  reasons.push("Drawdown severe (≥ 8%)"); }
  else if (drawdownPct >= 0.05) { drawdownMult = 0.7;  reasons.push("Drawdown elevated (≥ 5%)"); }

  let survMult = 1.0;
  if (survivalScore < 40)      { survMult = 0.3;  reasons.push("Survivability critical (< 40)"); }
  else if (survivalScore < 55) { survMult = 0.5;  reasons.push("Survivability low (< 55)"); }
  else if (survivalScore < 70) { survMult = 0.75; reasons.push("Survivability watch (< 70)"); }

  const allowedRiskPct = baseRiskPct * regimeMult * drawdownMult * survMult;
  const reduction = 1 - allowedRiskPct / baseRiskPct;

  let riskState: RiskState = "Normal";
  if (reduction >= 0.85)      riskState = "Kill Switch";
  else if (reduction >= 0.6)  riskState = "Restricted";
  else if (reduction >= 0.25) riskState = "Caution";

  const survivalLabel = survivalScore >= 80 ? "Strong" : survivalScore >= 60 ? "Watch" : "Fragile";

  if (killSwitchActive) {
    return {
      riskState: "Kill Switch",
      allowedRiskPct: 0,
      blocked: true,
      reasons: [
        "Kill switch persisted from a prior evaluation — reset below to re-evaluate",
        ...reasons,
      ],
      multipliers: { regime: regimeMult, drawdown: drawdownMult, survivability: survMult },
      survivalScore,
      survivalLabel,
      killSwitch: { active: true, reason: null, triggeredAt: null },
    };
  }

  return {
    riskState,
    allowedRiskPct: Math.max(0, allowedRiskPct),
    blocked: riskState === "Kill Switch",
    reasons,
    multipliers: { regime: regimeMult, drawdown: drawdownMult, survivability: survMult },
    survivalScore,
    survivalLabel,
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

export default function KillSwitchPage() {
  const [currentEquity, setCurrentEquity] = React.useState("");
  const [peakEquity, setPeakEquity]       = React.useState("");
  const [baseRisk, setBaseRisk]           = React.useState("1.0");

  const [climate, setClimate]               = React.useState<ClimateData | null>(null);
  const [climateLoading, setClimateLoading] = React.useState(true);

  const [result, setResult]       = React.useState<KillSwitchResult | null>(null);
  const [loading, setLoading]     = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [resetMsg, setResetMsg]   = React.useState<string | null>(null);
  const [error, setError]         = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/market/climate", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setClimate(d.climate); })
      .catch(() => {})
      .finally(() => setClimateLoading(false));
  }, []);

  async function evaluate() {
    setError(null);
    setResetMsg(null);
    const curr = parseFloat(currentEquity);
    const peak = parseFloat(peakEquity);
    const base = parseFloat(baseRisk) / 100;

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
        survivalScore:    data.score ?? 50,
        climateScore:     climate?.score ?? 0,
        baseRiskPct:      base,
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

  async function resetKillSwitch() {
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/admin/kill-switch/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setResetMsg("Kill switch cleared. Re-evaluate to get your current risk state.");
        setResult(null);
      } else {
        setResetMsg(data.error ?? "Reset failed.");
      }
    } catch {
      setResetMsg("Reset failed. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16 space-y-6">

        {/* Header */}
        <header className="space-y-4">
          <div className="text-xs tracking-[0.22em] text-foreground/40">RISK MANAGEMENT</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">Account Kill Switch</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="text-sm text-foreground/70 max-w-xl">
            Advisory risk governor. Cuts your allowed risk per trade when account conditions deteriorate.
          </p>
        </header>

        {/* Macro climate */}
        <div className="flex items-center gap-3 text-xs">
          <Tooltip label="Macro Climate">
            <div className="space-y-1.5">
              <p>Derived from VIX and SPX vs its 200-day moving average.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><span className="font-semibold">Stable:</span> VIX normal, trend healthy — regime multiplier ×1.0</li>
                <li><span className="font-semibold">Elevated:</span> VIX rising or trend mixed — regime multiplier ×0.75</li>
                <li><span className="font-semibold">High Risk:</span> VIX high or trend fragile — regime multiplier ×0.5</li>
              </ul>
            </div>
          </Tooltip>
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
            {/* Current Equity */}
            <div>
              <div className="mb-1.5">
                <Tooltip label="Current Equity">Your account value right now.</Tooltip>
              </div>
              <div className="flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden focus-within:border-[color:var(--accent)]/40 transition-colors">
                <span className="px-3 text-xs text-foreground/40 border-r border-[color:var(--border)]">$</span>
                <input type="number" step="any" value={currentEquity} onChange={(e) => setCurrentEquity(e.target.value)} placeholder="50000"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder-foreground/20 outline-none" />
              </div>
            </div>

            {/* Peak Equity */}
            <div>
              <div className="mb-1.5">
                <Tooltip label="Peak Equity">The highest your account has ever been. Used to calculate drawdown from peak.</Tooltip>
              </div>
              <div className="flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden focus-within:border-[color:var(--accent)]/40 transition-colors">
                <span className="px-3 text-xs text-foreground/40 border-r border-[color:var(--border)]">$</span>
                <input type="number" step="any" value={peakEquity} onChange={(e) => setPeakEquity(e.target.value)} placeholder="55000"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder-foreground/20 outline-none" />
              </div>
            </div>

            {/* Base Risk */}
            <div>
              <div className="mb-1.5">
                <Tooltip label="Base Risk / Trade">
                  Your normal risk % under good conditions. The kill switch multiplies this down when conditions worsen.
                </Tooltip>
              </div>
              <div className="flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden focus-within:border-[color:var(--accent)]/40 transition-colors">
                <input type="number" step="any" value={baseRisk} onChange={(e) => setBaseRisk(e.target.value)} placeholder="1.0"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder-foreground/20 outline-none" />
                <span className="px-3 text-xs text-foreground/40 border-l border-[color:var(--border)]">%</span>
              </div>
            </div>
          </div>

          {error    && <p className="text-xs text-rose-400">{error}</p>}
          {resetMsg && <p className="text-xs text-[color:var(--accent)]">{resetMsg}</p>}

          <button onClick={evaluate} disabled={loading}
            className="oc-btn oc-btn-primary w-full disabled:opacity-50">
            {loading ? "Evaluating…" : "Evaluate Risk State"}
          </button>
        </section>

        {/* Result */}
        {result && (
          <>
            <section className={`oc-glass rounded-2xl p-6 border ${stateBorder(result.riskState)} space-y-5`}>
              <div className="text-xs tracking-[0.22em] text-foreground/50">RISK STATE</div>

              <div className="flex items-start justify-between">
                <div className={`text-4xl font-semibold ${stateAccent(result.riskState)}`}>
                  {result.riskState}
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 mb-1">
                    <span className="text-xs text-foreground/50">Allowed / Trade</span>
                    <Tooltip label="Allowed / Trade">
                      Max risk you should take per trade today given current conditions.
                      Formula: base risk × regime × drawdown × survivability multipliers.
                    </Tooltip>
                  </div>
                  <div className="text-3xl font-semibold tabular-nums">
                    {result.blocked ? "—" : fmtPct(result.allowedRiskPct)}
                  </div>
                </div>
              </div>

              {/* Multipliers */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["Regime", result.multipliers.regime,
                    "Macro climate multiplier. High Risk = ×0.5, Elevated = ×0.75, Stable = ×1.0"],
                  ["Drawdown", result.multipliers.drawdown,
                    "How far you are from peak equity. ≥12% = ×0.3, ≥8% = ×0.5, ≥5% = ×0.7, below 5% = ×1.0"],
                  ["Survivability", result.multipliers.survivability,
                    "Survival score-based multiplier. Score < 40 = ×0.3, < 55 = ×0.5, < 70 = ×0.75, ≥ 70 = ×1.0"],
                ] as [string, number, string][]).map(([label, val, tip]) => (
                  <div key={label} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-[11px] text-foreground/40 mb-1">
                      <Tooltip label={label}>{tip}</Tooltip>
                    </div>
                    <div className={`text-sm font-semibold tabular-nums ${multColor(val)}`}>×{val.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Survival score */}
              <div className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3">
                <div className="text-xs text-foreground/50">
                  <Tooltip label="Survival Score">
                    <div className="space-y-1.5">
                      <p>Computed from drawdown severity and risk per trade.</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li><span className="font-semibold">Strong (≥80):</span> Survivability multiplier ×1.0</li>
                        <li><span className="font-semibold">Watch (60–79):</span> Survivability multiplier ×0.75</li>
                        <li><span className="font-semibold">Fragile (&lt;60):</span> Survivability multiplier ×0.5 or lower</li>
                      </ul>
                    </div>
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

            {/* Persisted kill switch — reset banner */}
            {result.killSwitch.active && (
              <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-rose-300 mb-1">Kill Switch Active on Account</div>
                  <p className="text-xs text-rose-200/70">
                    A prior evaluation triggered your kill switch and it was saved to your account.
                    {result.killSwitch.triggeredAt && (
                      <> Triggered {new Date(result.killSwitch.triggeredAt).toLocaleDateString()}.</>
                    )}
                    {" "}It auto-clears after 7 days. If your conditions have genuinely improved, you can reset it manually below.
                  </p>
                </div>
                <button
                  onClick={resetKillSwitch}
                  disabled={resetting}
                  className="oc-btn w-full border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Reset Kill Switch"}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}