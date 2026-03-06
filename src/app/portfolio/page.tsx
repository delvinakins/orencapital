// src/app/portfolio/page.tsx
"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import ProGate from "@/components/ProGate";
import LiveSurvivabilityCard from "@/components/portfolio/LiveSurvivabilityCard";

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

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

type PortfolioRow = {
  id: string;
  name: string;
  updated_at?: string;
  created_at?: string;
  data?: any;
};

type Side = "long" | "short";

type Position = {
  id?: string;
  label?: string;
  side?: Side;
  entry?: string;
  stop?: string;
  qty?: string;
  multiplier?: string;
};

type SavedPortfolioPayload = {
  accountSize?: string | number;
  sizingMode?: "constant-fraction" | "fixed-dollar" | string;
  riskPct?: string | number;
  fixedRisk?: string | number;
  positions?: Position[];
};

function pickMostRecent(items: PortfolioRow[]) {
  const ts = (x: PortfolioRow) => {
    const t = x.updated_at || x.created_at || "";
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
  };
  return [...items].sort((a, b) => ts(b) - ts(a))[0] ?? null;
}

function calcDollarRisk(p: Position) {
  const entry = toNum(p.entry) ?? 0;
  const stop = toNum(p.stop) ?? 0;
  const qty = Math.max(0, toNum(p.qty) ?? 0);
  const mult = Math.max(1, toNum(p.multiplier) ?? 1);
  const perUnit = Math.abs(entry - stop);
  return perUnit * qty * mult;
}

function calcNotionalUsd(p: Position) {
  const entry = toNum(p.entry) ?? 0;
  const qty = Math.max(0, toNum(p.qty) ?? 0);
  const mult = Math.max(1, toNum(p.multiplier) ?? 1);
  return entry * qty * mult;
}

