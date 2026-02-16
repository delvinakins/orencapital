"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import JournalPanel from "@/components/JournalPanel";
import { Tooltip } from "@/components/Tooltip";
import ProLock from "@/components/ProLock";

type SizingMode = "constant-fraction" | "fixed-dollar";
type Side = "long" | "short";

type Position = {
  id: string;
  label: string;
  side: Side;
  entry: string;
  stop: string;
  qty: string;
  multiplier: string;
};

type PortfolioRow = {
  id: string;
  name: string;
  updated_at?: string;
  created_at?: string;
  data?: any;
};

function money(n: number) {
  if (!isFinite(n)) return "$0";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function pct(n: number) {
  if (!isFinite(n)) return "0%";
  return `${(n * 100).toFixed(2)}%`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
      <label className="text-sm text-slate-400">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-slate-800 bg-slate-900 px-4 text-slate-100 outline-none focus:ring-2 focus:ring-slate-600"
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
      <label className="text-sm text-slate-400">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-slate-800 bg-slate-900 px-4 text-slate-100 outline-none focus:ring-2 focus:ring-slate-600"
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
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  tip?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6">
      <div className="text-xs text-slate-500">
        {tip ? <Tooltip label={label}>{tip}</Tooltip> : label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function toNumber(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function calcDollarRisk(p: Position) {
  const entry = toNumber(p.entry);
  const stop = toNumber(p.stop);
  const qty = Math.max(0, toNumber(p.qty));
  const mult = Math.max(1, toNumber(p.multiplier) || 1);

  const perUnit = Math.abs(entry - stop);
  return perUnit * qty * mult;
}

function calcStopDistancePct(p: Position) {
  const entry = toNumber(p.entry);
  const stop = toNumber(p.stop);
  if (entry <= 0) return 0;
  return Math.abs(entry - stop) / entry;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RiskEnginePage() {
  // Pro status (server truth)
  const [isPro, setIsPro] = useState(false);
  const [proStatus, setProStatus] = useState("");

  // Core inputs
  const [accountSize, setAccountSize] = useState("10000");
  const [sizingMode, setSizingMode] = useState<SizingMode>("constant-fraction");
  const [riskPct, setRiskPct] = useState("1");
  const [fixedRisk, setFixedRisk] = useState("100");

  // Positions
  const [positions, setPositions] = useState<Position[]>([
    {
      id: uid(),
      label: "AAPL",
      side: "long",
      entry: "190",
      stop: "185",
      qty: "10",
      multiplier: "1",
    },
  ]);

  // Pro portfolio save/load state
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");
  const [busy, setBusy] = useState<null | "list" | "save" | "load">(null);
  const [msg, setMsg] = useState<string>("");

  // Load Pro status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pro/status");
        const json = await res.json().catch(() => ({}));
        setIsPro(!!json?.isPro);
        setProStatus(json?.status ? String(json.status) : "");
      } catch {
        setIsPro(false);
      }
    })();
  }, []);

  const account = Math.max(0, toNumber(accountSize));

  const perTradeRiskDollars = useMemo(() => {
    if (sizingMode === "fixed-dollar") return Math.max(0, toNumber(fixedRisk));
    const rp = Math.max(0, toNumber(riskPct)) / 100;
    return account * rp;
  }, [account, sizingMode, fixedRisk, riskPct]);

  const totals = useMemo(() => {
    const rows = positions.map((p) => ({
      id: p.id,
      label: p.label,
      riskDollars: calcDollarRisk(p),
      stopDistPct: calcStopDistancePct(p),
    }));

    const totalRisk = rows.reduce((sum, r) => sum + r.riskDollars, 0);
    const totalRiskPct = account > 0 ? totalRisk / account : 0;

    return { rows, totalRisk, totalRiskPct };
  }, [positions, account]);

  const targetDollarRisk = perTradeRiskDollars;

  const riskOk = useMemo(() => {
    if (targetDollarRisk <= 0) return false;
    return totals.totalRisk <= targetDollarRisk * 1.05;
  }, [totals.totalRisk, targetDollarRisk]);

  function addPosition() {
    setPositions((prev) => [
      ...prev,
      {
        id: uid(),
        label: "",
        side: "long",
        entry: "",
        stop: "",
        qty: "",
        multiplier: "1",
      },
    ]);
  }

  function updatePos(id: string, patch: Partial<Position>) {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePos(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  // -------- Pro: portfolios list/save/load ----------
  async function refreshPortfolios() {
    try {
      setMsg("");
      setBusy("list");
      const res = await fetch("/api/portfolios/list");
      const json = await res.json().catch(() => ({}));

      if (res.status === 402) {
        setMsg("Pro required for Save/Load portfolios.");
        setBusy(null);
        return;
      }

      if (!res.ok) {
        setMsg(json?.error || "Could not load portfolios.");
        setBusy(null);
        return;
      }

      setPortfolios((json?.items ?? []) as PortfolioRow[]);
      setBusy(null);
    } catch (e: any) {
      setBusy(null);
      setMsg(e?.message || "Could not load portfolios.");
    }
  }

  async function savePortfolio() {
    try {
      setMsg("");
      setBusy("save");

      const name = portfolioName.trim();
      if (!name) {
        setMsg("Name your portfolio first.");
        setBusy(null);
        return;
      }

      const payload = {
        name,
        data: {
          accountSize,
          sizingMode,
          riskPct,
          fixedRisk,
          positions,
          savedAt: new Date().toISOString(),
        },
      };

      const res = await fetch("/api/portfolios/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 402) {
        setMsg("Pro required to Save/Load portfolios.");
        setBusy(null);
        return;
      }

      if (!res.ok) {
        setMsg(json?.error || "Save failed.");
        setBusy(null);
        return;
      }

      setMsg("Portfolio saved ✅");
      setBusy(null);
      await refreshPortfolios();
    } catch (e: any) {
      setBusy(null);
      setMsg(e?.message || "Save failed.");
    }
  }

  async function loadPortfolio() {
    try {
      setMsg("");
      setBusy("load");

      if (!selectedPortfolioId) {
        setMsg("Select a portfolio to load.");
        setBusy(null);
        return;
      }

      const res = await fetch(`/api/portfolios/get?id=${encodeURIComponent(selectedPortfolioId)}`);
      const json = await res.json().catch(() => ({}));

      if (res.status === 402) {
        setMsg("Pro required to Save/Load portfolios.");
        setBusy(null);
        return;
      }

      if (!res.ok) {
        setMsg(json?.error || "Load failed.");
        setBusy(null);
        return;
      }

      const data = json?.item?.data || json?.item || null;
      if (!data) {
        setMsg("Load failed: no data returned.");
        setBusy(null);
        return;
      }

      const p = data.data ? data.data : data;

      setAccountSize(String(p.accountSize ?? "10000"));
      setSizingMode((p.sizingMode as SizingMode) ?? "constant-fraction");
      setRiskPct(String(p.riskPct ?? "1"));
      setFixedRisk(String(p.fixedRisk ?? "100"));
      setPositions(Array.isArray(p.positions) ? p.positions : []);

      setMsg("Portfolio loaded ✅");
      setBusy(null);
    } catch (e: any) {
      setBusy(null);
      setMsg(e?.message || "Load failed.");
    }
  }

  useEffect(() => {
    if (isPro) refreshPortfolios().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  function exportCsv() {
    // Keep server-truth protection even though UI is overlaid.
    if (!isPro) {
      setMsg("CSV export is Pro. Upgrade to unlock.");
      return;
    }

    const headers = ["Label", "Side", "Entry", "Stop", "Qty", "Multiplier", "DollarRisk"];
    const lines = [
      headers.join(","),
      ...positions.map((p) => {
        const dr = calcDollarRisk(p);
        return [
          (p.label || "").replaceAll(",", " "),
          p.side,
          p.entry,
          p.stop,
          p.qty,
          p.multiplier,
          dr.toFixed(2),
        ].join(",");
      }),
    ];

    downloadText("oren-risk-engine.csv", lines.join("\n"));
    setMsg("CSV exported ✅");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8 sm:space-y-10">
        <header className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Risk Engine</h1>
              <p className="mt-2 text-sm text-slate-400">
                Build positions with intention: quantify risk, then decide if it’s worth taking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-slate-400">
                Plan:{" "}
                <span className={isPro ? "text-green-400" : "text-slate-300"}>
                  {isPro ? `Pro (${proStatus || "active"})` : "Free"}
                </span>
              </div>

              {!isPro && (
                <Link
                  href="/pricing"
                  className="inline-flex items-center rounded-lg border border-slate-800 px-3 py-2 text-sm hover:bg-slate-900"
                >
                  Upgrade
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <Link
              href="/variance"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-800 px-4 text-sm hover:bg-slate-900"
            >
              Variance Simulator →
            </Link>

            <Link
              href={`/variance?account=${encodeURIComponent(accountSize)}&risk=${encodeURIComponent(
                sizingMode === "constant-fraction" ? riskPct : "1"
              )}`}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white"
            >
              Run simulator with these settings
            </Link>
          </div>
        </header>

        {/* Controls */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Account Size ($)"
            value={accountSize}
            onChange={setAccountSize}
            type="number"
            tip="Your total account equity. Position risk is measured relative to this."
          />

          <Select
            label="Sizing Mode"
            value={sizingMode}
            onChange={(v) => setSizingMode(v as SizingMode)}
            options={[
              { value: "constant-fraction", label: "Constant-fraction (risk %)" },
              { value: "fixed-dollar", label: "Fixed-dollar ($ risk)" },
            ]}
            tip={
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Constant-fraction</span>: risk scales with equity (classic “risk 1% per
                  trade”).
                </div>
                <div>
                  <span className="font-semibold">Fixed-dollar</span>: risk a flat $ each trade (emotionally simpler early
                  on).
                </div>
              </div>
            }
          />

          {sizingMode === "constant-fraction" ? (
            <Input
              label="Risk % per trade"
              value={riskPct}
              onChange={setRiskPct}
              type="number"
              tip="Target risk per trade as a % of your account. Example: 1% of $10,000 = $100."
            />
          ) : (
            <Input
              label="Fixed $ risk per trade"
              value={fixedRisk}
              onChange={setFixedRisk}
              type="number"
              tip="Target risk per trade in dollars (flat). Example: $50 risk per trade regardless of account size."
            />
          )}
        </section>

        {/* Summary */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card
            label="Target Dollar Risk"
            value={money(targetDollarRisk)}
            tip="How much you *intend* to risk on this trade idea (based on sizing mode)."
          />
          <Card
            label="Current Total Risk"
            value={money(totals.totalRisk)}
            sub={`= ${pct(totals.totalRiskPct)} of account`}
            tip="Sum of all position risks (|entry - stop| × qty × multiplier)."
          />
          <Card
            label="Risk Check"
            value={riskOk ? "Within target ✅" : "Over target ⚠️"}
            sub={riskOk ? "Looks reasonable." : "Reduce size or tighten stops."}
            tip="If positions risk more than your target, you’re more likely to panic at the worst time."
          />
        </section>

        {/* Positions */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 sm:p-6 space-y-4 overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Positions</div>
            <button
              onClick={addPosition}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-4 text-sm font-medium text-slate-200 hover:bg-slate-900"
            >
              + Add position
            </button>
          </div>

          <div className="space-y-3">
            {positions.map((p) => {
              const dr = calcDollarRisk(p);
              const distPct = calcStopDistancePct(p);

              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/30 p-4 space-y-3 overflow-visible"
                >
                  <div className="grid gap-3 md:grid-cols-6">
                    <Input
                      label="Label"
                      value={p.label}
                      onChange={(v) => updatePos(p.id, { label: v })}
                      placeholder="AAPL"
                      type="text"
                      tip='Ticker or nickname. Letters + numbers allowed (e.g., "AAPL", "SPY-1").'
                    />

                    <Select
                      label="Side"
                      value={p.side}
                      onChange={(v) => updatePos(p.id, { side: v as Side })}
                      options={[
                        { value: "long", label: "Long" },
                        { value: "short", label: "Short" },
                      ]}
                      tip="Side changes your trade logic, but risk magnitude is still entry-to-stop distance."
                    />

                    <Input
                      label="Entry Price"
                      value={p.entry}
                      onChange={(v) => updatePos(p.id, { entry: v })}
                      type="number"
                      placeholder="190"
                      tip="Your planned entry. Risk is measured from entry to stop."
                    />

                    <Input
                      label="Stop Price"
                      value={p.stop}
                      onChange={(v) => updatePos(p.id, { stop: v })}
                      type="number"
                      placeholder="185"
                      tip="Your invalidation level. If the stop is vague, the risk math is fake."
                    />

                    <Input
                      label="Qty"
                      value={p.qty}
                      onChange={(v) => updatePos(p.id, { qty: v })}
                      type="number"
                      placeholder="10"
                      tip="Shares or contracts. Risk scales linearly with size."
                    />

                    <Input
                      label="Multiplier"
                      value={p.multiplier}
                      onChange={(v) => updatePos(p.id, { multiplier: v })}
                      type="number"
                      placeholder="1"
                      tip="Stocks: 1. Options: typically 100."
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card
                      label="Position Dollar Risk"
                      value={money(dr)}
                      tip="Computed as |entry - stop| × qty × multiplier."
                    />
                    <Card label="Stop Distance" value={pct(distPct)} tip="Distance from entry to stop as a % of entry." />
                    <Card
                      label="Target Alignment"
                      value={
                        targetDollarRisk > 0 ? `${Math.round((dr / targetDollarRisk) * 100)}% of target` : "—"
                      }
                      tip="How much this single position consumes of your intended trade risk."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-xs text-slate-500">Tip: Over target? Reduce size first (fastest fix).</div>
                    <button
                      onClick={() => removePos(p.id)}
                      className="text-sm text-red-300 hover:text-red-200 self-start sm:self-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pro: CSV Export overlay */}
          <ProLock
            feature="CSV Export"
            description="Export your positions + risk metrics to CSV for tracking, journaling, or analysis."
            mode="overlay"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                onClick={exportCsv}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-4 text-sm font-medium text-slate-200 hover:bg-slate-900"
              >
                Export CSV (Pro)
              </button>
              <div className="text-xs text-slate-500">
                CSV export is Pro because it’s an “operational workflow” feature.
              </div>
            </div>
          </ProLock>
        </section>

        {/* Pro: Save / Load overlay */}
        <ProLock
          feature="Portfolio Save/Load"
          description="Save setups (account + sizing + positions) and reload them instantly."
          mode="overlay"
        >
          <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 sm:p-6 space-y-4 overflow-visible">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold">Save / Load Portfolios (Pro)</div>
              <button
                onClick={refreshPortfolios}
                disabled={busy === "list"}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-4 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-60"
              >
                {busy === "list" ? "Refreshing..." : "Refresh list"}
              </button>
            </div>

            {!!msg && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">{msg}</div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Portfolio name"
                value={portfolioName}
                onChange={setPortfolioName}
                placeholder="My swing watchlist"
                tip="Name to save this current state (account + sizing + positions)."
              />

              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-sm text-slate-400">
                  <Tooltip label="Saved portfolios">
                    Your saved configurations. Loading replaces the current editor state.
                  </Tooltip>
                </label>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedPortfolioId}
                    onChange={(e) => setSelectedPortfolioId(e.target.value)}
                    className="h-12 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-4 text-slate-100 outline-none focus:ring-2 focus:ring-slate-600"
                  >
                    <option value="">Select…</option>
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={savePortfolio}
                    disabled={busy === "save"}
                    className="inline-flex h-12 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white disabled:opacity-60"
                  >
                    {busy === "save" ? "Saving..." : "Save"}
                  </button>

                  <button
                    onClick={loadPortfolio}
                    disabled={busy === "load"}
                    className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-4 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-60"
                  >
                    {busy === "load" ? "Loading..." : "Load"}
                  </button>
                </div>

                {!isPro && (
                  <div className="text-xs text-amber-200">
                    Pro required. This is a “workflow” feature (people pay for saving time).
                  </div>
                )}
              </div>
            </div>
          </section>
        </ProLock>

        {/* Pro: Trade Journal (snapshots + notes) */}
        <JournalPanel
          isPro={isPro}
          snapshot={{
            accountSize,
            sizingMode,
            riskPct,
            fixedRisk,
            positions,
            totals: {
              targetDollarRisk,
              totalRisk: totals.totalRisk,
              totalRiskPct: totals.totalRiskPct,
            },
            savedFrom: "risk-engine",
          }}
        />
      </div>
    </main>
  );
}
