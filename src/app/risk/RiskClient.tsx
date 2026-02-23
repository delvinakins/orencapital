"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import EquityCone from "@/components/risk/EquityCone";
import type { VolLevel } from "@/lib/risk/types";
import { useRiskWorker } from "@/lib/risk/useRiskWorker";

type Inputs = {
  riskPerTradePct: number;
  winRatePct: number;
  avgR: number;
  volLevel: VolLevel;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedNumber(target: number, durationMs = 420) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = display;
    const to = target;
    if (!Number.isFinite(to)) return;

    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}

function volLabel(v: VolLevel) {
  return v === "LOW" ? "Low" : v === "MED" ? "Med" : v === "HIGH" ? "High" : "Extreme";
}

function Segmented({ value, onChange }: { value: VolLevel; onChange: (v: VolLevel) => void }) {
  const opts: { value: VolLevel; label: string }[] = [
    { value: "LOW", label: "Low" },
    { value: "MED", label: "Med" },
    { value: "HIGH", label: "High" },
    { value: "EXTREME", label: "Extreme" },
  ];

  return (
    <div className="grid grid-cols-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
      {opts.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              "rounded-lg px-3 py-2 text-xs transition",
              active
                ? [
                    "border border-[color:var(--accent)]",
                    "bg-[color:var(--accent)]/15",
                    "text-[color:var(--accent)]",
                    "shadow-[0_0_0_2px_var(--accent-glow)]",
                  ].join(" ")
                : "text-foreground/70 hover:bg-black/20",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SliderField({
  label,
  tip,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  tip?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const decimals = step < 1 ? (step < 0.1 ? 2 : 1) : 0;

  return (
    <div className="oc-glass rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-foreground/80">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</div>

        <div className="flex items-center gap-2">
          <input
            value={Number.isFinite(value) ? value : 0}
            inputMode="decimal"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(clamp(n, min, max));
            }}
            className="h-10 w-28 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 text-right text-sm text-foreground outline-none"
          />
          <div className="text-xs text-foreground/60">{suffix ?? ""}</div>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
        />
        <div className="mt-2 flex justify-between text-[11px] text-foreground/50">
          <span>
            {min}
            {suffix ?? ""}
          </span>
          <span className="tabular-nums text-foreground/70">
            {value.toFixed(decimals)}
            {suffix ?? ""}
          </span>
          <span>
            {max}
            {suffix ?? ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function benchLine(dd50: number) {
  // One line, terminal-like. No judgement words.
  if (dd50 < 0.10) return "Survivability profile: stable.";
  if (dd50 < 0.25) return "Survivability profile: elevated drawdown risk.";
  if (dd50 < 0.45) return "Survivability profile: high drawdown risk.";
  return "Survivability profile: critical drawdown risk.";
}

function benchExplain(dd50: number) {
  // Short explanation line for retail users without being condescending.
  if (dd50 < 0.10) return "Drawdowns are less likely to compound before the horizon.";
  if (dd50 < 0.25) return "Outcome sequencing starts to matter. A bad streak can dominate the edge.";
  if (dd50 < 0.45) return "Sequence risk dominates. Recovery becomes path-dependent.";
  return "Most plausible paths hit deep stress before the horizon.";
}

export default function RiskClient() {
  const [inputs, setInputs] = useState<Inputs>({
    riskPerTradePct: 1.0,
    winRatePct: 52,
    avgR: 1.15,
    volLevel: "MED",
  });

  const [debounced, setDebounced] = useState(inputs);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(inputs), 160);
    return () => clearTimeout(t);
  }, [inputs]);

  const lowerRiskPct = useMemo(
    () => clamp(inputs.riskPerTradePct * 0.7, 0.1, inputs.riskPerTradePct),
    [inputs.riskPerTradePct]
  );

  const primary = useRiskWorker();
  const lower = useRiskWorker();

  useEffect(() => {
    primary.run({
      riskPerTrade: debounced.riskPerTradePct / 100,
      winRate: debounced.winRatePct / 100,
      avgR: debounced.avgR,
      volLevel: debounced.volLevel,
      paths: 1500,
    });
  }, [debounced]);

  useEffect(() => {
    lower.run({
      riskPerTrade: lowerRiskPct / 100,
      winRate: inputs.winRatePct / 100,
      avgR: inputs.avgR,
      volLevel: inputs.volLevel,
      paths: 1500,
    });
  }, [lowerRiskPct, inputs.winRatePct, inputs.avgR, inputs.volLevel]);

  const dd50Risk = primary.result?.dd50Risk ?? 0;
  const dd50Lower = lower.result?.dd50Risk ?? 0;

  const animatedPct = useAnimatedNumber(dd50Risk * 100);
  const horizonTrades = primary.result?.horizonTrades ?? null;

  const line1 = useMemo(() => benchLine(dd50Risk), [dd50Risk]);
  const line2 = useMemo(() => benchExplain(dd50Risk), [dd50Risk]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8 sm:space-y-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">50% Drawdown Risk</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Probability of hitting <span className="text-foreground">-50% equity</span> before a volatility-adjusted horizon.
          </p>
        </header>

        <section className="oc-glass rounded-2xl p-6 space-y-5">
          <div className="text-xs tracking-[0.22em] text-foreground/50">RISK</div>

          <div className="flex items-baseline gap-4">
            <div className="text-6xl sm:text-7xl font-semibold tabular-nums">{animatedPct.toFixed(1)}%</div>
            <div className="pb-3 text-sm text-foreground/60">to -50%</div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-foreground/80">{line1}</div>
            <div className="text-sm text-foreground/60">{line2}</div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1">
              Volatility: <span className="text-[color:var(--accent)]">{volLabel(inputs.volLevel)}</span>
            </div>

            <div className="rounded-full border border-[color:var(--border)] px-3 py-1">
              <Tooltip label="Horizon">
                Simulation window in trades. Higher volatility and higher risk compress the horizon.
              </Tooltip>
              <span className="ml-2">{horizonTrades !== null ? `${horizonTrades} trades` : "—"}</span>
            </div>

            <div className="rounded-full border border-[color:var(--border)] px-3 py-1">Paths: 1,500</div>
          </div>

          <EquityCone bands={primary.result?.bands ?? null} height={240} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <SliderField
            label="Risk per trade"
            tip="Position sizing as a fraction of equity per trade. This drives compounding and drawdown speed."
            value={inputs.riskPerTradePct}
            min={0.1}
            max={5}
            step={0.05}
            suffix="%"
            onChange={(v) => setInputs((s) => ({ ...s, riskPerTradePct: clamp(v, 0.1, 5) }))}
          />

          <SliderField
            label="Win rate"
            tip="Your expected hit rate over the next horizon — not lifetime marketing stats."
            value={inputs.winRatePct}
            min={20}
            max={80}
            step={1}
            suffix="%"
            onChange={(v) => setInputs((s) => ({ ...s, winRatePct: clamp(v, 20, 80) }))}
          />

          <SliderField
            label="Avg R multiple"
            tip="Average win in units of risk (R). Example: 1.5R means wins average 1.5× your loss size."
            value={inputs.avgR}
            min={0.5}
            max={3}
            step={0.05}
            suffix="R"
            onChange={(v) => setInputs((s) => ({ ...s, avgR: clamp(v, 0.5, 3) }))}
          />

          <div className="oc-glass rounded-xl p-5">
            <div className="text-sm text-foreground/80 mb-4">Volatility level</div>
            <Segmented value={inputs.volLevel} onChange={(v) => setInputs((s) => ({ ...s, volLevel: v }))} />
          </div>
        </section>

        <section className="oc-glass rounded-xl p-5">
          <div className="text-xs tracking-[0.22em] text-foreground/50">REDUCE RISK</div>
          <div className="mt-3 text-sm text-foreground/75">
            Reduce risk to <span className="tabular-nums">{lowerRiskPct.toFixed(2)}%</span> → DD50 becomes{" "}
            <span className="tabular-nums">{(dd50Lower * 100).toFixed(1)}%</span>.
          </div>
        </section>

        <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 flex justify-between items-center">
          <div>
            <div className="text-sm">Track this live with your actual positions.</div>
            <div className="text-xs text-foreground/55 mt-1">Smoothed updates. Regime state. Recompute cadence.</div>
          </div>
          <a href="/portfolio" className="oc-btn oc-btn-primary">
            Open Dashboard
          </a>
        </section>
      </div>
    </main>
  );
}