export default function PortfolioPage() {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;

  const [view, setView] = useState<ViewMode>("overview");

  const [loading, setLoading] = useState(true);
  const [sourceName, setSourceName] = useState<string>("");
  const [srcError, setSrcError] = useState<string>("");
  const [payload, setPayload] = useState<SavedPortfolioPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      try {
        setLoading(true);
        setSrcError("");

        const listRes = await fetch("/api/portfolios/list", { cache: "no-store" });
        const listJson = await listRes.json().catch(() => ({}));

        if (listRes.status === 402) {
          if (!cancelled) setSrcError("Pro required to load portfolio data.");
          return;
        }

        if (!listRes.ok) {
          if (!cancelled) setSrcError(listJson?.error || "Could not load portfolios.");
          return;
        }

        const items = (listJson?.items ?? []) as PortfolioRow[];
        const latest = pickMostRecent(items);

        if (!latest?.id) {
          if (!cancelled) setSrcError("No saved Position Risk portfolio found. Save one in Position Risk first.");
          return;
        }

        const getRes = await fetch(`/api/portfolios/get?id=${encodeURIComponent(latest.id)}`, { cache: "no-store" });
        const getJson = await getRes.json().catch(() => ({}));

        if (getRes.status === 402) {
          if (!cancelled) setSrcError("Pro required to load portfolio data.");
          return;
        }

        if (!getRes.ok) {
          if (!cancelled) setSrcError(getJson?.error || "Could not load latest portfolio.");
          return;
        }

        const data = getJson?.item?.data || getJson?.item || null;
        const p = data?.data ? (data.data as SavedPortfolioPayload) : (data as SavedPortfolioPayload);

        if (!cancelled) {
          setSourceName(latest.name || "Latest portfolio");
          setPayload(p ?? null);
        }
      } catch {
        if (!cancelled) setSrcError("Could not load portfolio data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLatest();
    return () => { cancelled = true; };
  }, []);

  const derived = useMemo(() => {
    const accountValue = toNum(payload?.accountSize) ?? null;
    const sizingMode = String(payload?.sizingMode ?? "");
    const riskPct = toNum(payload?.riskPct);
    const fixedRisk = toNum(payload?.fixedRisk);
    const positions = Array.isArray(payload?.positions) ? payload!.positions! : [];

    let maxRiskPerPositionPct: number | null = null;
    if (sizingMode === "constant-fraction") {
      maxRiskPerPositionPct = riskPct != null ? riskPct : null;
    } else if (sizingMode === "fixed-dollar") {
      if (fixedRisk != null && accountValue && accountValue > 0) {
        maxRiskPerPositionPct = (fixedRisk / accountValue) * 100;
      }
    }

    const rows = positions.map((p) => {
      const dollarRisk = calcDollarRisk(p);
      const notionalUsd = calcNotionalUsd(p);
      const riskPctPos = accountValue && accountValue > 0 ? (dollarRisk / accountValue) * 100 : null;

      return {
        symbol: (p.label || "").trim() || "—",
        side: (p.side || "long") === "short" ? ("Short" as const) : ("Long" as const),
        sizeUsd: notionalUsd,
        riskPct: riskPctPos,
        stop: (p.stop || "").trim() || "—",
        notes: "",
        dollarRisk,
      };
    });

    const openRiskPct =
      accountValue && accountValue > 0
        ? (rows.reduce((s, r) => s + (Number.isFinite(r.dollarRisk) ? r.dollarRisk : 0), 0) / accountValue) * 100
        : null;

    const drawdownPct: number | null = null;
    const dailyLossPct: number | null = null;
    const dailyLossLimitPct: number | null = null;

    return { accountValue, maxRiskPerPositionPct, openRiskPct, drawdownPct, dailyLossPct, dailyLossLimitPct, positions: rows };
  }, [payload]);

  const disciplineState = useMemo(() => {
    const openRisk = derived.openRiskPct;
    const dd = derived.drawdownPct;
    const daily = derived.dailyLossPct;
    const dailyLimit = derived.dailyLossLimitPct;

    if (openRisk == null) return { label: "Unavailable", tone: "neutral" as const };

    const riskOver = openRisk > 4.0;
    const ddOver = dd != null ? dd > 12.0 : false;
    const dailyOver = daily != null && dailyLimit != null ? daily > dailyLimit : false;

    if (riskOver || ddOver || dailyOver) return { label: "Outside discipline", tone: "bad" as const };
    if (openRisk > 3.0 || (dd != null && dd > 8.0) || (daily != null && daily > 1.5)) return { label: "Elevated", tone: "warn" as const };
    return { label: "Within discipline", tone: "good" as const };
  }, [derived.openRiskPct, derived.drawdownPct, derived.dailyLossPct, derived.dailyLossLimitPct]);

  const exposureBySymbol = useMemo(() => {
    const positions = derived.positions;
    const total = positions.reduce((a, p) => a + (Number.isFinite(p.sizeUsd) ? p.sizeUsd : 0), 0) || 1;
    return positions
      .map((p) => ({ symbol: p.symbol, share: (Number.isFinite(p.sizeUsd) ? p.sizeUsd : 0) / total }))
      .sort((a, b) => b.share - a.share);
  }, [derived.positions]);

  const riskBars = useMemo(() => {
    const open = derived.openRiskPct ?? null;
    const daily = derived.dailyLossPct;
    const dailyLimit = derived.dailyLossLimitPct;

    return {
      openRiskFill: open == null ? 0 : clamp01(open / 4.0),
      dailyLossFill: daily != null && dailyLimit != null ? clamp01(daily / dailyLimit) : 0,
      showDaily: daily != null && dailyLimit != null,
    };
  }, [derived.openRiskPct, derived.dailyLossPct, derived.dailyLossLimitPct]);

  return (
    <main className="min-h-screen bg-background text-foreground" style={accentStyle}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 py-16">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">PORTFOLIO</div>
            <h1 className="text-4xl font-semibold tracking-tight">Portfolio</h1>
            <p className="mt-3 max-w-2xl text-base text-foreground/65">
              Exposure, drawdown, and concentration — built for longevity.
            </p>
            <div className="mt-2 text-xs text-foreground/40">
              Source:{" "}
              <span className="text-foreground/60">
                {loading ? "Loading…" : srcError ? "—" : sourceName || "Latest portfolio"}
              </span>
            </div>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            {(["overview", "positions", "exposure"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition capitalize",
                  view === v ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <ProGate
          lockTitle="Portfolio is Pro"
          lockSubtitle="Upgrade to Pro to view portfolio exposure, drawdown context, and discipline metrics."
        >
          {srcError && (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 text-sm text-foreground/70">
              {srcError}
            </div>
          )}

          <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CardStat label="Account Value"       value={formatMoney(derived.accountValue)} />
              <CardStat label="Max Risk / Position"  value={formatPct(derived.maxRiskPerPositionPct)} />
              <CardStat label="Open Risk"            value={formatPct(derived.openRiskPct)} />
              <CardStat label="Drawdown"             value={derived.drawdownPct == null ? "—" : `-${formatPct(derived.drawdownPct)}`} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {/* Discipline panel */}
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-foreground/70">Discipline status</div>
                  <div className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    disciplineState.tone === "good"    ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]" :
                    disciplineState.tone === "warn"    ? "border-amber-200/20 bg-amber-400/10 text-amber-200" :
                    disciplineState.tone === "bad"     ? "border-red-200/20 bg-red-400/10 text-red-200" :
                                                         "border-white/10 bg-white/5 text-slate-200"
                  )}>
                    {disciplineState.label}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <BarRow
                    label="Open risk vs soft cap"
                    value={derived.openRiskPct == null ? "—" : `${formatPct(derived.openRiskPct)} of 4.0%`}
                    fill={riskBars.openRiskFill}
                    muted={derived.openRiskPct == null}
                  />
                  {riskBars.showDaily ? (
                    <BarRow
                      label="Daily loss vs limit"
                      value={`${formatPct(derived.dailyLossPct)} of ${formatPct(derived.dailyLossLimitPct)}`}
                      fill={riskBars.dailyLossFill}
                      muted={false}
                    />
                  ) : (
                    <div className="text-xs text-foreground/40">Daily loss tracking coming soon.</div>
                  )}
                </div>
              </div>

              {/* View body */}
              <div className="lg:col-span-2 space-y-4">
                <LiveSurvivabilityCard />

                {view === "overview" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Panel title="Variance context" lines={["Expected 30D drawdown range: —", "Current drawdown percentile: —", "Expected losing streak (baseline): —"]} />
                    <Panel title="Behavioral discipline" lines={["Avg risk per decision (last 20): —", "Decisions above cap: —", "Size escalation after loss: —"]} />
                  </div>
                )}

                {view === "positions" && (
                  <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
                    <table className="min-w-[860px] w-full text-[15px]">
                      <thead>
                        <tr className="text-left text-foreground/50 border-b border-[color:var(--border)]">
                          {["Symbol", "Side", "Notional", "Risk", "Stop", "Notes"].map((h) => (
                            <th key={h} className="px-4 py-3 font-medium text-xs tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {derived.positions.length === 0 ? (
                          <tr>
                            <td className="px-4 py-4 text-sm text-foreground/50" colSpan={6}>
                              No positions found. Save a portfolio in Position Risk first.
                            </td>
                          </tr>
                        ) : (
                          derived.positions.map((p, idx) => (
                            <tr key={`${p.symbol}-${idx}`} className="border-t border-[color:var(--border)]">
                              <td className="px-4 py-3 font-medium text-foreground">{p.symbol}</td>
                              <td className="px-4 py-3 text-foreground/70">{p.side}</td>
                              <td className="px-4 py-3 text-foreground/70">{formatMoney(p.sizeUsd)}</td>
                              <td className="px-4 py-3 text-foreground/70">{formatPct(p.riskPct)}</td>
                              <td className="px-4 py-3 text-foreground/70">{p.stop ?? "—"}</td>
                              <td className="px-4 py-3 text-foreground/50">{p.notes ?? "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {view === "exposure" && (
                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
                    <div className="text-sm font-medium text-foreground mb-1">Exposure heat</div>
                    <div className="text-xs text-foreground/50 mb-5">Concentration by symbol.</div>
                    <div className="space-y-3">
                      {exposureBySymbol.length === 0 ? (
                        <div className="text-sm text-foreground/50">—</div>
                      ) : (
                        exposureBySymbol.map((x) => (
                          <div key={x.symbol} className="flex items-center gap-3">
                            <div className="w-14 text-sm text-foreground/70">{x.symbol}</div>
                            <div className="flex-1 rounded-full border border-[color:var(--border)] bg-[color:var(--background)] p-1">
                              <div className="h-2 rounded-full bg-[color:var(--accent)]/80" style={{ width: `${Math.round(x.share * 100)}%` }} />
                            </div>
                            <div className="w-16 text-right text-sm text-foreground/60">{(x.share * 100).toFixed(0)}%</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
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
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <div className="text-xs text-foreground/50 mb-2">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BarRow({ label, value, fill, muted }: { label: string; value: string; fill: number; muted: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs text-foreground/50">{label}</div>
        <div className={cn("text-xs tabular-nums", muted ? "text-foreground/30" : "text-foreground/50")}>{value}</div>
      </div>
      <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--background)] p-1">
        <div className="h-2 rounded-full bg-[color:var(--accent)]/80" style={{ width: `${Math.round(fill * 100)}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
      <div className="text-sm font-medium text-foreground mb-4">{title}</div>
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l} className="flex items-center justify-between gap-3 text-sm text-foreground/50">
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}