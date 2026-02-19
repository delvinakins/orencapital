"use client";

import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import ProLock from "@/components/ProLock";

type InstrumentType = "stock" | "option" | "future" | "crypto" | "fx" | "other";
type TradeSide = "long" | "short";

type JournalTrade = {
  id: string;
  symbol: string | null;
  instrument: InstrumentType | string | null;
  side: TradeSide | string | null;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  result_r: number | null;
  strategy: string | null;
  notes: string | null;
  created_at: string | null;
  closed_at: string | null;
};

type StrategyStat = {
  strategy: string;
  trades: number;
  tracked: number;
  winRate: number | null;
  avgR: number | null;
  totalR: number | null;
  expectancy: number | null;
  largestLoss: number | null;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function n(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return Number.isFinite(v as number) ? (v as number) : null;
}

function fmtPct01(x: number | null | undefined, digits = 1) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function fmtR(x: number | null | undefined, digits = 2) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}R`;
}

function cleanStrategy(s: any) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > 80 ? t.slice(0, 80) : t;
}

function computeResultR(t: Pick<JournalTrade, "result_r" | "entry_price" | "stop_price" | "exit_price" | "side">) {
  const rr = n(t.result_r);
  if (rr !== null) return rr;

  const entry = n(t.entry_price);
  const stop = n(t.stop_price);
  const exit = n(t.exit_price);
  const side = t.side;

  if (entry === null || stop === null || exit === null) return null;
  if (side !== "long" && side !== "short") return null;

  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const pnl = side === "long" ? exit - entry : entry - exit;
  const r = pnl / risk;
  return Number.isFinite(r) ? r : null;
}

function toneFromEV(ev: number | null): "neutral" | "accent" | "warn" {
  if (typeof ev !== "number" || !Number.isFinite(ev)) return "neutral";
  if (ev < 0) return "warn";
  if (ev >= 0.05) return "accent";
  return "neutral";
}

function Card({
  label,
  value,
  sub,
  tone = "neutral",
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "warn";
  tip?: React.ReactNode;
}) {
  const toneClass =
    tone === "accent"
      ? "border-[color:var(--accent)]/55 shadow-[0_0_0_1px_rgba(43,203,119,0.10)]"
      : tone === "warn"
        ? "border-amber-800/60"
        : "border-[color:var(--border)]";

  const valueClass =
    tone === "accent"
      ? "text-[color:var(--accent)]"
      : tone === "warn"
        ? "text-amber-200"
        : "text-foreground";

  return (
    <div className={cn("oc-glass rounded-xl border p-5 sm:p-6", toneClass)}>
      <div className="text-xs text-foreground/60">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</div>
      <div className={cn("mt-2 text-xl font-semibold", valueClass)}>{value}</div>
      {sub && <div className="mt-2 text-xs text-foreground/60">{sub}</div>}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  tip?: React.ReactNode;
}) {
  const inputMode = type === "number" ? ("decimal" as const) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none placeholder:text-foreground/30"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  tip?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StopTipBody() {
  return (
    <div className="space-y-2 max-w-xs">
      <div>
        <span className="font-semibold">Stop</span>: the price level that invalidates your trade idea.
      </div>
      <div className="text-foreground/70">
        It defines where you are wrong and prevents small losses from becoming large ones.
      </div>
      <div className="text-foreground/70">
        It also defines <span className="font-semibold">1R</span> (your risk per trade), so Oren can measure expectancy and
        consistency.
      </div>
    </div>
  );
}

export default function JournalClient() {
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [strategyStats, setStrategyStats] = useState<StrategyStat[] | null>(null);

  const [err, setErr] = useState<string | null>(null);

  // Entry form state (simple + calm)
  const [symbol, setSymbol] = useState("");
  const [instrument, setInstrument] = useState<InstrumentType>("stock");
  const [side, setSide] = useState<TradeSide>("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [exit, setExit] = useState("");
  const [strategy, setStrategy] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    setSavedMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/journal/list?limit=500", { cache: "no-store" });
      const j = await res.json().catch(() => null);

      if (!res.ok) {
        setErr(j?.error ?? "Failed to load journal.");
        setLoading(false);
        return;
      }

      setTrades(Array.isArray(j?.items) ? j.items : []);
      setIsPro(!!j?.pro?.isPro);
      setStrategyStats(j?.strategyStats ?? null);

      setLoading(false);
    } catch {
      setErr("Failed to load journal.");
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const rs = trades
      .map((t) => computeResultR(t))
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    const tracked = rs.length;
    const wins = rs.filter((x) => x > 0).length;

    const winRate = tracked > 0 ? wins / tracked : null;
    const avgR = tracked > 0 ? rs.reduce((a, b) => a + b, 0) / tracked : null;
    const totalR = tracked > 0 ? rs.reduce((a, b) => a + b, 0) : null;
    const largestLoss = tracked > 0 ? Math.min(...rs) : null;

    // Calm: EV ~ avgR under the model (losers are negative R)
    const ev = avgR;

    return {
      tradesLogged: trades.length,
      tracked,
      winRate,
      avgR,
      ev,
      totalR,
      largestLoss,
    };
  }, [trades]);

  async function onSaveTrade() {
    setErr(null);
    setSavedMsg(null);
    setSaving(true);

    try {
      const res = await fetch("/api/journal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim(),
          instrument,
          side,
          entry_price: entry.trim() ? Number(entry) : null,
          stop_price: stop.trim() ? Number(stop) : null,
          exit_price: exit.trim() ? Number(exit) : null,
          strategy: cleanStrategy(strategy),
          notes: notes.trim() ? notes.trim() : null,
        }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok) {
        setErr(j?.error ?? "Save failed.");
        setSaving(false);
        return;
      }

      setSavedMsg("Trade saved.");
      setSaving(false);

      // reset minimal fields
      setExit("");
      setNotes("");

      await refresh();
    } catch {
      setErr("Save failed.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-5">
        <Card
          label="Win Rate"
          value={fmtPct01(summary.winRate, 1)}
          sub={summary.tracked ? `${summary.tracked} tracked trades` : "—"}
          tip="Wins / tracked trades. Trades are tracked when result R can be computed or is stored."
        />
        <Card label="Avg R" value={fmtR(summary.avgR, 3)} tip="Average R multiple across tracked trades." />
        <Card
          label="EV"
          value={fmtR(summary.ev, 3)}
          tone={toneFromEV(summary.ev)}
          tip="Expectancy (R per trade). For now, EV is measured as average realized R."
        />
        <Card label="Total R" value={fmtR(summary.totalR, 2)} tip="Sum of R across tracked trades." />
        <Card
          label="Trades Logged"
          value={`${summary.tradesLogged}`}
          sub={summary.tradesLogged ? "All trades" : "—"}
          tip="Total logged trades (including those without enough info to compute R)."
        />
      </section>

      {/* Entry Form */}
      <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">Log a trade</div>
            <div className="mt-1 text-sm text-foreground/70">Structured input. Calm defaults.</div>
          </div>

          <div className="text-xs text-foreground/60">
            <Tooltip label="Stop">
              <StopTipBody />
            </Tooltip>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Symbol" value={symbol} onChange={setSymbol} placeholder="AAPL" tip="Ticker (max 20 chars)." />

          <Select
            label="Instrument"
            value={instrument}
            onChange={(v) => setInstrument(v as InstrumentType)}
            options={[
              { value: "stock", label: "Stock" },
              { value: "option", label: "Option" },
              { value: "future", label: "Future" },
              { value: "crypto", label: "Crypto" },
              { value: "fx", label: "FX" },
              { value: "other", label: "Other" },
            ]}
          />

          <Select
            label="Side"
            value={side}
            onChange={(v) => setSide(v as TradeSide)}
            options={[
              { value: "long", label: "Long" },
              { value: "short", label: "Short" },
            ]}
          />

          <Input label="Entry Price" value={entry} onChange={setEntry} type="number" placeholder="190.25" />
          <Input
            label="Stop Price"
            value={stop}
            onChange={setStop}
            type="number"
            placeholder="187.50"
            tip="The price level that invalidates your trade idea. It defines 1R."
          />
          <Input label="Exit Price" value={exit} onChange={setExit} type="number" placeholder="194.10" />

          <Input label="Strategy" value={strategy} onChange={setStrategy} placeholder="ORB / Trend / Breakout" />
          <div className="sm:col-span-2">
            <label className="text-sm text-foreground/70">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was the thesis? What would invalidate it? What did you execute well/poorly?"
              className="mt-2 min-h-[44px] w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-foreground outline-none placeholder:text-foreground/30"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSaveTrade}
            disabled={saving || !symbol.trim()}
            className={cn("oc-btn oc-btn-accent", (saving || !symbol.trim()) && "opacity-60")}
          >
            {saving ? "Saving…" : "Save Trade"}
          </button>

          <div className="text-xs text-foreground/60">Tip: For analytics, include exit + stop so R can be computed.</div>
        </div>

        {(err || savedMsg) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {err && (
              <div className="rounded-lg border border-amber-800/60 bg-[color:var(--card)] px-4 py-3 text-sm text-amber-200">
                {err}
              </div>
            )}
            {savedMsg && (
              <div className="rounded-lg border border-[color:var(--accent)]/45 bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--accent)]">
                {savedMsg}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Strategy Breakdown (Pro) */}
      <ProLock
        feature="Strategy breakdown"
        description="See win rate, average R, and total R by strategy. This is where edge becomes measurable."
        mode="overlay"
      >
        <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-sm font-semibold tracking-tight">Strategy Breakdown</div>
              <div className="mt-1 text-sm text-foreground/70">
                Performance by strategy. Calm, data-forward, no storytelling.
              </div>
            </div>

            <div className="text-xs text-foreground/60">
              <Tooltip label="How this works">
                <div className="space-y-2 max-w-sm">
                  <div className="font-semibold">Tracked trades</div>
                  <div className="text-foreground/70">
                    A trade is included in strategy stats when <span className="font-semibold">result R</span> is stored or can
                    be computed from <span className="font-semibold">entry, stop, exit</span>.
                  </div>
                  <div className="text-foreground/70">Sorted by Total R (highest first).</div>
                </div>
              </Tooltip>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-foreground/70">Loading…</div>
          ) : !isPro ? (
            <div className="text-sm text-foreground/70">Upgrade to unlock strategy analytics.</div>
          ) : !strategyStats || strategyStats.length === 0 ? (
            <div className="text-sm text-foreground/70">No strategies yet. Add a strategy label to trades to populate this.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Trades</th>
                    <th className="px-4 py-3 font-medium">Tracked</th>
                    <th className="px-4 py-3 font-medium">Win Rate</th>
                    <th className="px-4 py-3 font-medium">Avg R</th>
                    <th className="px-4 py-3 font-medium">Total R</th>
                    <th className="px-4 py-3 font-medium">Largest Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyStats.map((s) => {
                    const tone = toneFromEV(s.avgR ?? null);
                    const totalTone = toneFromEV(s.totalR ?? null);

                    return (
                      <tr key={s.strategy} className="border-t border-[color:var(--border)]">
                        <td className="px-4 py-3 font-medium text-foreground">{s.strategy}</td>
                        <td className="px-4 py-3 text-foreground/85">{s.trades}</td>
                        <td className="px-4 py-3 text-foreground/85">{s.tracked}</td>
                        <td className="px-4 py-3 text-foreground/85">
                          {s.winRate == null ? "—" : fmtPct01(s.winRate, 1)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3",
                            tone === "accent"
                              ? "text-[color:var(--accent)]"
                              : tone === "warn"
                                ? "text-amber-200"
                                : "text-foreground/85"
                          )}
                        >
                          {fmtR(s.avgR, 3)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3",
                            totalTone === "accent"
                              ? "text-[color:var(--accent)]"
                              : totalTone === "warn"
                                ? "text-amber-200"
                                : "text-foreground/85"
                          )}
                        >
                          {fmtR(s.totalR, 2)}
                        </td>
                        <td className="px-4 py-3 text-foreground/85">{fmtR(s.largestLoss, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </ProLock>

      {/* Trades Table (basic) */}
      <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">Trades</div>
            <div className="mt-1 text-sm text-foreground/70">Your most recent trades.</div>
          </div>

          <button type="button" onClick={refresh} className="oc-btn oc-btn-secondary">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-foreground/70">Loading…</div>
        ) : trades.length === 0 ? (
          <div className="text-sm text-foreground/70">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="text-left text-foreground/60">
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Instrument</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Entry</th>
                  <th className="px-4 py-3 font-medium">Stop</th>
                  <th className="px-4 py-3 font-medium">Exit</th>
                  <th className="px-4 py-3 font-medium">Result (R)</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const rr = computeResultR(t);
                  const rrTone = toneFromEV(rr);
                  const created = t.created_at ? new Date(t.created_at).toLocaleDateString() : "—";

                  return (
                    <tr key={t.id} className="border-t border-[color:var(--border)]">
                      <td className="px-4 py-3 font-medium text-foreground">{t.symbol ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground/85">{String(t.instrument ?? "—")}</td>
                      <td className="px-4 py-3 text-foreground/85">{String(t.side ?? "—")}</td>
                      <td className="px-4 py-3 text-foreground/85">{t.entry_price ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground/85">{t.stop_price ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground/85">{t.exit_price ?? "—"}</td>
                      <td
                        className={cn(
                          "px-4 py-3",
                          rrTone === "accent"
                            ? "text-[color:var(--accent)]"
                            : rrTone === "warn"
                              ? "text-amber-200"
                              : "text-foreground/85"
                        )}
                      >
                        {fmtR(rr, 2)}
                      </td>
                      <td className="px-4 py-3 text-foreground/85">{t.strategy ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground/85">{created}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
