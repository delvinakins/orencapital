"use client";

// src/app/labs/kalshi/page.tsx
// Oren Capital — Prediction Market Deviation Board

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DeviationResult {
  pMkt: number | null;
  mu: number | null;
  sigma: number | null;
  rawD: number | null;
  zScore: number | null;
  spread: number | null;
  confidence: number;
  edgePP: number | null;
  edgeZ: number | null;
  label: "Extreme" | "High" | "Notable" | "Normal" | "Insufficient Data";
  candleCount: number;
}

interface ScoredMarket {
  id: string;
  source: "kalshi" | "polymarket";
  title: string;
  ticker: string;
  category: string;
  closeTime: string | null;
  url: string;
  quote: {
    yesBid: number | null;
    yesAsk: number | null;
  };
  result: DeviationResult;
  sparkline: Array<{ ts: number; v: number }>;
}

interface BoardResponse {
  ok: boolean;
  updatedAt: string;
  count: number;
  markets: ScoredMarket[];
  cached?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null, decimals = 1, suffix = "") {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}${suffix}`;
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtClose(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Label config ──────────────────────────────────────────────────────────────
const LABEL_CONFIG = {
  Extreme:            { bg: "bg-red-500/20",    border: "border-red-500/40",    text: "text-red-400",    dot: "bg-red-400"    },
  High:               { bg: "bg-amber-500/20",  border: "border-amber-500/40",  text: "text-amber-400",  dot: "bg-amber-400"  },
  Notable:            { bg: "bg-blue-500/20",   border: "border-blue-500/40",   text: "text-blue-400",   dot: "bg-blue-400"   },
  Normal:             { bg: "bg-white/5",        border: "border-white/10",      text: "text-white/40",   dot: "bg-white/30"   },
  "Insufficient Data":{ bg: "bg-white/5",        border: "border-white/10",      text: "text-white/30",   dot: "bg-white/20"   },
} as const;

const SOURCE_CONFIG = {
  kalshi:     { label: "KALSHI",     color: "text-emerald-400",  bg: "bg-emerald-500/10 border-emerald-500/20" },
  polymarket: { label: "POLY",       color: "text-violet-400",   bg: "bg-violet-500/10 border-violet-500/20"  },
} as const;

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, direction }: { data: Array<{ ts: number; v: number }>; direction: number | null }) {
  if (!data.length) {
    return <div className="h-10 w-24 flex items-center justify-center text-white/20 text-xs">no data</div>;
  }
  const color = direction == null ? "#6b7280" : direction > 0 ? "#34d399" : "#f87171";
  return (
    <ResponsiveContainer width={96} height={40}>
      <LineChart data={data}>
        <Line
          type="stepAfter"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, fontSize: 10 }}
          itemStyle={{ color: "#fff" }}
          formatter={(v: number) => [`${v.toFixed(1)}`, "norm"]}
          labelFormatter={() => ""}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/40">{pct}%</span>
    </div>
  );
}

// ── Market row ────────────────────────────────────────────────────────────────
function MarketRow({ m, rank }: { m: ScoredMarket; rank: number }) {
  const cfg = LABEL_CONFIG[m.result.label];
  const src = SOURCE_CONFIG[m.source];
  const isExtreme = m.result.label === "Extreme";
  const isHigh = m.result.label === "High";

  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        group flex items-center gap-4 px-4 py-3 rounded-xl border transition-all duration-150
        hover:bg-white/5 cursor-pointer
        ${isExtreme ? "border-red-500/30 bg-red-500/5" : isHigh ? "border-amber-500/20 bg-amber-500/5" : "border-white/8 bg-white/[0.02]"}
      `}
    >
      {/* Rank */}
      <div className="w-5 text-center text-xs text-white/20 font-mono shrink-0">{rank}</div>

      {/* Accent bar */}
      <div className={`w-0.5 h-8 rounded-full shrink-0 ${cfg.dot}`} />

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{m.title}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${src.bg} ${src.color}`}>
            {src.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-white/35">
          <span className="font-mono">{m.ticker.length > 20 ? m.ticker.slice(0, 20) + "…" : m.ticker}</span>
          <span>expires {fmtClose(m.closeTime)}</span>
        </div>
      </div>

      {/* Probability */}
      <div className="hidden sm:flex flex-col items-end shrink-0 w-20">
        <div className="text-sm font-semibold text-white">
          {fmtPct(m.result.pMkt)}
        </div>
        <div className="text-xs text-white/35">
          μ {fmtPct(m.result.mu)}
        </div>
      </div>

      {/* Edge scores */}
      <div className="hidden md:flex flex-col items-end shrink-0 w-24">
        <div className={`text-sm font-semibold font-mono ${m.result.rawD == null ? "text-white/30" : m.result.rawD > 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(m.result.edgePP, 1, "pp")}
        </div>
        <div className="text-xs text-white/35 font-mono">
          {fmt(m.result.edgeZ, 2, "σ")}
        </div>
      </div>

      {/* Label pill */}
      <div className="hidden sm:flex shrink-0 w-28 justify-end">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {m.result.label}
        </span>
      </div>

      {/* Confidence */}
      <div className="hidden lg:block shrink-0 w-20">
        <ConfidenceBar value={m.result.confidence} />
      </div>

      {/* Sparkline */}
      <div className="shrink-0">
        <Sparkline data={m.sparkline} direction={m.result.rawD} />
      </div>
    </a>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function MarketCard({ m, rank }: { m: ScoredMarket; rank: number }) {
  const cfg = LABEL_CONFIG[m.result.label];
  const src = SOURCE_CONFIG[m.source];

  return (
    <a
      href={m.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-xs text-white/30 font-mono">#{rank}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${src.bg} ${src.color}`}>
              {src.label}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
              {m.result.label}
            </span>
          </div>
          <p className="text-sm font-medium text-white leading-snug line-clamp-2">{m.title}</p>
        </div>
        <Sparkline data={m.sparkline} direction={m.result.rawD} />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-white/35 mb-0.5">Prob</div>
          <div className="text-white font-semibold">{fmtPct(m.result.pMkt)}</div>
        </div>
        <div>
          <div className="text-white/35 mb-0.5">Edge</div>
          <div className={`font-semibold font-mono ${m.result.rawD == null ? "text-white/30" : m.result.rawD > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(m.result.edgePP, 1, "pp")}
          </div>
        </div>
        <div>
          <div className="text-white/35 mb-0.5">Z-score</div>
          <div className="text-white font-mono">{fmt(m.result.edgeZ, 2, "σ")}</div>
        </div>
      </div>
    </a>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
type FilterLabel = "All" | "Extreme" | "High" | "Notable" | "Kalshi" | "Polymarket";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KalshiLabsPage() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterLabel>("All");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/labs/kalshi/deviation");
      const json: BoardResponse = await res.json();
      if (!json.ok) throw new Error("API error");
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const markets = data?.markets ?? [];

  const filtered = markets.filter((m) => {
    if (filter === "Kalshi") return m.source === "kalshi";
    if (filter === "Polymarket") return m.source === "polymarket";
    if (filter === "Extreme") return m.result.label === "Extreme";
    if (filter === "High") return m.result.label === "High";
    if (filter === "Notable") return m.result.label === "Notable";
    return true;
  });

  const extremeCount = markets.filter((m) => m.result.label === "Extreme").length;
  const highCount = markets.filter((m) => m.result.label === "High").length;

  const FILTERS: FilterLabel[] = ["All", "Extreme", "High", "Notable", "Kalshi", "Polymarket"];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Prediction Market Deviation Board
            </h1>
            <p className="mt-1 text-sm text-white/50">
              S&P 500 markets ranked by structural deviation from EWMA baseline · Kalshi + Polymarket
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-xs text-white/35">
            {loading && <span className="animate-pulse text-white/50">refreshing…</span>}
            {lastRefresh && !loading && (
              <span>updated {lastRefresh.toLocaleTimeString()}</span>
            )}
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Summary pills */}
        {!loading && !error && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {extremeCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-medium">
                {extremeCount} extreme signal{extremeCount > 1 ? "s" : ""}
              </span>
            )}
            {highCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium">
                {highCount} high signal{highCount > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">
              {markets.length} markets tracked
            </span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              filter === f
                ? "bg-white/10 border-white/20 text-white"
                : "bg-transparent border-white/8 text-white/40 hover:text-white/60 hover:border-white/15"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Desktop table header */}
      <div className="hidden md:grid grid-cols-[24px_8px_1fr_80px_96px_112px_80px_96px] gap-4 px-4 py-2 text-[11px] font-medium text-white/25 uppercase tracking-wider mb-1">
        <div>#</div>
        <div />
        <div>Market</div>
        <div className="text-right">Prob / μ</div>
        <div className="text-right">Edge / σ</div>
        <div className="text-right">Signal</div>
        <div>Conf</div>
        <div>Tape</div>
      </div>

      {/* Content */}
      {loading && !data && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={load}
            className="mt-3 text-xs text-white/50 hover:text-white underline"
          >
            retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-10 text-center">
          <p className="text-sm text-white/30">No markets match this filter.</p>
        </div>
      )}

      {/* Desktop rows */}
      {!error && filtered.length > 0 && (
        <>
          <div className="hidden sm:flex flex-col gap-1.5">
            {filtered.map((m, i) => (
              <MarketRow key={m.id} m={m} rank={i + 1} />
            ))}
          </div>

          {/* Mobile cards */}
          <div className="flex sm:hidden flex-col gap-2">
            {filtered.map((m, i) => (
              <MarketCard key={m.id} m={m} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="mt-8 pt-4 border-t border-white/8">
        <p className="text-xs text-white/25 mb-2 font-medium uppercase tracking-wider">How to read this</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-white/35">
          <div><span className="text-white/50 font-medium">Prob</span> — current market implied probability</div>
          <div><span className="text-white/50 font-medium">μ</span> — EWMA baseline (recent history)</div>
          <div><span className="text-white/50 font-medium">Edge pp</span> — confidence-weighted deviation in probability points</div>
          <div><span className="text-white/50 font-medium">Z-score</span> — standard deviations from baseline · sorted by |Z|</div>
        </div>
      </div>
    </div>
  );
}