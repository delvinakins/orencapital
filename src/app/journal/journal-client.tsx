"use client";

import { useEffect, useMemo, useState } from "react";

type Trade = {
  id: string;
  symbol: string;
  side: "long" | "short";
  entry_price: number | null;
  exit_price: number | null;
  stop_price: number | null;
  risk_r: number | null;
  result_r: number | null;
  pnl_dollars: number | null;
  strategy: string | null;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
};

function fmt(n: number, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export default function JournalClient() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // form state (minimal for now)
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [resultR, setResultR] = useState<string>(""); // keep string for input

  async function load() {
    setLoading(true);
    const res = await fetch("/api/journal/list?limit=200", { cache: "no-store" });
    const json = await res.json();
    setTrades(json.trades ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTrade(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      symbol,
      side,
      result_r: resultR === "" ? null : Number(resultR),
      closed_at: resultR === "" ? null : new Date().toISOString(),
    };

    const res = await fetch("/api/journal/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error ?? "Failed to save trade");
      return;
    }

    setSymbol("");
    setResultR("");
    await load();
  }

  // Phase 1 summary metrics (simple + useful)
  const metrics = useMemo(() => {
    const closed = trades.filter((t) => typeof t.result_r === "number" && t.result_r !== null);

    const n = closed.length;
    const wins = closed.filter((t) => (t.result_r ?? 0) > 0).length;
    const winRate = n > 0 ? wins / n : 0;

    const totalR = closed.reduce((acc, t) => acc + (t.result_r ?? 0), 0);
    const avgR = n > 0 ? totalR / n : 0;

    // Simple EV per trade = avg R (for now)
    const ev = avgR;

    return {
      tradesLogged: trades.length,
      closedTrades: n,
      winRate,
      avgR,
      ev,
      totalR,
    };
  }, [trades]);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard label="Win Rate" value={`${Math.round(metrics.winRate * 100)}%`} hint="Closed trades only" />
        <SummaryCard label="Avg R" value={fmt(metrics.avgR)} pine={metrics.avgR > 0} />
        <SummaryCard label="EV" value={fmt(metrics.ev)} pine={metrics.ev > 0} />
        <SummaryCard label="Total R" value={fmt(metrics.totalR)} pine={metrics.totalR > 0} />
        <SummaryCard label="Trades Logged" value={`${metrics.tradesLogged}`} />
      </div>

      {/* Entry */}
      <div className="oc-glass rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Log Trade</div>
            <div className="text-xs text-white/60">Keep it clean. Add detail later.</div>
          </div>
          <div className="text-xs text-white/50">{loading ? "Syncing…" : "Synced"}</div>
        </div>

        <form onSubmit={saveTrade} className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="text-xs text-white/60">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="ES, NQ, AAPL…"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-white/60">Side</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="text-xs text-white/60">Result (R)</label>
            <input
              value={resultR}
              onChange={(e) => setResultR(e.target.value)}
              placeholder="e.g. 1.2"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
          </div>

          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:border-white/20 hover:bg-white/10"
            >
              Save
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="oc-glass rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-white">Trades</div>
          <button
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:border-white/20 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-white/60">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Symbol</th>
                <th className="py-2 pr-3">Side</th>
                <th className="py-2 pr-3">Result (R)</th>
                <th className="py-2 pr-3">Strategy</th>
                <th className="py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody className="text-white/90">
              {trades.map((t) => {
                const r = t.result_r ?? null;
                const pine = typeof r === "number" && r > 0;
                return (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-xs text-white/50">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-medium">{t.symbol}</td>
                    <td className="py-2 pr-3 text-white/70">{t.side}</td>
                    <td className={`py-2 pr-3 ${pine ? "text-[var(--oc-pine)]" : "text-white/80"}`}>
                      {r === null ? "—" : fmt(r)}
                    </td>
                    <td className="py-2 pr-3 text-white/70">{t.strategy ?? "—"}</td>
                    <td className="py-2 pr-3 text-white/70">{t.notes ?? "—"}</td>
                  </tr>
                );
              })}
              {!loading && trades.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-white/50">
                    No trades yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  pine,
}: {
  label: string;
  value: string;
  hint?: string;
  pine?: boolean;
}) {
  return (
    <div className="oc-glass rounded-2xl p-4">
      <div className="text-xs text-white/60">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${pine ? "text-[var(--oc-pine)]" : "text-white"}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-white/40">{hint}</div> : null}
    </div>
  );
}
