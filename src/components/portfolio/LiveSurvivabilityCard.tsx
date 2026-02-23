"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import { useRiskWorker } from "@/lib/risk/useRiskWorker";
import type { VolLevel } from "@/lib/risk/types";

type LiveInputs = {
  riskPerTrade: number; // fraction (0.01)
  winRate: number; // fraction (0.52)
  avgR: number; // 1.15
  volLevel: VolLevel;
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedNumber(target: number, durationMs = 520) {
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

type Bands = {
  p05: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
};

function endWidth(b: Bands | null) {
  if (!b) return null;
  const n = Math.min(b.p05.length, b.p95.length);
  if (n < 2) return null;
  const end = n - 1;
  const w = b.p95[end] - b.p05[end];
  return Number.isFinite(w) ? w : null;
}

function stateFrom(dd50: number, bands: Bands | null) {
  const w = endWidth(bands);
  const width = w ?? 0.7;

  if (dd50 >= 0.55 || width >= 1.0) return { label: "Stress", tone: "stress" as const };
  if (dd50 >= 0.40 || width >= 0.85) return { label: "Accelerated", tone: "warn" as const };
  if (dd50 >= 0.20 || width >= 0.60) return { label: "Recovery-dependent", tone: "neutral" as const };
  return { label: "Stable", tone: "good" as const };
}

export default function LiveSurvivabilityCard({ baseline }: { baseline?: Partial<LiveInputs> }) {
  // V1 placeholder until wired to journal/positions
  const inputs: LiveInputs = {
    riskPerTrade: baseline?.riskPerTrade ?? 0.01,
    winRate: baseline?.winRate ?? 0.52,
    avgR: baseline?.avgR ?? 1.15,
    volLevel: baseline?.volLevel ?? "MED",
  };

  const worker = useRiskWorker();

  // recompute cadence: 2–5 min with jitter
  const [nextInSec, setNextInSec] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const runOnce = () => {
    worker.run({
      riskPerTrade: inputs.riskPerTrade,
      winRate: inputs.winRate,
      avgR: inputs.avgR,
      volLevel: inputs.volLevel,
      paths: 1500,
    });
  };

  const scheduleNext = () => {
    const secs = Math.round(120 + Math.random() * 180); // 120–300s
    setNextInSec(secs);

    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setNextInSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000) as unknown as number;

    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      runOnce();
      scheduleNext();
    }, secs * 1000) as unknown as number;
  };

  useEffect(() => {
    runOnce();
    scheduleNext();

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.riskPerTrade, inputs.winRate, inputs.avgR, inputs.volLevel]);

  const dd50 = worker.result?.dd50Risk ?? 0;
  const horizonTrades = worker.result?.horizonTrades ?? null;
  const bands = (worker.result?.bands as Bands | null) ?? null;

  const animatedPct = useAnimatedNumber(dd50 * 100);
  const st = useMemo(() => stateFrom(dd50, bands), [dd50, bands]);

  const stateClass =
    st.tone === "good"
      ? "border-emerald-700/40 bg-emerald-600/10 text-emerald-200"
      : st.tone === "warn"
      ? "border-amber-700/40 bg-amber-500/10 text-amber-200"
      : st.tone === "stress"
      ? "border-rose-700/40 bg-rose-500/10 text-rose-200"
      : "border-white/10 bg-white/5 text-slate-200";

  const statusText = worker.error ? "Error" : worker.isComputing ? "Updating…" : "Live";

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-black/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-foreground/70">Live survivability</div>
          <div className="mt-1 text-xs text-foreground/50">Based on your current sizing assumptions. Wire to positions next.</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
            {statusText}
          </div>
          <div className="text-[11px] text-foreground/50 tabular-nums">{nextInSec > 0 ? `~${nextInSec}s` : "—"}</div>
        </div>
      </div>

      {!!worker.error && <div className="mt-3 text-xs text-rose-200/90">{worker.error}</div>}

      <div className="mt-5 flex items-baseline gap-3">
        <div className="text-5xl font-semibold tabular-nums text-foreground">{animatedPct.toFixed(1)}%</div>
        <div className="pb-2 text-sm text-foreground/60">to -50%</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${stateClass}`}>
          <Tooltip label="State">
            <div className="space-y-2">
              <div>
                Derived from <span className="font-semibold">DD50 probability</span> and the cone’s <span className="font-semibold">dispersion</span>.
              </div>
              <div className="text-foreground/70">It’s a survivability read — not a market call.</div>
            </div>
          </Tooltip>
          <span className="text-foreground/70">:</span>
          <span className="font-semibold">{st.label}</span>
        </div>

        <div className="rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1 text-foreground/70">
          Volatility: <span className="text-[color:var(--accent)]">{volLabel(inputs.volLevel)}</span>
        </div>

        <div className="rounded-full border border-[color:var(--border)] px-3 py-1 text-foreground/70">
          <Tooltip label="Horizon">Simulation window in trades. Higher volatility and higher risk compress the horizon.</Tooltip>
          <span className="ml-2">{horizonTrades !== null ? `${horizonTrades} trades` : "—"}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-[11px] text-foreground/60">
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]/40 px-3 py-2">
          Risk/trade: <span className="text-foreground/80 tabular-nums">{(inputs.riskPerTrade * 100).toFixed(2)}%</span>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]/40 px-3 py-2">
          Win rate: <span className="text-foreground/80 tabular-nums">{Math.round(inputs.winRate * 100)}%</span>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]/40 px-3 py-2">
          Avg R: <span className="text-foreground/80 tabular-nums">{inputs.avgR.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}