"use client";

// src/app/labs/deviation/page.tsx
// Oren Capital — SPX Deviation Engine

import { useEffect, useState, useCallback } from "react";

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
  cached?: boolean;
  error?: string;
}

const REFRESH_MS = 60_000;

function Sparkline({ data }: { data: Array<{ ts: number; v: number }> }) {
  if (!data || data.length < 2) return null;
  const W = 72, H = 24;
  const xs = data.map((_, i) => (i / (data.length - 1)) * W);
  const ys = data.map((d) => H - (d.v / 100) * H);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const last = data[data.length - 1].v;
  const stroke = last >= 50 ? "var(--accent)" : "#f87171";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

const LABEL_STYLES: Record<string, { dot: string; text: string }> = {
  Extreme:             { dot: "#ef4444", text: "#fca5a5" },
  High:                { dot: "#f97316", text: "#fdba74" },
  Notable:             { dot: "#eab308", text: "#fde047" },
  Normal:              { dot: "#3f4840", text: "#6b7c72" },
  "Wide Spread":       { dot: "#2bcb77", text: "#86efac" },
  "Insufficient Data": { dot: "#1b2320", text: "#3f4840" },
};

function SignalDot({ label }: { label: string }) {
  const s = LABEL_STYLES[label] ?? LABEL_STYLES["Normal"];
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
      <span className="text-xs font-mono" style={{ color: s.text }}>{label}</span>
    </div>
  );
}

