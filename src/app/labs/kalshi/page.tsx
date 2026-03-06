"use client";

// src/app/labs/kalshi/page.tsx
// Oren Capital — SPX Deviation Engine

import * as React from "react";
import { MoverChart } from "@/components/charts/MoverChart";

interface MarketQuote {
  yesBid: number | null;
  yesAsk: number | null;
}

interface DeviationResult {
  pMkt: number | null;
  pModel: number | null;
  rawD: number | null;
  zScore: number | null;
  spread: number | null;
  confidence: number;
  edgePP: number | null;
  edgeZ: number | null;
  label: string;
  sigma: number | null;
  candleCount: number;
}

interface ScoredMarket {
  id: string;
  title: string;
  ticker: string;
  strikeLow: number | null;
  strikeHigh: number | null;
  quote: MarketQuote;
  result: DeviationResult;
  sparkline: Array<{ ts: number; v: number }>;
}

interface DeviationResponse {
  ok: boolean;
  updatedAt: string;
  count: number;
  eventTicker: string;
  spxPrice: number;
  hoursUntilClose: number;
  markets: ScoredMarket[];
  error?: string;
}

const REFRESH_MS = 60_000;

// ── Helpers matching MoversTable patterns ─────────────────────────────────────

function signalBar(label: string): string {
  switch (label) {
    case "Extreme": return "bg-rose-400/60";
    case "High":    return "bg-amber-400/60";
    case "Notable": return "bg-emerald-400/60";
    case "Normal":  return "bg-white/10";
    default:        return "bg-white/10";
  }
}

function signalPill(label: string): string {
  switch (label) {
    case "Extreme":            return "border-rose-400/35 bg-rose-500/10 text-rose-200";
    case "High":               return "border-amber-400/35 bg-amber-500/10 text-amber-200";
    case "Notable":            return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "Normal":             return "border-white/10 bg-white/5 text-white/60";
    case "Wide Spread":        return "border-sky-400/30 bg-sky-500/10 text-sky-200";
    case "Insufficient Data":  return "border-white/10 bg-white/5 text-white/30";
    default:                   return "border-white/10 bg-white/5 text-white/60";
  }
}

function edgeMeta(rawD: number | null) {
  if (rawD == null) return { cls: "text-white/40", arrow: "", text: "—" };
  const pp = (rawD * 100).toFixed(1);
  if (rawD > 0) return { cls: "text-emerald-300", arrow: "▲", text: `+${pp}pp` };
  return { cls: "text-rose-300", arrow: "▼", text: `${pp}pp` };
}

function isExtreme(label: string) {
  return label === "Extreme" || label === "High";
}

function bracketLabel(m: ScoredMarket): string {
  const { strikeLow, strikeHigh } = m;
  if (strikeLow != null && strikeHigh != null)
    return `${strikeLow.toLocaleString()} – ${Math.floor(strikeHigh).toLocaleString()}`;
  if (strikeHigh != null) return `above ${strikeHigh.toLocaleString()}`;
  if (strikeLow != null)  return `below ${strikeLow.toLocaleString()}`;
  return m.title;
}

