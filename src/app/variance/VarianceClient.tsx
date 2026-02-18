"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { calculateRiskOfRuin } from "./utils/riskOfRuin";

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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

    const results: { finalEquity: number; maxDD: number; longestL: number }[] = [];

    for (let s = 0; s < nSims; s++) {
      let equity = acc0;
      const outcomes: boolean[] = [];
      const path = [equity];

      for (let i = 0; i < nTrades; i++) {
        const isWin = Math.random() < w;
        outcomes.push(isWin);

        const riskDollars = equity * rPct;
        if (isWin) equity += riskDollars * r;
        else equity -= riskDollars;

        equity = Math.max(0, equity);
        path.push(equity);
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

    const riskOfRuin = calculateRiskOfRuin(w, rPct);

    return {
      medianFinal: percentile(finals, 0.5),
      p10Final: percentile(finals, 0.1),
      p90Final: percentile(finals, 0.9),
      medianDD: percentile(dds, 0.5),
      p90DD: percentile(dds, 0.9),
      medianStreak: percentile(streaks, 0.5),
      p90Streak: percentile(streaks, 0.9),
      blowups: results.filter((rr) => rr.finalEquity <= 0).length,
      sims: nSims,
      riskOfRuin,
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

  const rorTip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">Risk of Ruin</span> estimates the probability your bankroll eventually hits zero
        under your current sizing + edge assumptions.
      </div>
      <div>
        It’s a simplified approximation — use it to compare scenarios (e.g. 1% risk vs 0.5% risk), not as certainty.
      </div>
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
              className={`rounded-lg px-4 py-2 text-sm ${
                view === "simple" ? "bg-white text-black" : "text-foreground/85 hover:bg-white/5"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setView("advanced")}
              className={`rounded-lg px-4 py-2 text-sm ${
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
                    <div>“R” is your risk unit. If you risk $100 per trade, a +1.2R win averages +$120.</div>
                    <div>Lower win-rate strategies often rely on higher R.</div>
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

        {computed && (
          <>
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
              <Card label="Blow-ups" value={`${computed.blowups} / ${computed.sims}`} />
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

            <section className="grid gap-4 sm:grid-cols-3">
              <Card
                label={
                  <span className="inline-flex items-center gap-2">
                    Risk of Ruin (Approx.)
                    <span className="text-foreground/70">
                      <Tooltip label="Risk of Ruin">{rorTip}</Tooltip>
                    </span>
                  </span>
                }
                value={`${(computed.riskOfRuin * 100).toFixed(2)}%`}
                tone={computed.riskOfRuin >= 0.25 ? "warn" : "accent"}
                sub={
                  computed.riskOfRuin >= 0.25
                    ? "High. Consider lowering risk % per trade."
                    : "Lower is better. Compare scenarios by adjusting risk %."
                }
              />
              <Card
                label="Interpretation"
                value={
                  computed.riskOfRuin >= 0.5
                    ? "This sizing is extremely aggressive."
                    : computed.riskOfRuin >= 0.25
                      ? "Aggressive sizing — small edge can still blow you up."
                      : "Reasonable sizing, assuming your win-rate estimate is real."
                }
                tone={computed.riskOfRuin >= 0.25 ? "warn" : "neutral"}
              />
              <Card
                label="Quick Fix"
                value={
                  computed.riskOfRuin >= 0.25
                    ? "Try cutting risk per trade in half and re-check RoR."
                    : "Test a worse win-rate (e.g. -5%) to see robustness."
                }
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