function EdgeCell({ rawD, zScore }: { rawD: number | null; zScore: number | null }) {
  if (rawD == null) return <span className="text-xs font-mono" style={{ color: "#3f4840" }}>—</span>;
  const pp = (rawD * 100).toFixed(1);
  const pos = rawD > 0;
  const color = pos ? "var(--accent)" : "#f87171";
  return (
    <div>
      <span className="text-sm font-mono font-medium" style={{ color }}>
        {pos ? "+" : ""}{pp}pp
      </span>
      {zScore != null && (
        <div className="text-xs font-mono mt-0.5" style={{ color: "#3f4840" }}>
          z = {zScore.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function SpreadCell({ spread }: { spread: number | null }) {
  if (spread == null) return <span className="text-xs font-mono" style={{ color: "#3f4840" }}>—</span>;
  const color = spread <= 10 ? "var(--accent)" : spread <= 25 ? "#eab308" : "#f87171";
  const pct = Math.min(100, (spread / 50) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color: "rgba(231,235,232,0.45)" }}>{spread}¢</span>
    </div>
  );
}

function CountdownStrip({ refreshAt }: { refreshAt: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const tick = () => setPct(Math.max(0, ((refreshAt - Date.now()) / REFRESH_MS) * 100));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [refreshAt]);
  return (
    <div className="h-px w-full overflow-hidden" style={{ background: "var(--border)" }}>
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: "var(--accent)", opacity: 0.35 }}
      />
    </div>
  );
}

function BracketLabel({ m }: { m: ScoredMarket }) {
  const { strikeLow, strikeHigh } = m;
  if (strikeLow != null && strikeHigh != null)
    return <>{strikeLow.toLocaleString()} – {Math.floor(strikeHigh).toLocaleString()}</>;
  if (strikeHigh != null) return <>above {strikeHigh.toLocaleString()}</>;
  if (strikeLow != null) return <>below {strikeLow.toLocaleString()}</>;
  return <>{m.title}</>;
}

export default function DeviationPage() {
  const [data, setData] = useState<DeviationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshAt, setRefreshAt] = useState(Date.now() + REFRESH_MS);

  const loadData = useCallback(async () => {
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
      setRefreshAt(Date.now() + REFRESH_MS);
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadData]);

  const updatedTime = data
    ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <main className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">

        {/* Header */}
        <div className="mb-12">
          <div className="text-xs tracking-[0.22em] mb-4" style={{ color: "rgba(231,235,232,0.4)" }}>
            LABS · SPX DEVIATION ENGINE
          </div>
          <div className="flex items-end justify-between flex-wrap gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                Kalshi vs. Model
              </h1>
              <p className="text-sm mt-2 max-w-xl leading-relaxed" style={{ color: "rgba(231,235,232,0.55)" }}>
                Compares Kalshi's implied probability on today's SPX brackets against a realized-vol
                digital option model. Deviations flag potential mispricings.
              </p>
            </div>

            {data && (
              <div className="flex items-center gap-8 shrink-0">
                <div>
                  <div className="text-xs tracking-[0.18em] mb-1" style={{ color: "rgba(231,235,232,0.35)" }}>SPX</div>
                  <div className="text-2xl font-semibold font-mono" style={{ color: "var(--accent)" }}>
                    {data.spxPrice.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs tracking-[0.18em] mb-1" style={{ color: "rgba(231,235,232,0.35)" }}>CLOSES IN</div>
                  <div className="text-2xl font-semibold font-mono">{data.hoursUntilClose.toFixed(1)}h</div>
                </div>
                <button
                  onClick={loadData}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ border: "1px solid var(--border)", color: "rgba(231,235,232,0.45)" }}
                >
                  Refresh
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <CountdownStrip refreshAt={refreshAt} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs font-mono" style={{ color: "rgba(231,235,232,0.22)" }}>
                {data?.eventTicker ?? "—"}
              </span>
              <span className="text-xs font-mono" style={{ color: "rgba(231,235,232,0.22)" }}>
                {updatedTime ? `updated ${updatedTime}` : "loading…"} · auto-refresh 60s
              </span>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-24 text-center text-sm animate-pulse" style={{ color: "rgba(231,235,232,0.3)" }}>
            Loading markets…
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            className="rounded-2xl px-5 py-4 text-sm"
            style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)", color: "#fca5a5" }}
          >
            {error}
          </div>
        )}

        {/* Table */}
        {data && !loading && (
          <>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {[
                      { label: "Bracket",  align: "text-left"  },
                      { label: "Market",   align: "text-right" },
                      { label: "Model",    align: "text-right" },
                      { label: "Edge",     align: "text-right" },
                      { label: "Spread",   align: "text-left"  },
                      { label: "Signal",   align: "text-left"  },
                      { label: "",         align: "text-left hidden lg:table-cell" },
                    ].map((h, i) => (
                      <th
                        key={i}
                        className={`px-5 py-3.5 text-xs font-medium tracking-[0.15em] ${h.align}`}
                        style={{ color: "rgba(231,235,232,0.3)" }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.markets.map((m, i) => {
                    const { result, quote } = m;
                    const isAlert = result.label === "Extreme" || result.label === "High";
                    return (
                      <tr
                        key={m.id}
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{
                          borderBottom: i < data.markets.length - 1 ? "1px solid var(--border)" : undefined,
                          background: isAlert ? "rgba(43,203,119,0.03)" : undefined,
                        }}
                      >
                        {/* Bracket */}
                        <td className="px-5 py-4">
                          <div className="font-mono font-medium text-sm">
                            <BracketLabel m={m} />
                          </div>
                          <div className="text-xs font-mono mt-0.5" style={{ color: "rgba(231,235,232,0.22)" }}>
                            {m.ticker.split("-").slice(-1)[0]}
                          </div>
                        </td>

                        {/* Market mid */}
                        <td className="px-5 py-4 text-right">
                          <div className="font-mono text-sm">
                            {result.pMkt != null ? (result.pMkt * 100).toFixed(1) + "¢" : "—"}
                          </div>
                          {quote.yesBid != null && quote.yesAsk != null && (
                            <div className="text-xs font-mono mt-0.5" style={{ color: "rgba(231,235,232,0.28)" }}>
                              {quote.yesBid}b / {quote.yesAsk}a
                            </div>
                          )}
                        </td>

                        {/* Model */}
                        <td className="px-5 py-4 text-right">
                          <div className="font-mono text-sm" style={{ color: "rgba(231,235,232,0.6)" }}>
                            {result.pModel != null ? (result.pModel * 100).toFixed(1) + "¢" : "—"}
                          </div>
                        </td>

                        {/* Edge */}
                        <td className="px-5 py-4 text-right">
                          <EdgeCell rawD={result.rawD} zScore={result.zScore} />
                        </td>

                        {/* Spread */}
                        <td className="px-5 py-4">
                          <SpreadCell spread={result.spread} />
                        </td>

                        {/* Signal */}
                        <td className="px-5 py-4">
                          <SignalDot label={result.label} />
                        </td>

                        {/* Sparkline */}
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <Sparkline data={m.sparkline} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.12)" }}
              >
                <span className="text-xs font-mono" style={{ color: "rgba(231,235,232,0.22)" }}>
                  {data.count} brackets · SPY×10 · {data.markets[0]?.result.candleCount ?? 0} candles
                </span>
                <a
                  href="https://kalshi.com/markets/kxinx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: "var(--accent)" }}
                >
                  View on Kalshi →
                </a>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              {[
                { label: "Extreme",      desc: "Strong gap, tight spread" },
                { label: "High",         desc: "Notable gap, decent liquidity" },
                { label: "Notable",      desc: "Mild deviation" },
                { label: "Normal",       desc: "No edge" },
                { label: "Wide Spread",  desc: "Signal exists, low confidence" },
              ].map(({ label, desc }) => {
                const s = LABEL_STYLES[label];
                return (
                  <div key={label} className="flex items-center gap-1.5 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                    <span style={{ color: s.text }}>{label}</span>
                    <span style={{ color: "rgba(231,235,232,0.28)" }}>— {desc}</span>
                  </div>
                );
              })}
            </div>

            {/* Methodology */}
            <div
              className="mt-8 rounded-2xl px-5 py-4 text-xs leading-relaxed"
              style={{ border: "1px solid var(--border)", background: "var(--card)", color: "rgba(231,235,232,0.38)" }}
            >
              <span style={{ color: "rgba(231,235,232,0.6)", fontWeight: 500 }}>Model: </span>
              SPY 20-day realized vol → annualized σ → N(d₂) digital option probability per bracket.
              Market price = Kalshi mid (bid+ask)/2. Edge = pMkt − pModel. Z-score normalized by dailyVol/8.
              Confidence weighted by spread width (max 50¢). Wide Spread = 5–30% confidence. Insufficient Data = &lt;5%.
            </div>
          </>
        )}
      </div>
    </main>
  );
}