function SortBtn({
  label, active, dir, onClick,
}: {
  label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        active ? "text-white" : "text-white/40 hover:text-white/70"
      }`}
    >
      {label}
      {active
        ? <span className="text-[10px]">{dir === "desc" ? "▼" : "▲"}</span>
        : <span className="text-[10px] opacity-30">▼</span>
      }
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KalshiDeviationPage() {
  const [data, setData] = React.useState<DeviationResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const [sortKey, setSortKey] = React.useState<"edge" | "spread">("edge");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const loadData = React.useCallback(async () => {
    try {
      const res = await fetch("/api/labs/kalshi/deviation");
      const json: DeviationResponse = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Unknown error");
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  React.useEffect(() => {
    loadData();
    const id = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadData]);

  function toggleSort(key: "edge" | "spread") {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = React.useMemo(() => {
    if (!data) return [];
    return [...data.markets].sort((a, b) => {
      const av = sortKey === "edge"
        ? Math.abs(a.result.edgeZ ?? 0)
        : Math.abs(a.result.spread ?? 0);
      const bv = sortKey === "edge"
        ? Math.abs(b.result.edgeZ ?? 0)
        : Math.abs(b.result.spread ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [data, sortKey, sortDir]);

  // Count signals for summary pills
  const extremeCount = sorted.filter(m => m.result.label === "Extreme").length;
  const highCount    = sorted.filter(m => m.result.label === "High").length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">

      {/* Header — matches movers exactly */}
      <div className="mb-6">
        <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">LABS · SPX DEVIATION</div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          <span className="relative inline-block">
            <span className="relative z-10 text-[color:var(--accent)]">Deviation Engine</span>
            <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
            <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
          </span>
        </h1>
        <p className="mt-4 text-sm text-foreground/60">
          Kalshi implied probability vs. realized-vol digital option model · KXINX daily brackets.
        </p>
      </div>

      {/* Signal summary pills */}
      {data && !loading && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {extremeCount > 0 && (
            <span className="inline-flex rounded-full border border-rose-400/35 bg-rose-500/10 px-3 py-1 text-xs text-rose-200">
              {extremeCount} extreme {extremeCount === 1 ? "signal" : "signals"}
            </span>
          )}
          {highCount > 0 && (
            <span className="inline-flex rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
              {highCount} high {highCount === 1 ? "signal" : "signals"}
            </span>
          )}
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
            {data.count} brackets tracked
          </span>
          {data.spxPrice && (
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
              SPX {data.spxPrice.toLocaleString()}
            </span>
          )}
          {data.hoursUntilClose && (
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
              closes in {data.hoursUntilClose.toFixed(1)}h
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-sm text-white/30 animate-pulse">
          Loading markets…
        </div>
      )}

      {/* Table */}
      {!loading && data && (
        <>
          {/* Sort controls + refresh — matches movers */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SortBtn
                label="Sort by Edge"
                active={sortKey === "edge"}
                dir={sortDir}
                onClick={() => toggleSort("edge")}
              />
              <SortBtn
                label="Sort by Spread"
                active={sortKey === "spread"}
                dir={sortDir}
                onClick={() => toggleSort("spread")}
              />
            </div>
            <div className="text-xs text-white/30">
              refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          {/* MOBILE: cards */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
            {sorted.map((m) => {
              const { result, quote } = m;
              const edge = edgeMeta(result.rawD);
              const extreme = isExtreme(result.label);
              return (
                <div
                  key={m.id}
                  className={`relative overflow-hidden rounded-2xl border p-3 sm:p-4 transition-colors ${
                    extreme ? "border-rose-500/25 bg-rose-500/5" : "border-white/10 bg-black/30"
                  }`}
                >
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${signalBar(result.label)}`} />
                  <div className="pl-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{bracketLabel(m)}</div>
                        <div className="mt-0.5 text-[11px] text-white/30 font-mono">{m.ticker.split("-").slice(-1)[0]}</div>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${signalPill(result.label)}`}>
                        {result.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="text-[10px] text-white/40">Market</div>
                        <div className="mt-0.5 text-sm font-mono text-white/80">
                          {result.pMkt != null ? (result.pMkt * 100).toFixed(1) + "¢" : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="text-[10px] text-white/40">Model</div>
                        <div className="mt-0.5 text-sm font-mono text-white/60">
                          {result.pModel != null ? (result.pModel * 100).toFixed(1) + "¢" : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                        <div className="text-[10px] text-white/40">Edge</div>
                        <div className={`mt-0.5 text-sm font-mono font-medium ${edge.cls}`}>{edge.text}</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <MoverChart
                        data={m.sparkline}
                        height={60}
                        positive={result.rawD == null ? null : result.rawD < 0}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP: table — matches movers structure */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-white/10 bg-black/30">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/50">
                      <th className="px-4 py-3">Bracket</th>
                      <th className="px-4 py-3">Market</th>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3">
                        <SortBtn label="Edge" active={sortKey === "edge"} dir={sortDir} onClick={() => toggleSort("edge")} />
                      </th>
                      <th className="px-4 py-3">
                        <SortBtn label="Spread" active={sortKey === "spread"} dir={sortDir} onClick={() => toggleSort("spread")} />
                      </th>
                      <th className="px-4 py-3">Signal</th>
                      <th className="px-4 py-3">Tape</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => {
                      const { result, quote } = m;
                      const edge = edgeMeta(result.rawD);
                      const extreme = isExtreme(result.label);
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-white/5 transition-colors ${
                            extreme ? "bg-rose-500/5" : "hover:bg-white/[0.02]"
                          }`}
                        >
                          {/* Bracket + left bar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className={`h-5 w-1 rounded-full shrink-0 ${signalBar(result.label)}`} />
                              <div>
                                <div className="text-sm font-medium text-white">{bracketLabel(m)}</div>
                                <div className="text-[11px] text-white/30 font-mono mt-0.5">{m.ticker.split("-").slice(-1)[0]}</div>
                              </div>
                            </div>
                          </td>

                          {/* Market mid */}
                          <td className="px-4 py-3">
                            <div className="text-sm text-white/80 font-mono">
                              {result.pMkt != null ? (result.pMkt * 100).toFixed(1) + "¢" : "—"}
                            </div>
                            {quote.yesBid != null && quote.yesAsk != null && (
                              <div className="text-[11px] text-white/30 font-mono mt-0.5">
                                {quote.yesBid}b / {quote.yesAsk}a
                              </div>
                            )}
                          </td>

                          {/* Model */}
                          <td className="px-4 py-3 text-sm text-white/50 font-mono">
                            {result.pModel != null ? (result.pModel * 100).toFixed(1) + "¢" : "—"}
                          </td>

                          {/* Edge */}
                          <td className="px-4 py-3">
                            <div className={`text-sm font-medium font-mono ${edge.cls}`}>
                              {edge.arrow && <span className="mr-1 text-xs">{edge.arrow}</span>}
                              {edge.text}
                            </div>
                            {result.zScore != null && (
                              <div className="text-[11px] text-white/30 font-mono mt-0.5">
                                {result.zScore.toFixed(2)}σ
                              </div>
                            )}
                          </td>

                          {/* Spread */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${
                              result.spread == null ? "border-white/10 text-white/30" :
                              result.spread <= 5  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
                              result.spread <= 20 ? "border-amber-400/35 bg-amber-500/10 text-amber-200" :
                                                    "border-rose-400/35 bg-rose-500/10 text-rose-200"
                            }`}>
                              {result.spread != null ? `${result.spread}¢` : "—"}
                            </span>
                          </td>

                          {/* Signal */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${signalPill(result.label)}`}>
                              {result.label}
                            </span>
                          </td>

                          {/* Tape */}
                          <td className="px-4 py-3">
                            <div className="w-[160px]">
                              <MoverChart
                                data={m.sparkline}
                                height={44}
                                positive={result.rawD == null ? null : result.rawD < 0}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-4 flex items-center justify-between text-xs text-white/25">
            <span>{data.eventTicker} · SPY×10 model · {data.markets[0]?.result.candleCount ?? 0} candles</span>
            <a
              href="https://kalshi.com/markets/kxinx"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/50 transition-colors text-[color:var(--accent)]/60"
            >
              View on Kalshi →
            </a>
          </div>
        </>
      )}
    </div>
  );
}