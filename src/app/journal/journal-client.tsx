"use client";

import { useEffect, useMemo, useState } from "react";
import Tooltip from "@/components/Tooltip";
import ProGate from "@/components/ProGate";
import JournalTradeActions from "./JournalTradeActions";
{/* Page Header */}
<section className="space-y-3">
  <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
    <span className="relative inline-block">
      <span className="relative z-10 text-[color:var(--accent)]">
        Journal
      </span>
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10"
      />
    </span>
  </h1>

  <p className="text-[15px] text-foreground/70 max-w-2xl">
    Structured trade logging. Measured in <span className="font-semibold">R</span>.
    Designed for clarity, not ego.
  </p>
</section>
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

const MIN_TRACKED = 5;

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

function computeResultR(
  t: Pick<JournalTrade, "result_r" | "entry_price" | "stop_price" | "exit_price" | "side">
) {
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

/* ---------------- Tooltips (calm, non-jargony) ---------------- */

function RTipBody() {
  return (
    <div className="space-y-2 max-w-sm">
      <div className="font-semibold">What is “R”?</div>
      <div className="text-foreground/70">
        <span className="font-semibold">R</span> means “risk unit.”
      </div>
      <div className="text-foreground/70">
        Your <span className="font-semibold">stop</span> defines how much you’re willing to lose if you’re wrong. That
        amount is <span className="font-semibold">1R</span>.
      </div>
      <div className="text-foreground/70">
        Example: entry 100, stop 98 → risk is 2 points. If you exit at 104, profit is 4 points →{" "}
        <span className="font-semibold">+2R</span>.
      </div>
      <div className="text-foreground/70">R lets you compare trades fairly even when position size changes.</div>
    </div>
  );
}

function EVTipBody() {
  return (
    <div className="space-y-2 max-w-sm">
      <div className="font-semibold">EV (average outcome)</div>
      <div className="text-foreground/70">
        EV is your <span className="font-semibold">average result per trade</span>, measured in R.
      </div>
      <div className="text-foreground/70">Over time: positive EV trends upward; negative EV trends downward.</div>
      <div className="text-foreground/70">This isn’t a guarantee—just the average of what you’ve logged.</div>
    </div>
  );
}

function StopTipBody() {
  return (
    <div className="space-y-2 max-w-xs">
      <div>
        <span className="font-semibold">Stop</span>: the price level that invalidates your trade idea.
      </div>
      <div className="text-foreground/70">It defines where you are wrong and prevents small losses from becoming large ones.</div>
      <div className="text-foreground/70">
        It also defines <span className="font-semibold">1R</span> (your risk unit), so Oren can measure consistency.
      </div>
    </div>
  );
}

function StrategyTipBody() {
  return (
    <div className="space-y-2 max-w-sm">
      <div className="font-semibold">Strategy (optional label)</div>
      <div className="text-foreground/70">A short tag you reuse so Oren can group results.</div>
      <div className="text-foreground/70">
        Keep it plain. Examples:
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>“Breakout”</li>
          <li>“Pullback”</li>
          <li>“Reversal”</li>
          <li>“Trend day”</li>
          <li>“Earnings”</li>
          <li>
            “ORB” <span className="text-foreground/60">(Opening Range Breakout)</span>
          </li>
        </ul>
      </div>
      <div className="text-foreground/70">The goal is consistency: same label for the same idea.</div>
    </div>
  );
}

function TradeIdeaTipBody() {
  return (
    <div className="space-y-2 max-w-sm">
      <div className="font-semibold">Trade idea</div>
      <div className="text-foreground/70">Your “why.” One sentence about what you expected—and what would prove you wrong.</div>
      <div className="text-foreground/70">
        Example: “Price reclaimed VWAP; I expected a push to highs. If it loses VWAP and fails to reclaim, I’m out.”
      </div>
    </div>
  );
}

function SmallSampleTipBody() {
  return (
    <div className="space-y-2 max-w-sm">
      <div className="font-semibold">Small samples</div>
      <div className="text-foreground/70">With only a few trades, results can swing a lot due to randomness.</div>
      <div className="text-foreground/70">
        By default, Oren shows strategies with at least <span className="font-semibold">{MIN_TRACKED}</span> tracked trades.
      </div>
    </div>
  );
}

/* ---------------- UI atoms ---------------- */

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
      <div className="text-sm text-foreground/65">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</div>
      <div className={cn("mt-2 text-[22px] leading-tight font-semibold", valueClass)}>{value}</div>
      {sub && <div className="mt-2 text-sm text-foreground/60">{sub}</div>}
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
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-[15px] text-foreground outline-none placeholder:text-foreground/30"
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
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-[15px] text-foreground outline-none"
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

export default function JournalClient() {
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [strategyStats, setStrategyStats] = useState<StrategyStat[] | null>(null);

  const [err, setErr] = useState<string | null>(null);

  // Strategy display preference
  const [showSmallSamples, setShowSmallSamples] = useState(false);

  // Entry form state
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

    // EV = average outcome per trade (in R)
    const ev = avgR;

    return {
      tradesLogged: trades.length,
      tracked,
      winRate,
      avgR,
      ev,
      totalR,
    };
  }, [trades]);

  const strategyFiltered = useMemo(() => {
    if (!strategyStats) return [];
    if (showSmallSamples) return strategyStats;
    return strategyStats.filter((s) => (s.tracked ?? 0) >= MIN_TRACKED);
  }, [strategyStats, showSmallSamples]);

  const hiddenCount = useMemo(() => {
    if (!strategyStats) return 0;
    const shown = new Set(strategyFiltered.map((s) => s.strategy));
    return strategyStats.filter((s) => !shown.has(s.strategy)).length;
  }, [strategyStats, strategyFiltered]);

  function patchTrade(updated: JournalTrade) {
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function removeTrade(id: string) {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

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

      setExit("");
      setNotes("");

      await refresh();
    } catch {
      setErr("Save failed.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 text-[15px]">
      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-5">
        <Card
          label="Win Rate"
          value={fmtPct01(summary.winRate, 1)}
          sub={summary.tracked ? `${summary.tracked} trades with R` : "—"}
          tip={
            <div className="space-y-2 max-w-sm">
              <div className="font-semibold">Win rate</div>
              <div className="text-foreground/70">
                Computed from trades where Oren can measure the result in <span className="font-semibold">R</span>.
              </div>
              <div className="text-foreground/70">If a trade is missing stop or exit, it may not count here yet.</div>
            </div>
          }
        />
        <Card label="Avg R" value={fmtR(summary.avgR, 3)} tip={<RTipBody />} />
        <Card
          label="EV (average outcome)"
          value={fmtR(summary.ev, 3)}
          tone={toneFromEV(summary.ev)}
          tip={<EVTipBody />}
        />
        <Card label="Total R" value={fmtR(summary.totalR, 2)} tip={<RTipBody />} />
        <Card
          label="Trades Logged"
          value={`${summary.tradesLogged}`}
          sub={summary.tradesLogged ? "All trades" : "—"}
          tip="Total logged trades. Some may be missing fields needed for R calculations."
        />
      </section>

      {/* Entry Form */}
      <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-base font-semibold tracking-tight">Log a trade</div>
            <div className="mt-1 text-[15px] text-foreground/70">Structured input. Calm defaults.</div>
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
            tip={<StopTipBody />}
          />

          <Input label="Exit Price" value={exit} onChange={setExit} type="number" placeholder="194.10" />

          <Input
            label="Strategy (optional)"
            value={strategy}
            onChange={setStrategy}
            placeholder="Breakout / Pullback / Reversal"
            tip={<StrategyTipBody />}
          />

          <div className="sm:col-span-2">
            <label className="text-sm text-foreground/70">
              <Tooltip label="Trade idea (notes)">{<TradeIdeaTipBody />}</Tooltip>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Example: what you expected, what would prove you wrong, and how you executed."
              className="mt-2 min-h-[44px] w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-[15px] text-foreground outline-none placeholder:text-foreground/30"
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

          <div className="text-sm text-foreground/60">
            Tip: To calculate <Tooltip label="R">{<RTipBody />}</Tooltip>, include entry + stop + exit.
          </div>
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
      <ProGate
        lockTitle="Strategy breakdown"
        lockSubtitle="See results grouped by your strategy labels. Small samples can be noisy—Oren filters by default."
        mode="overlay"
      >
        <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-base font-semibold tracking-tight">Strategy Breakdown</div>
              <div className="mt-1 text-[15px] text-foreground/70">
                Grouped results by strategy label. Calm view—designed to reduce overreaction.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-foreground/60">
                <Tooltip label="Small samples">{<SmallSampleTipBody />}</Tooltip>
              </div>

              <button type="button" onClick={() => setShowSmallSamples((v) => !v)} className="oc-btn oc-btn-secondary">
                {showSmallSamples ? "Hide small samples" : "Show small samples"}
              </button>
            </div>
          </div>

          {!loading && isPro && !showSmallSamples && hiddenCount > 0 && (
            <div className="mb-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-[15px] text-foreground/75">
              {hiddenCount} strategy{hiddenCount === 1 ? "" : "ies"} hidden (fewer than {MIN_TRACKED} tracked trades).
            </div>
          )}

          {loading ? (
            <div className="text-[15px] text-foreground/70">Loading…</div>
          ) : !isPro ? (
            <div className="text-[15px] text-foreground/70">Upgrade to unlock strategy analytics.</div>
          ) : !strategyStats || strategyStats.length === 0 ? (
            <div className="text-[15px] text-foreground/70">No strategies yet. Add a strategy label to trades.</div>
          ) : strategyFiltered.length === 0 ? (
            <div className="text-[15px] text-foreground/70">
              No strategies meet the default sample size yet. You can{" "}
              <button className="underline underline-offset-2" onClick={() => setShowSmallSamples(true)}>
                show small samples
              </button>{" "}
              to review early data.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
              <table className="min-w-[860px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Strategy">{<StrategyTipBody />}</Tooltip>
                    </th>
                    <th className="px-4 py-3 font-medium">Trades</th>
                    <th className="px-4 py-3 font-medium">Tracked</th>
                    <th className="px-4 py-3 font-medium">Win Rate</th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Avg R">{<RTipBody />}</Tooltip>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Total R">{<RTipBody />}</Tooltip>
                    </th>
                    <th className="px-4 py-3 font-medium">Largest Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyFiltered.map((s) => {
                    const tone = toneFromEV(s.avgR ?? null);
                    const totalTone = toneFromEV(s.totalR ?? null);
                    const isSmall = (s.tracked ?? 0) < MIN_TRACKED;

                    return (
                      <tr key={s.strategy} className="border-t border-[color:var(--border)]">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span>{s.strategy}</span>
                            {showSmallSamples && isSmall && (
                              <span className="rounded-full border border-amber-800/60 px-2 py-0.5 text-[12px] text-amber-200">
                                small sample
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground/85">{s.trades}</td>
                        <td className="px-4 py-3 text-foreground/85">{s.tracked}</td>
                        <td className="px-4 py-3 text-foreground/85">{s.winRate == null ? "—" : fmtPct01(s.winRate, 1)}</td>
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
      </ProGate>

      {/* Trades Table */}
      <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-base font-semibold tracking-tight">Trades</div>
            <div className="mt-1 text-[15px] text-foreground/70">Most recent trades.</div>
          </div>

          <button type="button" onClick={refresh} className="oc-btn oc-btn-secondary">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-[15px] text-foreground/70">Loading…</div>
        ) : trades.length === 0 ? (
          <div className="text-[15px] text-foreground/70">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
            <table className="min-w-[1120px] w-full text-[15px]">
              <thead>
                <tr className="text-left text-foreground/60">
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Instrument</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Entry</th>
                  <th className="px-4 py-3 font-medium">
                    <Tooltip label="Stop">{<StopTipBody />}</Tooltip>
                  </th>
                  <th className="px-4 py-3 font-medium">Exit</th>
                  <th className="px-4 py-3 font-medium">
                    <Tooltip label="Result (R)">{<RTipBody />}</Tooltip>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Tooltip label="Strategy">{<StrategyTipBody />}</Tooltip>
                  </th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
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
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <JournalTradeActions
                            trade={t}
                            onUpdated={(updated: Record<string, any>) => patchTrade(updated as JournalTrade)}
                            onDeleted={(id: string) => removeTrade(id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && trades.length > 0 && (
          <div className="mt-3 text-sm text-foreground/55">
            Note: Strategy breakdown updates on refresh. Small samples can be noisy.
          </div>
        )}
      </section>
    </div>
  );
}