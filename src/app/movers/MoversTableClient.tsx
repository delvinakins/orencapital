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

function ChangeCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-foreground/70">—</span>;

  const up = v >= 0;
  const cls = up ? "text-emerald-300" : "text-rose-300";
  const arrowPath = up
    ? "M12 5l6 6h-4v8h-4v-8H6l6-6z"
    : "M12 19l-6-6h4V5h4v8h4l-6 6z";

  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${cls}`}
        fill="currentColor"
      >
        <path d={arrowPath} />
      </svg>
      <span className="text-foreground/80">{pct(v)}</span>
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
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute z-50 -top-2 left-1/2 hidden w-max max-w-[260px] -translate-x-1/2 -translate-y-full rounded-xl border border-[color:var(--border)] bg-background px-3 py-2 text-[11px] leading-snug text-foreground/80 shadow-lg group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}

function VolTag({ v }: { v: Row["dayVolTag"] }) {
  const cls =
    v === "Normal"
      ? "border-[color:var(--border)] bg-foreground/5 text-foreground/80"
      : v === "High"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-200"
      : "border-rose-700/40 bg-rose-600/10 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cls}`}
    >
      {v}
    </span>
  );
}

function structuralTooltip(v: Row["structuralRiskTag"]) {
  if (v === "Green")
    return "Lower structural risk (relative). Still volatile—size with discipline.";
  if (v === "Amber")
    return "Elevated structural risk. Fragile / headline-sensitive; expect sharper moves.";
  return "High structural risk. Gap risk + violent reversals are common—treat as unstable.";
}

function StructuralTag({ v }: { v: Row["structuralRiskTag"] }) {
  const cls =
    v === "Green"
      ? "border-emerald-700/40 bg-emerald-600/10 text-emerald-200"
      : v === "Amber"
      ? "border-amber-700/40 bg-amber-600/10 text-amber-200"
      : "border-rose-700/40 bg-rose-600/10 text-rose-200";

  const pill = (
    <span
      tabIndex={0}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40 ${cls}`}
    >
      {v}
    </span>
  );

  return <Tooltip label={structuralTooltip(v)}>{pill}</Tooltip>;
}

/**
 * Session date rule:
 * - session rolls at 4:00am ET (premarket start) on trading days
 * - if before 4am ET, treat as previous day session
 * - if weekend, roll back to last Friday
 */
function getSessionDateET(now = new Date()) {
  // Convert "now" to America/New_York wall clock parts
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  // Start with ET date as a UTC date object at midnight (we only use Y-M-D math)
  // Using UTC avoids local TZ DST issues for simple day subtraction.
  let dt = new Date(Date.UTC(y, m - 1, d));

  // If before 4am ET -> previous session day
  if (h < 4) dt = new Date(dt.getTime() - 24 * 60 * 60 * 1000);

  // Roll back weekends to last Friday
  // (dt.getUTCDay: 0 Sun, 6 Sat)
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) {
    dt = new Date(dt.getTime() - 24 * 60 * 60 * 1000);
  }

  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function MoversTableClient() {
  const [rows, setRows] = useState<Row[] | null>(null);

  const sessionDate = useMemo(() => getSessionDateET(), []);

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

  const body = useMemo(() => {
    if (rows === null) {
      return (
        <div className="px-5 py-6 text-sm text-foreground/70">Loading…</div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="px-5 py-6 text-sm text-foreground/70">
          No data right now.
        </div>
      );
    }

    return rows.map((r) => (
      <div
        key={r.symbol}
        className="grid grid-cols-10 gap-3 border-b border-[color:var(--border)] px-5 py-4 text-sm text-foreground/80 last:border-b-0"
      >
        <div className="col-span-2 flex flex-col gap-1">
          <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--border)] bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-foreground/70">
            {sessionDate} ET
          </span>
          <span className="font-semibold text-foreground">{r.symbol}</span>
        </div>

        <div className="col-span-2">
          <ChangeCell v={r.changePct} />
        </div>

        <div className="col-span-2 tabular-nums">{pct(r.rangePct)}</div>

        <div className="col-span-2">
          <VolTag v={r.dayVolTag} />
        </div>

        <div className="col-span-2">
          <StructuralTag v={r.structuralRiskTag} />
        </div>
      </div>
    ));
  }, [rows, sessionDate]);

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-background">
      <div className="grid grid-cols-10 gap-3 border-b border-[color:var(--border)] px-5 py-3 text-xs font-semibold text-foreground/70">
        <div className="col-span-2">Symbol</div>
        <div className="col-span-2">Change</div>
        <div className="col-span-2">Range</div>
        <div className="col-span-2">Day Vol</div>
        <div className="col-span-2">Structural</div>
      </div>

      {body}
    </div>
  );
}