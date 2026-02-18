"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";

/* ---------------- Helpers ---------------- */

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPct01(x: number, digits = 1) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function formatPctSigned01(x: number, digits = 1) {
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(digits)}%`;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function formatR(x: number, digits = 3) {
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}R`;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function maxDrawdownFromEquity(equity: number[]) {
  let peak = equity[0] ?? 1;
  let maxDD = 0;
  for (const x of equity) {
    if (x > peak) peak = x;
    const dd = (peak - x) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function longestLosingStreak(outcomes: boolean[]) {
  let best = 0;
  let cur = 0;
  for (const win of outcomes) {
    if (!win) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

/* ---------------- UI ---------------- */

function Input({
  label,
  value,
  onChange,
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tip?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none placeholder:text-foreground/30"
      />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: ReactNode;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "warn";
}) {
  // Institutional feel: no big red blocks. "warn" uses amber border/text only.
  const toneClass =
    tone === "accent"
      ? "border-[color:var(--accent)]/55 shadow-[0_0_0_1px_rgba(43,203,119,0.10)]"
      : tone === "warn"
        ? "border-amber-800/60"
        : "border-[color:var(--border)]";

  const valueClass =
    tone === "accent"
      ? "text-[color:var(--accent)]"
      : tone === "warn"
        ? "text-amber-200"
        : "text-foreground";

  return (
    <div className={`rounded-xl border ${toneClass} bg-[color:var(--card)] p-5 sm:p-6`}>
      <div className="text-xs text-foreground/60">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-foreground/60">{sub}</div>}
    </div>
  );
}

function toneFromProbability(p: number): "accent" | "neutral" | "warn" {
  if (!Number.isFinite(p)) return "neutral";
  if (p >= 0.30) return "warn";
  if (p <= 0.10) return "accent";
  return "neutral";
}

function toneFromDelta(delta: number): "accent" | "neutral" | "warn" {
  if (!Number.isFinite(delta)) return "neutral";
  if (delta >= 0.15) return "warn";
  if (delta <= -0.05) return "accent";
  return "neutral";
}

function toneFromEV(evR: number): "accent" | "neutral" | "warn" {
  // Calm institutional thresholds
  if (!Number.isFinite(evR)) return "neutral";
  if (evR < 0) return "warn";
  if (evR >= 0.05) return "accent";
  return "neutral";
}

function survivalMessage(psychRuin: number, zeroRuin: number) {
  const pr = Number.isFinite(psychRuin) ? psychRuin : 0;
  const zr = Number.isFinite(zeroRuin) ? zeroRuin : 0;

  if (pr >= 0.45 || zr >= 0.20) {
    return "Sizing risk is elevated. Consider reducing risk per trade and re-running the distribution.";
  }
  if (pr >= 0.25 || zr >= 0.10) {
    return "Survival risk is material. This profile may be hard to maintain through expected variance.";
  }
  return "Survival profile looks structurally reasonable—assuming your win rate and average R are realistic.";
}

/* ---------------- Component ---------------- */

export default function VarianceClient() {
  const searchParams = useSearchParams();

  const [view, setView] = useState<"simple" | "advanced">("simple");

  const [accountSize, setAccountSize] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [winRate, setWinRate] = useState("50");

  const [avgR, setAvgR] = useState("1.2");
  const [trades, setTrades] = useState("120");
  const [sims, setSims] = useState("300");

  // Prefill from Risk Engine (optional)
  useEffect(() => {
    const acc = searchParams.get("account");
    const risk = searchParams.get("risk");
    if (acc) setAccountSize(acc);
    if (risk) setRiskPct(risk);
  }, [searchParams]);

  const computed = useMemo(() => {
    const acc0 = Number(accountSize);
    const rPct = Number(riskPct) / 100;
    const w = Number(winRate) / 100;

    const r = Number(avgR) > 0 ? Number(avgR) : 1.2;
    const nTrades = Number(trades) > 0 ? Number(trades) : 120;
    const nSims = Number(sims) > 0 ? Number(sims) : 300;

    if (acc0 <= 0 || rPct <= 0 || w <= 0 || w >= 1) return null;

    const startEquity = acc0;
    const psychologicalRuinThreshold = startEquity * 0.3; // 70% drawdown (30% remaining)

    type SimRun = { finalEquity: number; maxDD: number; longestL: number };

    function runMonteCarlo(winProb01: number) {
      const wp = clamp01(winProb01);
      const results: SimRun[] = [];

      for (let s = 0; s < nSims; s++) {
        let equity = startEquity;
        const outcomes: boolean[] = [];
        const path = [equity];

        for (let i = 0; i < nTrades; i++) {
          const isWin = Math.random() < wp;
          outcomes.push(isWin);

          const riskDollars = equity * rPct;
          if (isWin) equity += riskDollars * r;
          else equity -= riskDollars;

          equity = Math.max(0, equity);
          path.push(equity);

          if (equity <= 0) break;
        }

        results.push({
          finalEquity: equity,
          maxDD: maxDrawdownFromEquity(path),
          longestL: longestLosingStreak(outcomes),
        });
      }

      const finals = results.map((rr) => rr.finalEquity).sort((a, b) => a - b);
      const dds = results.map((rr) => rr.maxDD).sort((a, b) => a - b);
      const streaks = results.map((rr) => rr.longestL).sort((a, b) => a - b);

      const blowups = results.filter((rr) => rr.finalEquity <= 0).length;
      const psychRuins = results.filter((rr) => rr.finalEquity <= psychologicalRuinThreshold).length;

      return {
        finals,
        dds,
        streaks,
        blowups,
        psychRuins,
        ruinZeroProb: blowups / nSims,
        ruinPsychProb: psychRuins / nSims,
      };
    }

    // Base run (full detail)
    const base = runMonteCarlo(w);

    // Confidence stress test: assume win rate is overstated by 5 percentage points
    const stressWinRate = clamp01(w - 0.05);
    const stress = runMonteCarlo(stressWinRate);

    // Expected Value (R per trade): EV = p*avgR - (1-p)*1
    const evBase = w * r - (1 - w);
    const evStress = stressWinRate * r - (1 - stressWinRate);

    return {
      // EV
      evBase,
      evStress,

      // Base distribution metrics
      medianFinal: percentile(base.finals, 0.5),
      p10Final: percentile(base.finals, 0.1),
      p90Final: percentile(base.finals, 0.9),

      medianDD: percentile(base.dds, 0.5),
      p90DD: percentile(base.dds, 0.9),

      medianStreak: percentile(base.streaks, 0.5),
      p90Streak: percentile(base.streaks, 0.9),

      blowups: base.blowups,
      psychRuins: base.psychRuins,

      ruinZeroProb: base.ruinZeroProb,
      ruinPsychProb: base.ruinPsychProb,

      // Stress test outputs (survival-only)
      stressWinRate,
      stressRuinZeroProb: stress.ruinZeroProb,
      stressRuinPsychProb: stress.ruinPsychProb,

      // Meta
      sims: nSims,
      nTrades,
      startEquity,
      psychologicalRuinThreshold,
      baseWinRate: w,
      avgR: r,
    };
  }, [accountSize, riskPct, winRate, avgR, trades, sims]);

  const p90Tip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">P90</span> means the <span className="font-semibold">90th percentile</span>.
      </div>
      <div>
        In plain English: about <span className="font-semibold">9 out of 10</span> simulation runs are{" "}
        <span className="font-semibold">better than (or equal to)</span> this number — and{" "}
        <span className="font-semibold">1 out of 10</span> are worse.
      </div>
    </div>
  );

  const survivalTip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">Survival Outlook</span> is computed directly from your Monte Carlo runs over the
        next <span className="font-semibold">{computed?.nTrades ?? "N"}</span> trades.
      </div>
      <div className="text-foreground/70">
        “Practical ruin” here is defined as falling below <span className="font-semibold">30%</span> of starting capital
        (a <span className="font-semibold">70% drawdown</span>).
      </div>
    </div>
  );

  const stressTip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">Confidence Stress Test</span> answers: “What if your win rate is overstated?”
      </div>
      <div className="text-foreground/70">
        We rerun the Monte Carlo assuming win rate is <span className="font-semibold">5 percentage points lower</span>{" "}
        (e.g., 55% → 50%).
      </div>
      <div className="text-foreground/70">This is a robustness check—not a forecast.</div>
    </div>
  );

  const evTip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">Expected Value (EV)</span> is your average outcome per trade in “R” units.
      </div>
      <div className="text-foreground/70">
        Model: <span className="font-semibold">Loss = −1R</span>,{" "}
        <span className="font-semibold">Win = +Avg R</span>.
      </div>
      <div className="text-foreground/70">EV = (Win Rate × Avg R) − (Loss Rate × 1R)</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:space-y-10 sm:px-6 sm:py-16">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Variance Simulator</h1>
          <p className="text-sm text-foreground/70">See drawdowns and losing streaks before they happen.</p>

          <div className="flex flex-wrap gap-3">
            <Link href="/risk-engine" className="oc-btn oc-btn-secondary">
              ← Risk Engine
            </Link>
          </div>

          <div className="inline-flex rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setView("simple")}
              className={`px-4 py-2 text-sm rounded-lg ${
                view === "simple" ? "bg-white text-black" : "text-foreground/85 hover:bg-white/5"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setView("advanced")}
              className={`px-4 py-2 text-sm rounded-lg ${
                view === "advanced" ? "bg-white text-black" : "text-foreground/85 hover:bg-white/5"
              }`}
            >
              Advanced
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Account Size ($)"
            value={accountSize}
            onChange={setAccountSize}
            tip="Your starting account value for the simulation."
          />

          <Input
            label="Risk % per trade"
            value={riskPct}
            onChange={setRiskPct}
            tip={
              <div className="space-y-2">
                <div>
                  Percent of <span className="font-semibold">current equity</span> you risk if the trade hits your stop.
                </div>
                <div>Typical: 0.25%–1% for many retail traders.</div>
              </div>
            }
          />

          <Input
            label="Win Rate (%)"
            value={winRate}
            onChange={setWinRate}
            tip="Estimated probability of a winning trade. If unsure, test 45–55%."
          />

          {view === "advanced" && (
            <>
              <Input
                label="Average Win (R)"
                value={avgR}
                onChange={setAvgR}
                tip={
                  <div className="space-y-2">
                    <div>Losses are modeled as −1R. Winners are +Avg R.</div>
                    <div>If you risk $100 per trade, +1.2R means +$120 on wins.</div>
                  </div>
                }
              />

              <Input
                label="# Trades"
                value={trades}
                onChange={setTrades}
                tip="How many trades to simulate per run (e.g., 50–200)."
              />

              <Input
                label="# Simulations"
                value={sims}
                onChange={setSims}
                tip="Number of Monte Carlo runs. Higher is smoother but slower (300–1000 is solid)."
              />
            </>
          )}
        </section>

        {computed && view === "simple" && (
          <>
            {/* SIMPLE: concise but includes Edge Read + Survival Read */}
            <section className="grid gap-4 sm:grid-cols-3">
              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Realistic Range (P10–P90)
                    <span className="text-foreground/40">•</span>
                    <span className="text-foreground/70">
                      <Tooltip label="P90">{p90Tip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${formatCurrency(computed.p10Final)} – ${formatCurrency(computed.p90Final)}`}
                sub={`Median: ${formatCurrency(computed.medianFinal)}`}
              />

              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Worst Likely Drawdown (P90)
                    <span className="text-foreground/70">
                      <Tooltip label="P90">{p90Tip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${(computed.p90DD * 100).toFixed(1)}%`}
                tone="accent"
                sub="Plan around this."
              />

              <Card
                label="Practical Ruin (70% Drawdown)"
                value={formatPct01(computed.ruinPsychProb, 2)}
                tone={toneFromProbability(computed.ruinPsychProb)}
                sub={`Within ${computed.nTrades} trades.`}
              />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Card
                label={`Practical Ruin (Stress @ ${(computed.stressWinRate * 100).toFixed(0)}% WR)`}
                value={formatPct01(computed.stressRuinPsychProb, 2)}
                tone={toneFromProbability(computed.stressRuinPsychProb)}
                sub="Win rate reduced by 5 pts."
              />

              <Card
                label="Edge Read"
                value={computed.evBase > 0 ? "Positive expectancy" : "Negative expectancy"}
                tone={toneFromEV(computed.evBase)}
                sub={`EV: ${formatR(computed.evBase, 3)} per trade`}
              />

              <Card
                label="Survival Read"
                value="Position sizing drives survival."
                tone={toneFromProbability(Math.max(computed.ruinPsychProb, computed.ruinZeroProb))}
                sub={survivalMessage(computed.ruinPsychProb, computed.ruinZeroProb)}
              />
            </section>
          </>
        )}

        {computed && view === "advanced" && (
          <>
            {/* ADVANCED: full dashboard */}
            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Final Equity" value={formatCurrency(computed.medianFinal)} />
              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Realistic Range (P10–P90)
                    <span className="text-foreground/40">•</span>
                    <span className="text-foreground/70">
                      <Tooltip label="P90">{p90Tip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${formatCurrency(computed.p10Final)} – ${formatCurrency(computed.p90Final)}`}
              />
              <Card label="Blow-ups (Zero)" value={`${computed.blowups} / ${computed.sims}`} />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Drawdown" value={`${(computed.medianDD * 100).toFixed(1)}%`} />
              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Worst Likely Drawdown (P90)
                    <span className="text-foreground/70">
                      <Tooltip label="P90">{p90Tip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${(computed.p90DD * 100).toFixed(1)}%`}
                tone="accent"
                sub="This is the “plan for it” number."
              />
              <Card
                label="Interpretation"
                value={`If you can't tolerate ~${Math.round(computed.p90DD * 100)}% drawdowns, lower risk %.`}
                tone={computed.p90DD >= 0.35 ? "warn" : "neutral"}
              />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Losing Streak" value={`${Math.round(computed.medianStreak)} trades`} />
              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Worst Likely Streak (P90)
                    <span className="text-foreground/70">
                      <Tooltip label="P90">{p90Tip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${Math.round(computed.p90Streak)} trades`}
              />
              <Card label="Reality Check" value="Losing streaks are normal." />
            </section>

            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold tracking-tight">Expectancy</div>
                <div className="text-xs text-foreground/70">
                  <Tooltip label="Expected Value">{evTip}</Tooltip>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card
                  label={`Expected Value (Base @ ${(computed.baseWinRate * 100).toFixed(0)}% WR)`}
                  value={formatR(computed.evBase, 3)}
                  tone={toneFromEV(computed.evBase)}
                  sub="Average R per trade under the assumed win rate."
                />

                <Card
                  label={`Expected Value (Stress @ ${(computed.stressWinRate * 100).toFixed(0)}% WR)`}
                  value={formatR(computed.evStress, 3)}
                  tone={toneFromEV(computed.evStress)}
                  sub="Win rate reduced by 5 percentage points."
                />

                <Card
                  label="Edge Read"
                  value={computed.evBase > 0 ? "Positive expectancy" : "Negative expectancy"}
                  tone={toneFromEV(computed.evBase)}
                  sub={
                    computed.evBase > 0
                      ? "Sizing controls survival; expectancy controls direction."
                      : "If EV is negative, survival depends on luck—not structure."
                  }
                />
              </div>
            </section>

            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold tracking-tight">Survival Outlook</div>
                <div className="text-xs text-foreground/70">
                  <Tooltip label="Survival Outlook">{survivalTip}</Tooltip>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card
                  label="Probability of Account Death (Zero)"
                  value={formatPct01(computed.ruinZeroProb, 2)}
                  tone={toneFromProbability(computed.ruinZeroProb)}
                  sub={`${computed.blowups} / ${computed.sims} runs hit zero within ${computed.nTrades} trades.`}
                />

                <Card
                  label="Probability of Practical Ruin (70% Drawdown)"
                  value={formatPct01(computed.ruinPsychProb, 2)}
                  tone={toneFromProbability(computed.ruinPsychProb)}
                  sub={`Falls below ${formatCurrency(computed.psychologicalRuinThreshold)} within ${computed.nTrades} trades.`}
                />

                <Card
                  label="Survival Read"
                  value="Position sizing drives survival."
                  tone={toneFromProbability(Math.max(computed.ruinPsychProb, computed.ruinZeroProb))}
                  sub={survivalMessage(computed.ruinPsychProb, computed.ruinZeroProb)}
                />
              </div>
            </section>

            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold tracking-tight">Confidence Stress Test</div>
                <div className="text-xs text-foreground/70">
                  <Tooltip label="Confidence Stress Test">{stressTip}</Tooltip>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card
                  label={`Practical Ruin (Base @ ${(computed.baseWinRate * 100).toFixed(0)}% WR)`}
                  value={formatPct01(computed.ruinPsychProb, 2)}
                  tone={toneFromProbability(computed.ruinPsychProb)}
                  sub={`Monte Carlo over ${computed.nTrades} trades.`}
                />

                <Card
                  label={`Practical Ruin (Stress @ ${(computed.stressWinRate * 100).toFixed(0)}% WR)`}
                  value={formatPct01(computed.stressRuinPsychProb, 2)}
                  tone={toneFromProbability(computed.stressRuinPsychProb)}
                  sub="Win rate reduced by 5 percentage points."
                />

                <Card
                  label="Sensitivity"
                  value={formatPctSigned01(computed.stressRuinPsychProb - computed.ruinPsychProb, 2)}
                  tone={toneFromDelta(computed.stressRuinPsychProb - computed.ruinPsychProb)}
                  sub="Increase in practical ruin probability under stress."
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
