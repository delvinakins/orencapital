"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";

type InstrumentType = "stock" | "option" | "future" | "crypto" | "fx" | "other";

type Trade = {
  id: string;
  symbol: string;
  side: "long" | "short";
  instrument: InstrumentType; // ✅ new
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

/* ---------------- Helpers ---------------- */

function fmt(n: number, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ---------------- UI Primitives (match Variance) ---------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  tip,
  type = "text",
  inputMode,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tip?: ReactNode;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none placeholder:text-foreground/30"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  tip,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tip?: ReactNode;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </label>
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

function Card({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: ReactNode;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "warn";
}) {
  // Institutional feel: no big red blocks. "warn" uses amber border/text only.
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
    <div className={`rounded-xl border ${toneClass} bg-[color:var(--card)] p-5 sm:p-6`}>
      <div className="text-xs text-foreground/60">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-foreground/60">{sub}</div>}
    </div>
  );
}

function toneFromEV(evR: number): "accent" | "neutral" | "warn" {
  if (!Number.isFinite(evR)) return "neutral";
  if (evR < 0) return "warn";
  if (evR >= 0.05) return "accent";
  return "neutral";
}

function labelInstrument(x: InstrumentType) {
  switch (x) {
    case "stock":
      return "Stock";
    case "option":
      return "Option";
    case "future":
      return "Future";
    case "crypto":
      return "Crypto";
    case "fx":
      return "FX";
    default:
      return "Other";
  }
}

/* ---------------- Component ---------------- */

export default function JournalClient() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Phase 1 form (minimal)
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [instrument, setInstrument] = useState<InstrumentType>("stock"); // ✅ new
  const [resultR, setResultR] = useState<string>("");

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
      instrument, // ✅ new
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
    setInstrument("stock");
    setResultR("");
    await load();
  }

  const metrics = useMemo(() => {
    const closed = trades.filter((t) => typeof t.result_r === "number" && t.result_r !== null);

    const n = closed.length;
    const wins = closed.filter((t) => (t.result_r ?? 0) > 0).length;
    const winRate = n > 0 ? wins / n : 0;

    const totalR = closed.reduce((acc, t) => acc + (t.result_r ?? 0), 0);
    const avgR = n > 0 ? totalR / n : 0;

    // Phase 1 EV per trade = avgR
    const ev = avgR;

    const lowSample = n > 0 && n < 10;

    return {
      tradesLogged: trades.length,
      closedTrades: n,
      winRate,
      avgR,
      ev,
      totalR,
      lowSample,
    };
  }, [trades]);

  return (
    <div className="space-y-8">
      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card
          label={
            <span className="inline-flex items-center gap-2">
              Win Rate
              <span className="text-foreground/70">
                <Tooltip label="Win Rate">
                  Percent of closed trades with R &gt; 0. Open trades excluded.
                </Tooltip>
              </span>
            </span>
          }
          value={`${Math.round(metrics.winRate * 100)}%`}
          tone={metrics.lowSample ? "warn" : "neutral"}
          sub={metrics.closedTrades ? `Closed: ${metrics.closedTrades}` : "No closed trades yet"}
        />

        <Card
          label={
            <span className="inline-flex items-center gap-2">
              Avg R
              <span className="text-foreground/70">
                <Tooltip label="Avg R">
                  Average realized R across closed trades. Phase 1 uses result_r (manual or auto-computed).
                </Tooltip>
              </span>
            </span>
          }
          value={fmt(metrics.avgR)}
          tone={metrics.avgR < 0 ? "warn" : metrics.avgR > 0 ? "accent" : "neutral"}
          sub={metrics.lowSample ? "Low sample: interpret cautiously." : "Stability increases with data."}
        />

        <Card
          label={
            <span className="inline-flex items-center gap-2">
              EV
              <span className="text-foreground/70">
                <Tooltip label="EV (Phase 1)">Phase 1 EV = Avg R per trade. Rolling metrics later (Pro).</Tooltip>
              </span>
            </span>
          }
          value={fmt(metrics.ev)}
          tone={toneFromEV(metrics.ev)}
          sub="Per-trade expectancy (R)."
        />

        <Card
          label={
            <span className="inline-flex items-center gap-2">
              Total R
              <span className="text-foreground/70">
                <Tooltip label="Total R">Sum of realized R across closed trades.</Tooltip>
              </span>
            </span>
          }
          value={fmt(metrics.totalR)}
          tone={metrics.totalR < 0 ? "warn" : metrics.totalR > 0 ? "accent" : "neutral"}
          sub="Direction over time."
        />

        <Card
          label={
            <span className="inline-flex items-center gap-2">
              Trades Logged
              <span className="text-foreground/70">
                <Tooltip label="Trades Logged">All journal entries (open + closed).</Tooltip>
              </span>
            </span>
          }
          value={`${metrics.tradesLogged}`}
          sub={loading ? "Syncing…" : "Synced"}
        />
      </section>

      {/* Entry */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-tight">Log Trade</div>
            <div className="text-sm text-foreground/70">Minimal capture now. Add entry/stop/exit, strategy, notes next.</div>
          </div>

          {metrics.lowSample ? (
            <div className="rounded-xl border border-amber-800/60 bg-[color:var(--card)] px-4 py-3 text-xs text-foreground/70">
              <div className="text-amber-200">Structural note</div>
              <div className="mt-1 text-foreground/70">Sample is small. Aim for 20+ closed trades for stability.</div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
          <form onSubmit={saveTrade} className="grid gap-4 sm:grid-cols-4">
            <Field
              label="Symbol"
              value={symbol}
              onChange={setSymbol}
              placeholder="ES, NQ, AAPL…"
              required
              tip="Ticker or contract shorthand. Stored uppercased."
            />

            <SelectField
              label="Instrument"
              value={instrument}
              onChange={(v) => setInstrument(v as InstrumentType)}
              tip={
                <div className="space-y-2">
                  <div>Separates stocks from options/futures for cleaner analytics later.</div>
                  <div className="text-foreground/70">Pro will add instrument filters and rolling metrics.</div>
                </div>
              }
              options={[
                { label: "Stock", value: "stock" },
                { label: "Option", value: "option" },
                { label: "Future", value: "future" },
                { label: "Crypto", value: "crypto" },
                { label: "FX", value: "fx" },
                { label: "Other", value: "other" },
              ]}
            />

            <SelectField
              label="Side"
              value={side}
              onChange={(v) => setSide(v as any)}
              tip="Long = profit if price rises. Short = profit if price falls."
              options={[
                { label: "Long", value: "long" },
                { label: "Short", value: "short" },
              ]}
            />

            <Field
              label="Result (R)"
              value={resultR}
              onChange={setResultR}
              placeholder="e.g. 1.20"
              type="number"
              inputMode="decimal"
              tip={
                <div className="space-y-2">
                  <div>Optional realized R multiple.</div>
                  <div className="text-foreground/70">Later: entry/stop/exit can compute result_r automatically.</div>
                </div>
              }
            />

            <div className="sm:col-span-4 flex items-center justify-end pt-1">
              <button type="submit" className="oc-btn oc-btn-primary">
                Save Trade
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold tracking-tight">Trades</div>
          <button onClick={load} className="oc-btn oc-btn-secondary">
            Refresh
          </button>
        </div>

        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs text-foreground/60">
                <tr className="border-b border-[color:var(--border)]">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Result (R)</th>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>

              <tbody>
                {trades.map((t) => {
                  const r = t.result_r ?? null;
                  const tone =
                    typeof r === "number"
                      ? r < 0
                        ? "warn"
                        : r >= 0.05
                        ? "accent"
                        : "neutral"
                      : "neutral";

                  const rClass =
                    tone === "accent"
                      ? "text-[color:var(--accent)]"
                      : tone === "warn"
                      ? "text-amber-200"
                      : "text-foreground";

                  return (
                    <tr key={t.id} className="border-b border-[color:var(--border)]/60 hover:bg-white/5">
                      <td className="px-4 py-3 text-xs text-foreground/60">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium">{t.symbol}</td>
                      <td className="px-4 py-3 text-foreground/80">{labelInstrument(t.instrument)}</td>
                      <td className="px-4 py-3 text-foreground/80">{t.side}</td>
                      <td className={cn("px-4 py-3 font-semibold", rClass)}>{r === null ? "—" : fmt(r)}</td>
                      <td className="px-4 py-3 text-foreground/80">{t.strategy ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground/80">{t.notes ?? "—"}</td>
                    </tr>
                  );
                })}

                {!loading && trades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-foreground/70">
                      No trades yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 text-xs text-foreground/60">
            <div>
              Showing <span className="text-foreground">{trades.length}</span> most recent trades
            </div>
            <div className="text-foreground/60">Pro adds filters, rolling metrics, export, and equity curve.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
