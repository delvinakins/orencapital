"use client";

import { useEffect, useMemo, useState } from "react";
import Tooltip from "@/components/Tooltip";

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
  const v = x * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function Arrow({ v }: { v: number | null }) {
  if (v == null || v === 0) return null;

  const up = v > 0;
  const cls = up ? "text-emerald-400" : "text-rose-400";

  return (
    <span className={`inline-flex items-center ${cls}`} aria-hidden="true">
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={up ? "" : "rotate-180"}
      >
        <path d="M10 3l6 7h-4v7H8v-7H4l6-7z" />
      </svg>
    </span>
  );
}

function Tag({ v }: { v: Row["structuralRiskTag"] }) {
  const cls =
    v === "Green"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : v === "Amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${cls}`}
    >
      {v}
    </span>
  );
}

function VolTag({ v }: { v: Row["dayVolTag"] }) {
  const cls =
    v === "Normal"
      ? "border-[color:var(--border)] bg-[color:var(--card)] text-foreground/80"
      : v === "High"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${cls}`}
    >
      {v}
    </span>
  );
}

/**
 * Session date "resets" at 4:00am ET (premarket open).
 * - Before 4am ET: treat as previous session day
 * - Weekend: roll back to Friday
 */
function getSessionDateKeyET(): string {
  const now = new Date();

  // Get ET parts without needing a lib
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const yyyy = Number(get("year"));
  const mm = Number(get("month"));
  const dd = Number(get("day"));
  const hh = Number(get("hour"));

  // Construct a date in UTC for simple arithmetic
  let d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0)); // noon UTC avoids DST edge

  // If before 4am ET, use prior day
  if (hh < 4) d = new Date(d.getTime() - 24 * 60 * 60 * 1000);

  // Roll weekends back to Friday
  const dow = d.getUTCDay(); // 0 Sun ... 6 Sat
  if (dow === 0) d = new Date(d.getTime() - 2 * 24 * 60 * 60 * 1000); // Sun -> Fri
  if (dow === 6) d = new Date(d.getTime() - 1 * 24 * 60 * 60 * 1000); // Sat -> Fri

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPill(dateKey: string) {
  // dateKey: YYYY-MM-DD
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}

export default function MoversTableClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const sessionDateKey = useMemo(() => getSessionDateKeyET(), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/market/movers?limit=5`, { cache: "no-store" });
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
        <div className="px-5 py-6 text-base text-foreground/70">Loading…</div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="px-5 py-6 text-base text-foreground/70">
          No data right now.
        </div>
      );
    }

    return rows.map((r) => (
      <div
        key={r.symbol}
        className="
          grid grid-cols-12 gap-4
          border-t border-[color:var(--border)]
          px-5 py-4
          text-base text-foreground/90
        "
      >
        {/* Symbol */}
        <div className="col-span-3">
          <div className="font-semibold tracking-tight">{r.symbol}</div>
          <div className="mt-0.5 text-sm text-foreground/60">
            {r.price == null ? "—" : `$${r.price.toFixed(2)}`}
          </div>
        </div>

        {/* Change */}
        <div className="col-span-3 flex items-start gap-2">
          <Arrow v={r.changePct} />
          <div className="font-semibold tabular-nums">{pct(r.changePct)}</div>
        </div>

        {/* Range */}
        <div className="col-span-2">
          <div className="tabular-nums">{pct(r.rangePct)}</div>
          <div className="mt-0.5 text-sm text-foreground/60">intraday</div>
        </div>

        {/* Day Vol */}
        <div className="col-span-2">
          <VolTag v={r.dayVolTag} />
        </div>

        {/* Structural */}
        <div className="col-span-2 flex items-start justify-end">
          <Tag v={r.structuralRiskTag} />
        </div>
      </div>
    ));
  }, [rows]);

  return (
    <div
      className="
        mt-8 overflow-hidden
        rounded-2xl
        border border-[color:var(--border)]
        bg-[color:var(--card)]
      "
    >
      {/* Header */}
      <div
        className="
          grid grid-cols-12 gap-4
          px-5 py-4
          text-sm font-semibold
          text-foreground/70
          border-b border-[color:var(--border)]
          bg-[color:var(--background)]/30
        "
      >
        {/* Symbol header w/ date pill above it (ONE TIME) */}
        <div className="col-span-3">
          <div className="mb-1">
            <span
              className="
                inline-flex items-center rounded-full
                border border-[color:var(--border)]
                bg-[color:var(--background)]
                px-2.5 py-1
                text-[11px] font-semibold
                text-foreground/70
              "
              title="Trading session date (resets at 4:00am ET)"
            >
              {formatPill(sessionDateKey)} · Session
            </span>
          </div>
          <div className="text-sm font-semibold text-foreground/70">Symbol</div>
        </div>

        <div className="col-span-3 text-sm font-semibold text-foreground/70">
          % Change
        </div>

        <div className="col-span-2 text-sm font-semibold text-foreground/70">
          Range
        </div>

        <div className="col-span-2 text-sm font-semibold text-foreground/70">
          Day Vol
        </div>

        <div className="col-span-2 flex items-center justify-end text-sm font-semibold text-foreground/70">
          <Tooltip label="Structural">
            <div className="space-y-2">
              <p>
                Structural risk is a fast read on tape fragility and disorderly
                movement. It’s meant for <span className="font-semibold">risk posture</span>, not prediction.
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="font-semibold">Green:</span> healthier structure, typical volatility
                </li>
                <li>
                  <span className="font-semibold">Amber:</span> elevated fragility / larger swings
                </li>
                <li>
                  <span className="font-semibold">Red:</span> disorderly tape / outsized risk
                </li>
              </ul>
              <p className="text-foreground/70">
                Session date resets at <span className="font-semibold">4:00am ET</span> (premarket).
              </p>
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Rows */}
      {body}
    </div>
  );
}