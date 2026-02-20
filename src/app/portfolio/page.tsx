// src/app/portfolio/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import ProGate from "@/components/ProGate";

type ViewMode = "overview" | "positions" | "exposure";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPct(n: number | null, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function formatMoney(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

type PositionRow = {
  symbol: string;
  side: "Long" | "Short";
  sizeUsd: number;
  riskPct: number; // percent of account at risk (planned)
  stop?: string;
  notes?: string;
};

export default function PortfolioPage() {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;

  const [view, setView] = useState<ViewMode>("overview");

  // Placeholder “portfolio state” (wire to journal + risk engine later)
  const accountValue = 25000;
  const maxRiskPerPositionPct = 1.0;
  const openRiskPct = 2.4;
  const drawdownPct = 4.2;
  const dailyLossPct = 0.6;
  const dailyLossLimitPct = 2.0;

  const disciplineState = useMemo(() => {
    // calm status; no theatrics
    const riskOver = openRiskPct > 4.0;
    const ddOver = drawdownPct > 12.0;
    const dailyOver = dailyLossPct > dailyLossLimitPct;

    if (riskOver || ddOver || dailyOver) return { label: "Outside discipline", tone: "bad" as const };
    if (openRiskPct > 3.0 || drawdownPct > 8.0 || dailyLossPct > 1.5) return { label: "Elevated", tone: "warn" as const };
    return { label: "Within discipline", tone: "good" as const };
  }, [openRiskPct, drawdownPct, dailyLossPct, dailyLossLimitPct]);

  const positions: PositionRow[] = useMemo(
    () => [
      { symbol: "AAPL", side: "Long", sizeUsd: 4200, riskPct: 0.8, stop: "184.20", notes: "Swing; defined stop." },
      { symbol: "NVDA", side: "Long", sizeUsd: 5600, riskPct: 0.9, stop: "742.00", notes: "Volatile; keep size disciplined." },
      { symbol: "SPY", side: "Long", sizeUsd: 3000, riskPct: 0.7, stop: "—", notes: "Core exposure." },
    ],
    []
  );

  const exposureBySymbol = useMemo(() => {
    const total = positions.reduce((a, p) => a + p.sizeUsd, 0) || 1;
    return positions
      .map((p) => ({
        symbol: p.symbol,
        share: p.sizeUsd / total,
      }))
      .sort((a, b) => b.share - a.share);
  }, [positions]);

  const riskBars = useMemo(() => {
    // simple visual: open risk vs a soft cap (4%) and max per position (1%)
    const openRiskSoftCap = 4.0;
    return {
      openRiskFill: clamp01(openRiskPct / openRiskSoftCap),
      dailyLossFill: clamp01(dailyLossPct / dailyLossLimitPct),
    };
  }, [openRiskPct, dailyLossPct, dailyLossLimitPct]);

  return (
    <main className="min-h-screen bg-background text-foreground" style={accentStyle}>
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
              Portfolio • Discipline across markets
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Portfolio</h1>

            <p className="mt-4 max-w-3xl text-lg text-foreground/75">
              A calm view of your risk state: exposure, drawdown, and concentration — built for longevity, not adrenaline.
            </p>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setView("overview")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "overview" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setView("positions")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "positions" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Positions
            </button>
            <button
              type="button"
              onClick={() => setView("exposure")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "exposure" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Exposure
            </button>
          </div>
        </div>

        <ProGate lockTitle="Portfolio is Pro" lockSubtitle="Upgrade to Pro to view portfolio exposure, drawdown context, and discipline metrics.">
          <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
            {/* Risk state */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CardStat label="Account Value" value={formatMoney(accountValue)} />
              <CardStat label="Max Risk / Position" value={formatPct(maxRiskPerPositionPct)} />
              <CardStat label="Open Risk" value={formatPct(openRiskPct)} />
              <CardStat label="Drawdown" value={`-${formatPct(drawdownPct)}`} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-foreground/70">Discipline status</div>
                  <div
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      disciplineState.tone === "good"
                        ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                        : disciplineState.tone === "warn"
                        ? "border-amber-200/20 bg-amber-400/10 text-amber-200"
                        : "border-red-200/20 bg-red-400/10 text-red-200"
                    )}
                  >
                    {disciplineState.label}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <BarRow label="Open risk vs soft cap" value={`${formatPct(openRiskPct)} of 4.0%`} fill={riskBars.openRiskFill} />
                  <BarRow
                    label="Daily loss vs limit"
                    value={`${formatPct(dailyLossPct)} of ${formatPct(dailyLossLimitPct)}`}
                    fill={riskBars.dailyLossFill}
                  />
                </div>

                <div className="mt-4 text-xs text-foreground/55">
                  This page is for awareness and control — not performance bragging.
                </div>
              </div>

              {/* View body */}
              <div className="lg:col-span-2">
                {view === "overview" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Panel
                      title="Variance context"
                      desc="Wire to your variance simulator next. Keep it calm: expected drawdown range, streak expectations, percentile context."
                      lines={[
                        "Expected 30D drawdown range: —",
                        "Current drawdown percentile: —",
                        "Expected losing streak (baseline): —",
                      ]}
                    />
                    <Panel
                      title="Behavioral discipline"
                      desc="Wire to journal signals next: oversizing after wins/losses, % above cap, drift from baseline."
                      lines={[
                        "Avg risk per decision (last 20): —",
                        "Decisions above cap: —",
                        "Size escalation after loss: —",
                      ]}
                    />
                  </div>
                ) : null}

                {view === "positions" ? (
                  <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-black/20">
                    <table className="min-w-[860px] w-full text-[15px]">
                      <thead>
                        <tr className="text-left text-foreground/60">
                          <th className="px-4 py-3 font-medium">Symbol</th>
                          <th className="px-4 py-3 font-medium">Side</th>
                          <th className="px-4 py-3 font-medium">Size</th>
                          <th className="px-4 py-3 font-medium">Risk</th>
                          <th className="px-4 py-3 font-medium">Stop</th>
                          <th className="px-4 py-3 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p) => (
                          <tr key={p.symbol} className="border-t border-[color:var(--border)]">
                            <td className="px-4 py-3 font-medium text-foreground">{p.symbol}</td>
                            <td className="px-4 py-3 text-foreground/80">{p.side}</td>
                            <td className="px-4 py-3 text-foreground/80">{formatMoney(p.sizeUsd)}</td>
                            <td className="px-4 py-3 text-foreground/80">{formatPct(p.riskPct)}</td>
                            <td className="px-4 py-3 text-foreground/80">{p.stop ?? "—"}</td>
                            <td className="px-4 py-3 text-foreground/70">{p.notes ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {view === "exposure" ? (
                  <div className="rounded-xl border border-[color:var(--border)] bg-black/20 p-5">
                    <div className="text-sm font-medium text-foreground">Exposure heat</div>
                    <div className="mt-1 text-sm text-foreground/70">
                      Simple and disciplined: concentration by symbol. (Add sector + correlation later.)
                    </div>

                    <div className="mt-5 space-y-3">
                      {exposureBySymbol.map((x) => (
                        <div key={x.symbol} className="flex items-center gap-3">
                          <div className="w-14 text-sm text-foreground/80">{x.symbol}</div>
                          <div className="flex-1 rounded-full border border-[color:var(--border)] bg-black/20 p-1">
                            <div
                              className="h-2 rounded-full bg-[color:var(--accent)]/80"
                              style={{ width: `${Math.round(x.share * 100)}%` }}
                            />
                          </div>
                          <div className="w-16 text-right text-sm text-foreground/70">
                            {(x.share * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 text-xs text-foreground/55">
                      Next: flag correlated stacking (theme concentration), then unify with sports bankroll exposure.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </ProGate>
      </div>
    </main>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-black/20 p-5">
      <div className="text-sm text-foreground/65">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function BarRow({ label, value, fill }: { label: string; value: string; fill: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-foreground/60">{label}</div>
        <div className="text-xs text-foreground/60 tabular-nums">{value}</div>
      </div>
      <div className="mt-2 rounded-full border border-[color:var(--border)] bg-black/20 p-1">
        <div className="h-2 rounded-full bg-white/25" style={{ width: `${Math.round(fill * 100)}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, desc, lines }: { title: string; desc: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-black/20 p-5">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-sm text-foreground/70">{desc}</div>
      <div className="mt-4 space-y-2 text-sm text-foreground/75">
        {lines.map((l) => (
          <div key={l} className="rounded-lg border border-[color:var(--border)] bg-black/10 px-3 py-2">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}