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

type SessionInfo = {
  ok: boolean;
  sessionDateET: string; // YYYY-MM-DD
  resetAtET: string; // ISO string (ET)
  label: string; // e.g. "Mon • 2026-03-02"
};

function pct(x: number | null) {
  if (x == null) return "—";
  const v = x * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function money(x: number | null) {
  if (x == null) return "—";
  return `$${x.toFixed(2)}`;
}

function Arrow({ v }: { v: number | null }) {
  if (v == null || v === 0) return null;

  const up = v > 0;
  const cls = up
    ? "text-emerald-400"
    : "text-rose-400";

  // small, clean arrow
  return (
    <span className={`inline-flex items-center ${cls}`} aria-hidden="true">
      {up ? "▲" : "▼"}
    </span>
  );
}

function Pill({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center rounded-full border border-[color:var(--border)]",
        "bg-foreground/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-foreground/80",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center group">
      {children}
      <span
        className={[
          "pointer-events-none absolute z-50 hidden group-hover:block",
          "left-1/2 top-[calc(100%+8px)] -translate-x-1/2",
          "w-[260px] rounded-xl border border-[color:var(--border)] bg-background",
          "px-3 py-2 text-[12px] leading-snug text-foreground/80 shadow-lg",
        ].join(" ")}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}

function StructuralTag({ v }: { v: Row["structuralRiskTag"] }) {
  const cls =
    v === "Green"
      ? "border-emerald-700/40 bg-emerald-600/10 text-emerald-300"
      : v === "Amber"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-300"
      : "border-rose-700/40 bg-rose-600/10 text-rose-300";

  const help =
    v === "Green"
      ? "Green: lower structural stress. Still risk-manage your position sizing."
      : v === "Amber"
      ? "Amber: elevated structural risk. Keep sizing tight; expect wider moves and faster reversals."
      : "Red: high structural risk. Treat as hazard—avoid oversizing, respect stops, and consider skipping.";

  return (
    <Tooltip label={help}>
      <span
        className={[
          "inline-flex items-center rounded-full border px-2.5 py-1",
          "text-[11px] font-semibold tracking-wide",
          cls,
        ].join(" ")}
      >
        {v}
      </span>
    </Tooltip>
  );
}

function VolTag({ v }: { v: Row["dayVolTag"] }) {
  const cls =
    v === "Normal"
      ? "border-[color:var(--border)] bg-foreground/5 text-foreground/80"
      : v === "High"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-300"
      : "border-rose-700/40 bg-rose-600/10 text-rose-300";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1",
        "text-[11px] font-semibold tracking-wide",
        cls,
      ].join(" ")}
    >
      {v}
    </span>
  );
}

export default function MoversTableClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([
          fetch(`/api/market/movers?limit=5`, { cache: "no-store" }),
          fetch(`/api/market/session`, { cache: "no-store" }),
        ]);

        const mJson = await mRes.json().catch(() => ({}));
        const sJson = await sRes.json().catch(() => ({}));

        if (!alive) return;

        setRows((mJson?.rows ?? []) as Row[]);
        if (sJson?.ok) setSession(sJson as SessionInfo);
      } catch {
        if (!alive) return;
        setRows([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const body = useMemo(() => {
    if (rows === null) {
      return (
        <div className="px-6 py-6 text-sm text-foreground/70">Loading…</div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="px-6 py-6 text-sm text-foreground/70">
          No data right now.
        </div>
      );
    }

    return rows.map((r) => (
      <div
        key={r.symbol}
        className={[
          "grid grid-cols-12 gap-3 px-6 py-4 text-sm",
          "border-b border-[color:var(--border)] last:border-b-0",
        ].join(" ")}
      >
        <div className="col-span-3">
          <div className="font-semibold tracking-tight">{r.symbol}</div>
          <div className="mt-1 text-xs text-foreground/60">{money(r.price)}</div>
        </div>

        <div className="col-span-3">
          <div className="inline-flex items-center gap-2 font-medium">
            <Arrow v={r.changePct} />
            <span>{pct(r.changePct)}</span>
          </div>
          <div className="mt-1 text-xs text-foreground/60">
            Range: {pct(r.rangePct)}
          </div>
        </div>

        <div className="col-span-3 flex items-center">
          <VolTag v={r.dayVolTag} />
        </div>

        <div className="col-span-3 flex items-center justify-end">
          <StructuralTag v={r.structuralRiskTag} />
        </div>
      </div>
    ));
  }, [rows]);

  const pillTitle =
    session?.resetAtET
      ? `Resets at pre-market open (4:00am ET). Next reset: ${session.resetAtET}`
      : "Resets at pre-market open (4:00am ET) on trading days.";

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-foreground/5">
      <div className="px-6 py-4 border-b border-[color:var(--border)]">
        <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-foreground/70">
          <div className="col-span-3">
            <div className="mb-2">
              <Pill title={pillTitle}>
                {session?.label ?? "Session • ET"}
              </Pill>
            </div>
            <div>Symbol</div>
          </div>
          <div className="col-span-3">Change</div>
          <div className="col-span-3">Day Vol</div>
          <div className="col-span-3 text-right">Structural</div>
        </div>
      </div>

      {body}
    </div>
  );
}