"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
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

function Segmented({
  value,
  onChange,
}: {
  value: VolLevel;
  onChange: (v: VolLevel) => void;
}) {
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
                ? "border border-emerald-400/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]"
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
    <div className="oc-glass rounded-xl border border-[color:var(--border)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-foreground/80">
          {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={Number.isFinite(value) ? value : 0}
            inputMode="decimal"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(clamp(n, min, max));
            }}
            className="h-10 w-28 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 text-right text-sm text-foreground outline-none placeholder:text-foreground/30"
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
          className="w-full accent-foreground"
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

function benchText(dd50Risk: number) {
  if (dd50Risk < 0.10) return "Contained relative to typical survivability range.";
  if (dd50Risk < 0.25) return "Elevated relative to typical survivability range.";
  if (dd50Risk < 0.45) return "High relative to typical survivability range.";
  return "Critical relative to typical survivability range.";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    lower.run({
      riskPerTrade: lowerRiskPct / 100,
      winRate: inputs.winRatePct / 100,
      avgR: inputs.avgR,
      volLevel: inputs.volLevel,
      paths: 1500,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowerRiskPct, inputs.winRatePct, inputs.avgR, inputs.volLevel]);

  const dd50Risk = primary.result?.dd50Risk ?? 0;
  const dd50Lower = lower.result?.dd50Risk ?? 0;

  const animatedPct = useAnimatedNumber(dd50Risk * 100);
  const benchmark = useMemo(() => benchText(dd50Risk), [dd50Risk]);

  const horizonTrades = primary.result?.horizonTrades ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs tracking-[0.22em] text-foreground/50">OREN CAPITAL</div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">50% Drawdown Risk</h1>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-foreground/70">
            Probability of hitting <span className="text-foreground">-50% equity</span> before a volatility-adjusted horizon.
          </p>
        </div>
      </div>

      <section className="oc-glass rounded-xl border border-[color:var(--border)] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs tracking-[0.22em] text-foreground/50">RISK</div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="text-5xl font-semibold tabular-nums text-foreground sm:text-6xl">
                {animatedPct.toFixed(1)}%
              </div>
              <div className="pb-2 text-sm text-foreground/60">to -50%</div>
            </div>
            <div className="mt-2 text-sm text-foreground/70">{benchmark}</div>

            {/* Horizon + Volatility row with controlled accent */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-200/90">
                Volatility: <span className="tabular-nums">{volLabel(inputs.volLevel)}</span>
              </div>

              <div className="rounded-full border border-emerald-400/15 bg-[color:var(--card)] px-3 py-1 text-foreground/60">
                <Tooltip label="Horizon">
                  <div className="space-y-2">
                    <div>The simulation window, expressed in trades.</div>
                    <div className="text-foreground/70">
                      Higher volatility compresses the horizon. Higher risk per trade compresses it further.
                    </div>
                    <div className="text-foreground/70">
                      Drawdown risk is measured as: hit -50% equity at any point before this horizon.
                    </div>
                  </div>
                </Tooltip>
                <span className="ml-2">
                  <span className="text-foreground/50">:</span>{" "}
                  <span className="text-foreground/80 tabular-nums">
                    {horizonTrades !== null ? `${horizonTrades} trades` : "—"}
                  </span>
                </span>
              </div>

              <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1 text-foreground/60">
                Paths: <span className="text-foreground/80">1,500</span>
              </div>
            </div>

            {(primary.isComputing || primary.error) && (
              <div className="mt-2 text-xs text-foreground/50">
                {primary.isComputing ? "Recomputing…" : primary.error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs tracking-[0.22em] text-foreground/50">EQUITY CONE</div>
            <div className="text-xs text-foreground/45">
              {primary.result ? "percentile bands ready" : "computing…"}
            </div>
          </div>

          <div className="mt-4 h-[240px] rounded-lg border border-[color:var(--border)] bg-black/10">
            <div className="flex h-full items-center justify-center text-xs text-foreground/45">
              Cone chart renders next (Step 4).
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
        <div className="flex items-center justify-between">
          <div className="text-xs tracking-[0.22em] text-foreground/50">SCENARIO</div>
          <button
            type="button"
            onClick={() =>
              setInputs({
                riskPerTradePct: 1.0,
                winRatePct: 52,
                avgR: 1.15,
                volLevel: "MED",
              })
            }
            className="h-10 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-xs text-foreground/70 hover:text-foreground"
          >
            Reset
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SliderField
            label="Risk per trade"
            value={inputs.riskPerTradePct}
            min={0.1}
            max={5.0}
            step={0.05}
            suffix="%"
            onChange={(v) => setInputs((s) => ({ ...s, riskPerTradePct: clamp(v, 0.1, 5.0) }))}
            tip={<div>Percent of equity at stake per trade. Higher values accelerate drawdown risk nonlinearly.</div>}
          />

          <SliderField
            label="Win rate"
            value={inputs.winRatePct}
            min={20}
            max={80}
            step={1}
            suffix="%"
            onChange={(v) => setInputs((s) => ({ ...s, winRatePct: clamp(v, 20, 80) }))}
            tip={<div>Probability a trade closes positive.</div>}
          />

          <SliderField
            label="Avg R multiple"
            value={inputs.avgR}
            min={0.5}
            max={3.0}
            step={0.05}
            suffix="R"
            onChange={(v) => setInputs((s) => ({ ...s, avgR: clamp(v, 0.5, 3.0) }))}
            tip={<div>Average win size relative to average loss (loss is 1R).</div>}
          />

          <div className="oc-glass rounded-xl border border-[color:var(--border)] p-5">
            <div className="text-sm text-foreground/80">
              <Tooltip label="Volatility level">
                <div className="space-y-2">
                  <div>Controls regime intensity. It compresses or extends the horizon.</div>
                  <div className="text-foreground/70">Higher volatility → shorter horizon → less room to recover.</div>
                </div>
              </Tooltip>
            </div>

            <div className="mt-4">
              <Segmented value={inputs.volLevel} onChange={(v) => setInputs((s) => ({ ...s, volLevel: v }))} />
            </div>

            <div className="mt-3 text-[11px] text-foreground/50">
              Higher volatility → shorter horizon → less room to recover.
            </div>
          </div>
        </div>
      </section>

      <section className="oc-glass rounded-xl border border-[color:var(--border)] p-6">
        <div className="text-xs tracking-[0.22em] text-foreground/50">REDUCE RISK</div>
        <div className="mt-3 text-sm text-foreground/75">
          If you reduce risk per trade to{" "}
          <span className="text-foreground tabular-nums">{lowerRiskPct.toFixed(2)}%</span>, 50% drawdown risk falls to{" "}
          <span className="text-foreground tabular-nums">{(dd50Lower * 100).toFixed(1)}%</span>.
        </div>

        {(lower.isComputing || lower.error) && (
          <div className="mt-2 text-xs text-foreground/50">
            {lower.isComputing ? "Recomputing…" : lower.error}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-foreground">Track this live with your actual positions.</div>
            <div className="mt-1 text-xs text-foreground/55">
              Smoothed updates. Regime state. Recompute cadence. Finished feel.
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href="/portfolio"
              className="h-11 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90"
            >
              Open Dashboard
            </a>
            <a
              href="/pricing"
              className="h-11 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm text-foreground/80 hover:text-foreground"
            >
              Pricing
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}