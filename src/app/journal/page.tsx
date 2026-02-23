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

function clsPill(base: string) {
  return `inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${base}`;
}

function statusPill(statusRaw: string | null) {
  const s = (statusRaw || "OPEN").toUpperCase();
  if (s === "OPEN") {
    return clsPill("border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]");
  }
  if (s === "CLOSED") {
    return clsPill("border-white/10 bg-white/5 text-slate-200");
  }
  return clsPill("border-amber-200/20 bg-amber-400/10 text-amber-200");
}

function fieldCls(hasErr: boolean) {
  return [
    "mt-1 w-full rounded-xl border bg-[color:var(--card)] px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/30",
    hasErr
      ? "border-amber-400/40 focus:border-amber-400/55"
      : "border-[color:var(--border)] focus:border-[color:var(--accent)]/55",
  ].join(" ");
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

  const fe = fieldErrors ?? {};
  const has = (k: string) => typeof fe?.[k] === "string" && fe[k].length > 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8 sm:space-y-10">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-foreground/70">Trades feed Portfolio discipline metrics automatically. No signals. No alerts.</p>
        </header>

        {/* Status strip */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="oc-glass rounded-2xl p-5">
            <div className="text-xs tracking-[0.22em] text-foreground/50">OPEN</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{loading ? "—" : openTrades.length}</div>
          </div>

          <div className="oc-glass rounded-2xl p-5">
            <div className="text-xs tracking-[0.22em] text-foreground/50">CLOSED</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{loading ? "—" : closedTrades.length}</div>
          </div>

          <div className="oc-glass rounded-2xl p-5">
            <div className="text-xs tracking-[0.22em] text-foreground/50">SYNC</div>
            <div className="mt-2 text-sm text-foreground/70">
              {loading ? "Loading…" : <span className="text-foreground/80">Live (journal-derived)</span>}
            </div>
            <div className="mt-2 text-xs text-foreground/50">Manual refresh available.</div>
          </div>
        </section>

        {/* Error banner */}
        {(error || fieldErrors) && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
            <div className="text-sm font-semibold text-amber-200">Attention</div>
            {error && <div className="mt-2 text-sm text-amber-100/90">{error}</div>}
            {fieldErrors && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100/90">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-semibold">{k}:</span> {v}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Create trade */}
        <section className="oc-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-lg font-semibold">New trade</div>
              <div className="mt-1 text-xs text-foreground/55">
                Risk % is stored as a decimal (0.01 = 1%). You can type{" "}
                <span className="text-foreground/80 tabular-nums">1</span> or{" "}
                <span className="text-foreground/80 tabular-nums">0.01</span>.
              </div>
            </div>

            <div className={clsPill("border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 text-foreground/80")}>
              Pine = disciplined
            </div>
          </div>

          <form onSubmit={onCreateTrade} className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="text-xs text-foreground/60">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AAPL"
                className={fieldCls(has("symbol"))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-foreground/60">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className={fieldCls(has("direction"))}>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-foreground/60">Market</label>
              <select value={market} onChange={(e) => setMarket(e.target.value as any)} className={fieldCls(has("market"))}>
                <option value="STOCKS">STOCKS</option>
                <option value="OPTIONS">OPTIONS</option>
                <option value="FUTURES">FUTURES</option>
                <option value="SPORTS">SPORTS</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-foreground/60">Entry</label>
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="195.25"
                inputMode="decimal"
                className={fieldCls(has("entry"))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-foreground/60">Stop</label>
              <input
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                placeholder="190.00"
                inputMode="decimal"
                className={fieldCls(has("stop"))}
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-foreground/60">Position size</label>
              <input
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                placeholder="100"
                inputMode="decimal"
                className={fieldCls(has("position_size"))}
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-foreground/60">Risk %</label>
              <input
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                placeholder="1  (or 0.01)"
                inputMode="decimal"
                className={fieldCls(has("risk_pct"))}
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-foreground/60">Strategy tag</label>
              <input
                value={strategyTag}
                onChange={(e) => setStrategyTag(e.target.value)}
                placeholder="Breakout / Mean reversion / etc."
                className={fieldCls(has("strategy_tag"))}
              />
            </div>

            <div className="md:col-span-9">
              <label className="text-xs text-foreground/60">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, rule adherence, what you’ll do next time."
                className={fieldCls(has("notes"))}
              />
            </div>

            <div className="md:col-span-12 flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={loadTrades}
                disabled={loading || saving}
                className="oc-btn oc-btn-secondary disabled:opacity-60"
              >
                Refresh
              </button>
              <button type="submit" disabled={saving} className="oc-btn oc-btn-outline-accent disabled:opacity-60">
                {saving ? "Saving…" : "Add trade"}
              </button>
            </div>
          </form>
        </section>

        {/* Trades */}
        <section className="oc-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-lg font-semibold">Trades</div>
              <div className="mt-1 text-xs text-foreground/55">Close trades to unlock outcomes (R-multiple, drawdown, expectancy).</div>
            </div>

            <div className={clsPill("border-amber-200/20 bg-amber-400/10 text-amber-200")}>Amber = attention</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[11px] tracking-wide text-foreground/55">
                  <th className="py-2 pr-4 font-semibold">STATUS</th>
                  <th className="py-2 pr-4 font-semibold">SYMBOL</th>
                  <th className="py-2 pr-4 font-semibold">DIR</th>
                  <th className="py-2 pr-4 font-semibold">MARKET</th>
                  <th className="py-2 pr-4 font-semibold">ENTRY</th>
                  <th className="py-2 pr-4 font-semibold">STOP</th>
                  <th className="py-2 pr-4 font-semibold">RISK %</th>
                  <th className="py-2 pr-4 font-semibold">TAG</th>
                  <th className="py-2 pr-4 font-semibold">CREATED</th>
                  <th className="py-2 pr-0 text-right font-semibold">ACTION</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="py-4 text-sm text-foreground/60" colSpan={10}>
                      Loading…
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td className="py-4 text-sm text-foreground/60" colSpan={10}>
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
                          <td className="py-3 pr-4">{statusPill(t.status)}</td>

                          <td className="py-3 pr-4 font-semibold text-foreground">
                            {(t.symbol || "—").toUpperCase()}
                          </td>

                          <td className="py-3 pr-4 text-foreground/75">{(t.direction || "—").toUpperCase()}</td>
                          <td className="py-3 pr-4 text-foreground/75">{(t.market || "STOCKS").toUpperCase()}</td>
                          <td className="py-3 pr-4 text-foreground/75 tabular-nums">{nOrDash(t.entry)}</td>
                          <td className="py-3 pr-4 text-foreground/75 tabular-nums">{nOrDash(t.stop)}</td>
                          <td className="py-3 pr-4 text-foreground/75 tabular-nums">{pct(t.risk_pct)}</td>
                          <td className="py-3 pr-4 text-foreground/60">{t.strategy_tag || "—"}</td>
                          <td className="py-3 pr-4 text-foreground/50">{fmtDate(t.created_at)}</td>

                          <td className="py-3 pr-0 text-right">
                            {status === "OPEN" ? (
                              <button
                                onClick={() => onStartClose(t.id)}
                                disabled={saving}
                                className="oc-btn oc-btn-secondary h-9 px-3 text-xs disabled:opacity-60"
                              >
                                Close
                              </button>
                            ) : (
                              <span className="text-xs text-foreground/40">—</span>
                            )}
                          </td>
                        </tr>

                        {isClosing && (
                          <tr className="border-t border-white/5">
                            <td colSpan={10} className="py-3">
                              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold text-amber-200">Close trade</div>
                                    <div className="mt-1 text-xs text-foreground/55">
                                      Optional: add exit to compute R-multiple (if entry/stop exist).
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                    <input
                                      value={closeExit}
                                      onChange={(e) => setCloseExit(e.target.value)}
                                      placeholder="Exit (optional)"
                                      inputMode="decimal"
                                      className="h-11 w-full rounded-xl border border-amber-400/25 bg-[color:var(--card)] px-3 text-sm text-foreground outline-none placeholder:text-foreground/30 focus:border-amber-400/40 md:w-44"
                                    />

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={onCancelClose}
                                        disabled={saving}
                                        className="oc-btn oc-btn-secondary disabled:opacity-60"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => onConfirmClose(t)}
                                        disabled={saving}
                                        className="oc-btn oc-btn-outline-accent disabled:opacity-60"
                                        style={{ borderColor: "rgba(251,191,36,.35)", color: "rgb(253 230 138)" }}
                                      >
                                        {saving ? "Closing…" : "Confirm close"}
                                      </button>
                                    </div>
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
        </section>

        <div className="text-xs text-foreground/45">
          Discipline engine is journal-derived. Correlation/sector/beta clustering will arrive later.
        </div>
      </div>
    </main>
  );
}