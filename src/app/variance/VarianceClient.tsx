"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!open) return;
      const el = tipRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;

    box.style.transform = "translateX(-50%)";
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;

      let dx = 0;
      if (r.left < pad) dx = pad - r.left;
      if (r.right > vw - pad) dx = vw - pad - r.right;

      if (dx !== 0) box.style.transform = `translateX(calc(-50% + ${dx}px))`;
    });
  }, [open]);

  return (
    <span className="inline-flex items-center gap-2" ref={tipRef}>
      <span>{label}</span>

      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={`Help: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] text-[11px] text-foreground/90 active:scale-[0.98]"
        >
          i
        </button>

        {open && (
          <div
            ref={boxRef}
            role="dialog"
            aria-label={`${label} help`}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1/2 top-[140%] z-20 w-[min(360px,85vw)] -translate-x-1/2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs text-foreground/90 shadow-2xl shadow-black/40"
          >
            {children}
            <div className="mt-2 text-[11px] text-foreground/60">Tap outside to close</div>
          </div>
        )}
      </span>
    </span>
  );
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
  tip?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none"
      />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
      <div className="text-xs text-foreground/60">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
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

    const finals = results.map((r) => r.finalEquity).sort((a, b) => a - b);
    const dds = results.map((r) => r.maxDD).sort((a, b) => a - b);
    const streaks = results.map((r) => r.longestL).sort((a, b) => a - b);

    return {
      medianFinal: percentile(finals, 0.5),
      p10Final: percentile(finals, 0.1),
      p90Final: percentile(finals, 0.9),
      medianDD: percentile(dds, 0.5),
      p90DD: percentile(dds, 0.9),
      medianStreak: percentile(streaks, 0.5),
      p90Streak: percentile(streaks, 0.9),
      blowups: results.filter((r) => r.finalEquity <= 0).length,
      sims: nSims,
    };
  }, [accountSize, riskPct, winRate, avgR, trades, sims]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16 space-y-8 sm:space-y-10">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold">Variance Simulator</h1>
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
          <Input label="Account Size ($)" value={accountSize} onChange={setAccountSize} tip="Your starting account value for the simulation." />
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
          <Input label="Win Rate (%)" value={winRate} onChange={setWinRate} tip="Estimated probability of a winning trade. If unsure, test 45–55%." />

          {view === "advanced" && (
            <>
              <Input
                label="Average Win (R)"
                value={avgR}
                onChange={setAvgR}
                tip={
                  <div className="space-y-2">
                    <div>
                      “R” is your risk unit. If you risk $100 per trade, a +1.2R win averages +$120.
                    </div>
                    <div>Lower win-rate strategies often rely on higher R.</div>
                  </div>
                }
              />
              <Input label="# Trades" value={trades} onChange={setTrades} tip="How many trades to simulate per run (e.g., 50–200)." />
              <Input label="# Simulations" value={sims} onChange={setSims} tip="Number of Monte Carlo runs. Higher is smoother but slower (300–1000 is solid)." />
            </>
          )}
        </section>

        {computed && (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Final Equity" value={formatCurrency(computed.medianFinal)} />
              <Card label="Realistic Range (P10–P90)" value={`${formatCurrency(computed.p10Final)} – ${formatCurrency(computed.p90Final)}`} />
              <Card label="Blow-ups" value={`${computed.blowups} / ${computed.sims}`} />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Drawdown" value={`${(computed.medianDD * 100).toFixed(1)}%`} />
              <Card label="Worst Likely Drawdown (P90)" value={`${(computed.p90DD * 100).toFixed(1)}%`} />
              <Card label="Interpretation" value={`If you can't tolerate ~${Math.round(computed.p90DD * 100)}% drawdowns, lower risk %.`} />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Card label="Median Losing Streak" value={`${Math.round(computed.medianStreak)} trades`} />
              <Card label="Worst Likely Streak (P90)" value={`${Math.round(computed.p90Streak)} trades`} />
              <Card label="Reality Check" value="Losing streaks are normal." />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
