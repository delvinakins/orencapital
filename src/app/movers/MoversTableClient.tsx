"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
};

function pct(x: number | null) {
  if (x == null) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

function Arrow({ v }: { v: number | null }) {
  if (v == null || v === 0) return null;
  const up = v > 0;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center ${
        up ? "text-emerald-400" : "text-rose-400"
      }`}
      title={up ? "Up on the session" : "Down on the session"}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}

function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-50 w-64 -translate-x-1/2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-foreground/80 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function Tag({ v }: { v: Row["structuralRiskTag"] }) {
  // keep your existing palette, just bump size a bit
  const cls =
    v === "Green"
      ? "border-emerald-700/40 bg-emerald-600/10 text-emerald-200"
      : v === "Amber"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-200"
      : "border-rose-700/40 bg-rose-600/10 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide ${cls}`}
    >
      {v}
    </span>
  );
}

function VolTag({ v }: { v: Row["dayVolTag"] }) {
  const cls =
    v === "Normal"
      ? "border-[color:var(--border)] bg-white/5 text-foreground/80"
      : v === "High"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-200"
      : "border-rose-700/40 bg-rose-600/10 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide ${cls}`}
    >
      {v}
    </span>
  );
}

// If you already wired a session date pill upstream, keep it.
// This fallback just shows "Today" to avoid breaking builds.
function SessionPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-white/5 px-3 py-1 text-xs font-semibold text-foreground/80">
      {label}
    </span>
  );
}

export default function MoversTableClient() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/market/movers?limit=10`, {
          cache: "no-store",
        });
        const json = await res.json();
        const r = (json?.rows ?? []) as Row[];
        if (alive) setRows(r);
      } catch {
        if (alive) setRows([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // TODO: replace this with your exchange-calendar label (session date pill rendered ONCE above Symbol)
  const sessionLabel = "Session";

  const body = useMemo(() => {
    if (rows === null) {
      return (
        <div className="px-5 py-7 text-base text-foreground/70">Loading…</div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="px-5 py-7 text-base text-foreground/70">
          No data right now.
        </div>
      );
    }

    return rows.map((r) => (
      <div
        key={r.symbol}
        className="grid grid-cols-10 gap-4 border-b border-[color:var(--border)] px-5 py-5 text-base text-foreground/80 last:border-b-0"
      >
        {/* Symbol */}
        <div className="col-span-3">
          <div className="font-semibold tracking-tight text-foreground">
            {r.symbol}
          </div>
          {r.price != null ? (
            <div className="mt-1 text-sm text-foreground/60">
              ${r.price.toFixed(2)}
            </div>
          ) : (
            <div className="mt-1 text-sm text-foreground/60">—</div>
          )}
        </div>

        {/* Change */}
        <div className="col-span-2">
          <div className="inline-flex items-center gap-2 font-semibold text-foreground">
            <Arrow v={r.changePct} />
            {pct(r.changePct)}
          </div>
          <div className="mt-1 text-sm text-foreground/60">Change</div>
        </div>

        {/* Range */}
        <div className="col-span-2">
          <div className="font-semibold text-foreground">{pct(r.rangePct)}</div>
          <div className="mt-1 text-sm text-foreground/60">Intraday range</div>
        </div>

        {/* Day Vol */}
        <div className="col-span-1 flex items-start">
          <VolTag v={r.dayVolTag} />
        </div>

        {/* Structural (with tooltip) */}
        <div className="col-span-2 flex items-start justify-end">
          <Tooltip
            text={
              r.structuralRiskTag === "Green"
                ? "Lower structural risk: typical volatility + healthier tape."
                : r.structuralRiskTag === "Amber"
                ? "Elevated structural risk: larger swings / fragile structure."
                : "High structural risk: outsized volatility, trend breaks, or disorderly tape."
            }
          >
            <Tag v={r.structuralRiskTag} />
          </Tooltip>
        </div>
      </div>
    ));
  }, [rows]);

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white/5">
      {/* Header */}
      <div className="grid grid-cols-10 gap-4 border-b border-[color:var(--border)] px-5 py-4">
        <div className="col-span-3">
          <div className="text-sm font-semibold text-foreground/70">Symbol</div>
          <div className="mt-2">
            {/* Render date pill ONE TIME above symbol column */}
            <SessionPill label={sessionLabel} />
          </div>
        </div>
        <div className="col-span-2 text-sm font-semibold text-foreground/70">
          % Change
        </div>
        <div className="col-span-2 text-sm font-semibold text-foreground/70">
          Range
        </div>
        <div className="col-span-1 text-sm font-semibold text-foreground/70">
          Day Vol
        </div>
        <div className="col-span-2 text-right text-sm font-semibold text-foreground/70">
          Structural
        </div>
      </div>

      {body}
    </div>
  );
}