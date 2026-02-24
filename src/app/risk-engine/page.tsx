"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import JournalPanel from "@/components/JournalPanel";
import JournalQuickAdd from "@/components/journal/JournalQuickAdd";

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

/* =========================================================
   Tooltip (local) — matches pine tokens + accent hover
========================================================= */
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!open) return;
      const el = tipRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep tooltip inside viewport
  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;

    box.style.transform = "translateX(-50%)";
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;

      let dx = 0;
      if (r.left < pad) dx = pad - r.left;
      if (r.right > vw - pad) dx = vw - pad - r.right;

      if (dx !== 0) box.style.transform = `translateX(calc(-50% + ${dx}px))`;
    });
  }, [open]);

  return (
    <span className="inline-flex items-center gap-2" ref={tipRef}>
      <span>{label}</span>

      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={`Help: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="
            inline-flex h-5 w-5 items-center justify-center
            rounded-full
            border border-[color:var(--border)]
            bg-[color:var(--card)]
            text-[11px] text-foreground/80
            hover:border-[color:var(--accent)]
            hover:text-[color:var(--accent)]
            active:scale-[0.98]
            transition-colors
          "
        >
          i
        </button>

        {open && (
          <div
            ref={boxRef}
            role="dialog"
            aria-label={`${label} help`}
            onClick={(e) => e.stopPropagation()}
            className="
              absolute left-1/2 top-[140%] z-50
              w-[min(360px,85vw)]
              -translate-x-1/2
              rounded-xl
              border border-[color:var(--border)]
              bg-[color:var(--background)]
              px-3 py-2
              text-xs text-foreground/90
              shadow-2xl shadow-black/40
            "
          >
            {children}
            <div className="mt-2 text-[11px] text-foreground/60">Tap outside to close</div>
          </div>
        )}
      </span>
    </span>
  );
}

/* =========================================================
   UI Atoms
========================================================= */
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

function Card({
  label,
  value,
  sub,
  tip,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tip?: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-800/60"
      : tone === "warn"
      ? "border-amber-800/60"
      : "border-[color:var(--border)]";

  return (
    <div className={`oc-glass rounded-xl p-5 sm:p-6 ${toneClass}`}>
      <div className="text-xs text-foreground/60">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-2 text-xs text-foreground/60">{sub}</div>}
    </div>
  );
}

/* =========================================================
   Math
========================================================= */
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

function InlineProNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/60 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-foreground/80">{children}</div>
        <Link href="/pricing" className="oc-btn oc-btn-secondary self-start sm:self-auto">
          Upgrade
        </Link>
      </div>
    </div>
  );
}

/* =========================================================
   Page
========================================================= */
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
    { id: uid(), label: "AAPL", side: "long", entry: "190", stop: "185", qty: "10", multiplier: "1" },
  ]);

  // Portfolio save/load state (Pro)
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");
  const [busy, setBusy] = useState<null | "list" | "save" | "load">(null);
  const [msg, setMsg] = useState<string>("");

  // Load Pro status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pro/status", { cache: "no-store" });
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
    setPositions((prev) => [...prev, { id: uid(), label: "", side: "long", entry: "", stop: "", qty: "", multiplier: "1" }]);
  }

  function updatePos(id: string, patch: Partial<Position>) {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePos(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  // -------- Portfolios list/save/load (Pro) ----------
  async function refreshPortfolios() {
    try {
      setMsg("");
      setBusy("list");
      const res = await fetch("/api/portfolios/list", { cache: "no-store" });
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
    if (!isPro) {
      setMsg("Pro required to Save/Load portfolios.");
      return;
    }

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
    if (!isPro) {
      setMsg("Pro required to Save/Load portfolios.");
      return;
    }

    try {
      setMsg("");
      setBusy("load");

      if (!selectedPortfolioId) {
        setMsg("Select a portfolio to load.");
        setBusy(null);
        return;
      }

      const res = await fetch(`/api/portfolios/get?id=${encodeURIComponent(selectedPortfolioId)}`, { cache: "no-store" });
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

  // CSV Export = FREE
  function exportCsv() {
    const headers = ["Label", "Side", "Entry", "Stop", "Qty", "Multiplier", "DollarRisk"];
    const lines = [
      headers.join(","),
      ...positions.map((p) => {
        const dr = calcDollarRisk(p);
        return [(p.label || "").replaceAll(",", " "), p.side, p.entry, p.stop, p.qty, p.multiplier, dr.toFixed(2)].join(",");
      }),
    ];

    downloadText("oren-risk-engine.csv", lines.join("\n"));
    setMsg("CSV exported ✅");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8 sm:space-y-10">
        <header className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Risk Engine</h1>
              <p className="mt-2 text-sm text-foreground/70">
                Build positions with intention: quantify risk, then decide if it’s worth taking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-foreground/60">
                Plan:{" "}
                <span className={isPro ? "text-emerald-300" : "text-foreground/80"}>
                  {isPro ? `Pro (${proStatus || "active"})` : "Free"}
                </span>
              </div>

              {!isPro && (
                <Link href="/pricing" className="oc-btn oc-btn-secondary">
                  Upgrade
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <Link href="/variance" className="oc-btn oc-btn-secondary">
              Variance Simulator →
            </Link>

            <Link
              href={`/variance?account=${encodeURIComponent(accountSize)}&risk=${encodeURIComponent(
                sizingMode === "constant-fraction" ? riskPct : "1"
              )}`}
              className="oc-btn oc-btn-accent"
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
                  <span className="font-semibold">Constant-fraction</span>: risk scales with equity (classic “risk 1% per trade”).
                </div>
                <div>
                  <span className="font-semibold">Fixed-dollar</span>: risk a flat $ each trade (emotionally simpler early on).
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
          <Card label="Target Dollar Risk" value={money(targetDollarRisk)} tip="How much you intend to risk on this trade idea (based on sizing mode)." />
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
            tone={riskOk ? "good" : "warn"}
            tip="If positions risk more than your target, you’re more likely to panic at the worst time."
          />
        </section>

        {/* Positions */}
        <section className="oc-glass rounded-2xl p-4 sm:p-6 space-y-4 overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Positions</div>
            <button onClick={addPosition} className="oc-btn oc-btn-secondary">
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
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/55 backdrop-blur-[2px] p-4 space-y-3 overflow-visible"
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
                    <Card label="Position Dollar Risk" value={money(dr)} tip="Computed as |entry - stop| × qty × multiplier." />
                    <Card label="Stop Distance" value={pct(distPct)} tip="Distance from entry to stop as a % of entry." />
                    <Card
                      label="Target Alignment"
                      value={targetDollarRisk > 0 ? `${Math.round((dr / targetDollarRisk) * 100)}% of target` : "—"}
                      tip="How much this single position consumes of your intended trade risk."
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-xs text-foreground/60">Tip: Over target? Reduce size first (fastest fix).</div>
                    <button
                      onClick={() => removePos(p.id)}
                      className="text-sm text-foreground/70 hover:text-foreground self-start sm:self-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CSV Export (FREE) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-foreground/55">Export positions + risk metrics for tracking, journaling, or analysis.</div>
            <button onClick={exportCsv} className="oc-btn oc-btn-secondary">
              Export CSV
            </button>
          </div>
        </section>

        {/* Save / Load (PRO) */}
        <section className="oc-glass rounded-2xl p-4 sm:p-6 space-y-4 overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Save / Load Portfolios</div>
              <div className="mt-1 text-xs text-foreground/55">Save setups (account + sizing + positions) and reload them instantly.</div>
            </div>

            <button
              onClick={refreshPortfolios}
              disabled={!isPro || busy === "list"}
              className="oc-btn oc-btn-secondary disabled:opacity-60"
              title={!isPro ? "Pro required" : undefined}
            >
              {busy === "list" ? "Refreshing..." : "Refresh list"}
            </button>
          </div>

          {!isPro && (
            <InlineProNotice>
              <span className="text-foreground/80">Pro required:</span>{" "}
              <span className="text-foreground/60">Save/load is a workflow feature.</span>
            </InlineProNotice>
          )}

          {!!msg && (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/55 backdrop-blur-[2px] p-3 text-sm text-foreground">
              {msg}
            </div>
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
              <label className="text-sm text-foreground/70">
                <Tooltip label="Saved portfolios">Your saved configurations. Loading replaces the current editor state.</Tooltip>
              </label>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedPortfolioId}
                  onChange={(e) => setSelectedPortfolioId(e.target.value)}
                  disabled={!isPro}
                  className="h-12 flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 text-foreground outline-none disabled:opacity-60"
                >
                  <option value="">Select…</option>
                  {portfolios.map((pp) => (
                    <option key={pp.id} value={pp.id}>
                      {pp.name}
                    </option>
                  ))}
                </select>

                <button onClick={savePortfolio} disabled={!isPro || busy === "save"} className="oc-btn oc-btn-accent disabled:opacity-60">
                  {busy === "save" ? "Saving..." : "Save"}
                </button>

                <button onClick={loadPortfolio} disabled={!isPro || busy === "load"} className="oc-btn oc-btn-secondary disabled:opacity-60">
                  {busy === "load" ? "Loading..." : "Load"}
                </button>
              </div>

              <div className="text-xs text-foreground/55">
                {isPro ? "Saved portfolios are tied to your account." : "Upgrade to save setups and reload them instantly."}
              </div>
            </div>
          </div>
        </section>

        {/* Journal panel (existing) */}
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

        {/* OpenAI: Natural-language → Journal preview/apply/save */}
        <JournalQuickAdd />
      </div>
    </main>
  );
}