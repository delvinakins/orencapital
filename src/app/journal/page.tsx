"use client";

import React, { useEffect, useMemo, useState } from "react";

type Trade = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  market: string | null;

  symbol: string | null;
  direction: string | null;

  entry: number | null;
  stop: number | null;
  exit?: number | null;

  position_size: number | null;
  risk_pct: number | null;

  strategy_tag: string | null;
  notes: string | null;

  r_multiple?: number | null;
  closed_at?: string | null;
};

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string; detail?: string; fields?: Record<string, string> | null };

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function nOrDash(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return String(v);
}

function pct(v: number | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(v * 1000) / 10}%`; // risk_pct is decimal; display percent
}

function clsStatus(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "OPEN") return "text-[#2BCB77]"; // pine
  if (s === "CLOSED") return "text-zinc-300";
  return "text-amber-300";
}

function clsPill(base: string) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${base}`;
}

export default function JournalPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);

  // Form state
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [market, setMarket] = useState<"STOCKS" | "OPTIONS" | "FUTURES" | "SPORTS">("STOCKS");

  const [entry, setEntry] = useState<string>("");
  const [stop, setStop] = useState<string>("");
  const [positionSize, setPositionSize] = useState<string>("");
  const [riskPct, setRiskPct] = useState<string>(""); // user can type 1 for 1% or 0.01; we normalize

  const [strategyTag, setStrategyTag] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Close-trade UI
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeExit, setCloseExit] = useState<string>("");

  const openTrades = useMemo(
    () => trades.filter((t) => (t.status || "OPEN").toUpperCase() === "OPEN"),
    [trades]
  );

  const closedTrades = useMemo(
    () => trades.filter((t) => (t.status || "OPEN").toUpperCase() === "CLOSED"),
    [trades]
  );

  async function loadTrades() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/trades", { method: "GET" });
      const json = (await res.json()) as ApiOk<{ trades: Trade[] }> | ApiErr;

      if (!res.ok || !json.ok) {
        const msg = !json.ok ? json.error : "Failed to load trades";
        setError(msg);
        setTrades([]);
        return;
      }

      setTrades(json.trades || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load trades");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  function parseNullableNumber(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeRiskPct(input: string): number | null {
    const n = parseNullableNumber(input);
    if (n === null) return null;

    // Accept "1" meaning 1% and "0.01" meaning 1% as decimal.
    // If user enters > 1, treat as percent.
    if (n > 1) return n / 100;
    return n;
  }

  async function onCreateTrade(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors(null);

    const payload = {
      symbol: symbol.trim(),
      direction,
      market,
      entry: parseNullableNumber(entry),
      stop: parseNullableNumber(stop),
      position_size: parseNullableNumber(positionSize),
      risk_pct: normalizeRiskPct(riskPct),
      strategy_tag: strategyTag.trim() ? strategyTag.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      status: "OPEN" as const,
    };

    try {
      const res = await fetch("/api/journal/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ApiOk<{ trade: Trade }> | ApiErr;

      if (!res.ok || !json.ok) {
        if (!json.ok && json.fields) setFieldErrors(json.fields);
        setError(!json.ok ? json.error : "Failed to create trade");
        return;
      }

      // Prepend new trade
      setTrades((prev) => [json.trade, ...prev]);

      // Reset some inputs (keep market/direction)
      setSymbol("");
      setEntry("");
      setStop("");
      setPositionSize("");
      setRiskPct("");
      setStrategyTag("");
      setNotes("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create trade");
    } finally {
      setSaving(false);
    }
  }

  async function onStartClose(tradeId: string) {
    setClosingId(tradeId);
    setCloseExit("");
    setError(null);
    setFieldErrors(null);
  }

  async function onCancelClose() {
    setClosingId(null);
    setCloseExit("");
  }

  async function onConfirmClose(trade: Trade) {
    if (!closingId) return;

    setSaving(true);
    setError(null);
    setFieldErrors(null);

    const exit = parseNullableNumber(closeExit);

    const payload: any = {
      id: closingId,
      status: "CLOSED",
    };

    // Only send exit if provided
    if (exit !== null) payload.exit = exit;

    try {
      const res = await fetch("/api/journal/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ApiOk<{ trade: Trade }> | ApiErr;

      if (!res.ok || !json.ok) {
        if (!json.ok && json.fields) setFieldErrors(json.fields);
        setError(!json.ok ? json.error : "Failed to close trade");
        return;
      }

      // Update in place
      setTrades((prev) => prev.map((t) => (t.id === json.trade.id ? json.trade : t)));
      setClosingId(null);
      setCloseExit("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to close trade");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-zinc-400">
            Trades feed Portfolio discipline metrics automatically. No signals. No alerts.
          </p>
        </div>

        {/* Status strip */}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="oc-glass rounded-2xl border border-white/10 p-4">
            <div className="text-xs text-zinc-400">Open trades</div>
            <div className="mt-1 text-xl font-semibold">{loading ? "—" : openTrades.length}</div>
          </div>
          <div className="oc-glass rounded-2xl border border-white/10 p-4">
            <div className="text-xs text-zinc-400">Closed trades</div>
            <div className="mt-1 text-xl font-semibold">{loading ? "—" : closedTrades.length}</div>
          </div>
          <div className="oc-glass rounded-2xl border border-white/10 p-4">
            <div className="text-xs text-zinc-400">Sync</div>
            <div className="mt-1 text-sm text-zinc-300">
              {loading ? "Loading…" : "Live (journal-derived)"}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {(error || fieldErrors) && (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="text-sm font-medium text-amber-200">Attention</div>
            {error && <div className="mt-1 text-sm text-amber-100/90">{error}</div>}
            {fieldErrors && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/90">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k}:</span> {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Create trade */}
        <div className="mt-6 oc-glass rounded-2xl border border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">New trade</div>
              <div className="mt-1 text-xs text-zinc-400">
                Risk % is stored as a decimal (0.01 = 1%). You can type <span className="text-zinc-200">1</span> or{" "}
                <span className="text-zinc-200">0.01</span>.
              </div>
            </div>
            <div className={clsPill("border-white/10 bg-white/5 text-zinc-300")}>
              Pine = disciplined
            </div>
          </div>

          <form onSubmit={onCreateTrade} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="text-xs text-zinc-400">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AAPL"
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400">Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-[#2BCB77]/50"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-zinc-400">Market</label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-[#2BCB77]/50"
              >
                <option value="STOCKS">STOCKS</option>
                <option value="OPTIONS">OPTIONS</option>
                <option value="FUTURES">FUTURES</option>
                <option value="SPORTS">SPORTS</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400">Entry</label>
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="195.25"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-zinc-400">Stop</label>
              <input
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                placeholder="190.00"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-zinc-400">Position size</label>
              <input
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-zinc-400">Risk %</label>
              <input
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                placeholder="1  (or 0.01)"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-zinc-400">Strategy tag</label>
              <input
                value={strategyTag}
                onChange={(e) => setStrategyTag(e.target.value)}
                placeholder="Breakout / Mean reversion / etc."
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-9">
              <label className="text-xs text-zinc-400">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, rule adherence, what you’ll do next time."
                className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#2BCB77]/50"
              />
            </div>

            <div className="md:col-span-12 flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={loadTrades}
                disabled={loading || saving}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl border border-[#2BCB77]/30 bg-[#2BCB77]/10 px-4 py-2 text-sm text-[#2BCB77] hover:bg-[#2BCB77]/15 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add trade"}
              </button>
            </div>
          </form>
        </div>

        {/* Trades table */}
        <div className="mt-6 oc-glass rounded-2xl border border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Trades</div>
              <div className="mt-1 text-xs text-zinc-400">
                Close trades to unlock outcomes (R-multiple, drawdown, expectancy).
              </div>
            </div>
            <div className={clsPill("border-white/10 bg-white/5 text-zinc-300")}>
              Amber = attention
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-zinc-400">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Dir</th>
                  <th className="py-2 pr-4">Market</th>
                  <th className="py-2 pr-4">Entry</th>
                  <th className="py-2 pr-4">Stop</th>
                  <th className="py-2 pr-4">Risk %</th>
                  <th className="py-2 pr-4">Tag</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-0 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="py-4 text-sm text-zinc-400" colSpan={10}>
                      Loading…
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-zinc-400" colSpan={10}>
                      No trades yet.
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const status = (t.status || "OPEN").toUpperCase();
                    const isClosing = closingId === t.id;

                    return (
                      <React.Fragment key={t.id}>
                        <tr className="border-t border-white/5 text-sm">
                          <td className={`py-3 pr-4 ${clsStatus(status)}`}>
                            {status === "OPEN" ? (
                              <span className={clsPill("border-[#2BCB77]/25 bg-[#2BCB77]/10 text-[#2BCB77]")}>
                                OPEN
                              </span>
                            ) : status === "CLOSED" ? (
                              <span className={clsPill("border-white/10 bg-white/5 text-zinc-300")}>
                                CLOSED
                              </span>
                            ) : (
                              <span className={clsPill("border-amber-400/25 bg-amber-400/10 text-amber-200")}>
                                {status || "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 font-medium text-zinc-100">
                            {(t.symbol || "—").toUpperCase()}
                          </td>
                          <td className="py-3 pr-4 text-zinc-300">{(t.direction || "—").toUpperCase()}</td>
                          <td className="py-3 pr-4 text-zinc-300">{(t.market || "STOCKS").toUpperCase()}</td>
                          <td className="py-3 pr-4 text-zinc-300">{nOrDash(t.entry)}</td>
                          <td className="py-3 pr-4 text-zinc-300">{nOrDash(t.stop)}</td>
                          <td className="py-3 pr-4 text-zinc-300">{pct(t.risk_pct)}</td>
                          <td className="py-3 pr-4 text-zinc-400">{t.strategy_tag || "—"}</td>
                          <td className="py-3 pr-4 text-zinc-500">{fmtDate(t.created_at)}</td>
                          <td className="py-3 pr-0 text-right">
                            {status === "OPEN" ? (
                              <button
                                onClick={() => onStartClose(t.id)}
                                disabled={saving}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                              >
                                Close
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>

                        {isClosing && (
                          <tr className="border-t border-white/5">
                            <td colSpan={10} className="py-3">
                              <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="text-sm font-medium text-amber-200">Close trade</div>
                                  <div className="mt-1 text-xs text-zinc-400">
                                    Optional: add exit to compute R-multiple (if entry/stop exist).
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                  <input
                                    value={closeExit}
                                    onChange={(e) => setCloseExit(e.target.value)}
                                    placeholder="Exit (optional)"
                                    inputMode="decimal"
                                    className="w-full rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400/40 md:w-44"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={onCancelClose}
                                      disabled={saving}
                                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => onConfirmClose(t)}
                                      disabled={saving}
                                      className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
                                    >
                                      {saving ? "Closing…" : "Confirm close"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Small footer note */}
        <div className="mt-6 text-xs text-zinc-500">
          Discipline engine is journal-derived. Correlation/sector/beta clustering will arrive in Heat 2.0.
        </div>
      </div>
    </div>
  );
}