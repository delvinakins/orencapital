"use client";

import { useEffect, useMemo, useState } from "react";
import Sparkline from "@/components/Sparkline";

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

function usd(x: number | null) {
  if (x == null) return "—";
  // keep it simple; avoids intl overhead in client
  const v = Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(2);
  return `$${v}`;
}

function Tag({ v }: { v: Row["structuralRiskTag"] }) {
  const cls =
    v === "Green"
      ? "border-emerald-700/40 bg-emerald-600/10 text-emerald-200"
      : v === "Amber"
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

function VolTag({ v }: { v: Row["dayVolTag"] }) {
  const cls =
    v === "Normal"
      ? "border-white/10 bg-white/5 text-slate-200"
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

export default function MoversTableClient() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/market/movers?limit=25`, {
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

  const top5 = useMemo(() => {
    if (!rows) return null;
    return [...rows]
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
      .slice(0, 5);
  }, [rows]);

  const body = useMemo(() => {
    if (top5 === null) {
      return <div className="px-4 py-6 text-sm text-slate-300">Loading…</div>;
    }

    if (top5.length === 0) {
      return (
        <div className="px-4 py-6 text-sm text-slate-300">
          No data right now.
        </div>
      );
    }

    return top5.map((r) => (
      <div
        key={r.symbol}
        className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-5 text-sm text-slate-200 last:border-b-0 items-center"
      >
        <div className="col-span-2">
          <div className="font-semibold text-white">{r.symbol}</div>
          <div className="mt-1 text-xs text-slate-400">{usd(r.price)}</div>
        </div>

        <div className="col-span-2">
          <div className="text-slate-300 text-xs">Change</div>
          <div className="mt-1 font-medium">{pct(r.changePct)}</div>
        </div>

        <div className="col-span-2">
          <div className="text-slate-300 text-xs">Range</div>
          <div className="mt-1 font-medium">{pct(r.rangePct)}</div>
        </div>

        <div className="col-span-2">
          <div className="text-slate-300 text-xs">Day Vol</div>
          <div className="mt-2">
            <VolTag v={r.dayVolTag} />
          </div>
        </div>

        <div className="col-span-2">
          <div className="text-slate-300 text-xs">Structural</div>
          <div className="mt-2">
            <Tag v={r.structuralRiskTag} />
          </div>
        </div>

        <div className="col-span-2 flex justify-end">
          {/* bigger + more readable */}
          <div className="w-[320px] max-w-[320px]">
            <Sparkline symbol={r.symbol} height={96} />
          </div>
        </div>
      </div>
    ));
  }, [top5]);

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold text-slate-300">
        <div className="col-span-2">Symbol</div>
        <div className="col-span-2">Change</div>
        <div className="col-span-2">Range</div>
        <div className="col-span-2">Day Vol</div>
        <div className="col-span-2">Structural</div>
        <div className="col-span-2 text-right">Chart</div>
      </div>

      {body}
    </div>
  );
}