// src/components/MoversTable.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoverChart, type MoverPt } from "@/components/charts/MoverChart";

type SeriesMeta = {
  kind: "real" | "fallback";
  interval?: "5m";
  normalized: boolean;
};

export type MoverRow = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series: MoverPt[];
  seriesMeta?: SeriesMeta;
};

type SortKey = "changePct" | "rangePct";

function fmtPct(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

function fmtPrice(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function changeMeta(changePct: number | null) {
  if (changePct == null || !Number.isFinite(changePct) || changePct === 0)
    return { arrow: "", cls: "text-white/75", bar: "bg-white/10" };
  if (changePct > 0) return { arrow: "▲", cls: "text-emerald-300", bar: "bg-emerald-400/60" };
  return { arrow: "▼", cls: "text-rose-300", bar: "bg-rose-400/60" };
}

function tagPill(tag: MoverRow["dayVolTag"] | MoverRow["structuralRiskTag"]) {
  switch (tag) {
    case "Extreme":
    case "Red":
      return "border-rose-400/35 bg-rose-500/10 text-rose-200";
    case "High":
    case "Amber":
      return "border-amber-400/35 bg-amber-500/10 text-amber-200";
    default:
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }
}

function seriesChip(meta?: SeriesMeta) {
  if (!meta) return { text: "—", cls: "border-white/10 bg-white/5 text-white/60" };
  if (meta.kind === "real") return { text: "REAL", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  return { text: "EST", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
}

function isExtreme(r: MoverRow) {
  return r.dayVolTag === "Extreme" || r.structuralRiskTag === "Red";
}

function SortBtn({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        active ? "text-white" : "text-white/40 hover:text-white/70"
      }`}
    >
      {label}
      {active ? (
        <span className="text-[10px]">{dir === "desc" ? "▼" : "▲"}</span>
      ) : (
        <span className="text-[10px] opacity-30">▼</span>
      )}
    </button>
  );
}

export function MoversTable({ initialRows }: { initialRows: MoverRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("changePct");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date());

  // 60s auto-refresh
  React.useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = React.useMemo(() => {
    return [...initialRows].sort((a, b) => {
      const av = Math.abs(a[sortKey] ?? 0);
      const bv = Math.abs(b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [initialRows, sortKey, sortDir]);

  return (
    <>
      {/* Refresh indicator */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SortBtn
            label="Sort by Change"
            active={sortKey === "changePct"}
            dir={sortDir}
            onClick={() => toggleSort("changePct")}
          />
          <SortBtn
            label="Sort by Range"
            active={sortKey === "rangePct"}
            dir={sortDir}
            onClick={() => toggleSort("rangePct")}
          />
        </div>
        <div className="text-xs text-white/30">
          refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* MOBILE: cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
        {sorted.map((r) => {
          const meta = changeMeta(r.changePct);
          const chip = seriesChip(r.seriesMeta);
          const extreme = isExtreme(r);

          return (
            <div
              key={r.symbol}
              className={`relative overflow-hidden rounded-2xl border p-3 sm:p-4 transition-colors ${
                extreme
                  ? "border-rose-500/25 bg-rose-500/5"
                  : "border-white/10 bg-black/30"
              }`}
            >
              <div className={`absolute left-0 top-0 h-full w-1.5 ${meta.bar}`} />

              <div className="flex items-start justify-between gap-3 pl-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold text-white">{r.symbol}</div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${chip.cls}`}>
                      {chip.text}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tagPill(r.dayVolTag)}`}>
                      Daily Vol: {r.dayVolTag}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tagPill(r.structuralRiskTag)}`}>
                      Structural: {r.structuralRiskTag}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-white/50">Price</div>
                  <div className="text-sm font-medium text-white">{fmtPrice(r.price)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 pl-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] text-white/50">Change</div>
                  <div className={`mt-1 text-sm font-medium ${meta.cls}`}>
                    {meta.arrow ? <span className="mr-1">{meta.arrow}</span> : null}
                    {fmtPct(r.changePct)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] text-white/50">Range</div>
                  <div className="mt-1 text-sm font-medium text-white/80">{fmtPct(r.rangePct)}</div>
                </div>
              </div>

              <div className="mt-2 pl-2">
                <MoverChart
                  data={r.series}
                  label="Tape"
                  height={160}
                  positive={r.changePct == null ? null : r.changePct > 0}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden lg:block">
        <div className="rounded-2xl border border-white/10 bg-black/30">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/50">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">
                    <SortBtn
                      label="Change"
                      active={sortKey === "changePct"}
                      dir={sortDir}
                      onClick={() => toggleSort("changePct")}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortBtn
                      label="Range"
                      active={sortKey === "rangePct"}
                      dir={sortDir}
                      onClick={() => toggleSort("rangePct")}
                    />
                  </th>
                  <th className="px-4 py-3">Daily Vol</th>
                  <th className="px-4 py-3">Structural</th>
                  <th className="px-4 py-3">Tape</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const meta = changeMeta(r.changePct);
                  const chip = seriesChip(r.seriesMeta);
                  const extreme = isExtreme(r);

                  return (
                    <tr
                      key={r.symbol}
                      className={`border-b border-white/5 transition-colors ${
                        extreme ? "bg-rose-500/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`h-5 w-1 rounded-full ${meta.bar}`} />
                          <span className="text-sm font-medium text-white">{r.symbol}</span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${chip.cls}`}>
                            {chip.text}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-white/80">{fmtPrice(r.price)}</td>

                      <td className={`px-4 py-3 text-sm font-medium ${meta.cls}`}>
                        {meta.arrow ? <span className="mr-1">{meta.arrow}</span> : null}
                        {fmtPct(r.changePct)}
                      </td>

                      <td className="px-4 py-3 text-sm text-white/80">{fmtPct(r.rangePct)}</td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagPill(r.dayVolTag)}`}>
                          {r.dayVolTag}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagPill(r.structuralRiskTag)}`}>
                          {r.structuralRiskTag}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="w-[180px]">
                          <MoverChart
                            data={r.series}
                            height={44}
                            positive={r.changePct == null ? null : r.changePct > 0}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {sorted.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-white/50" colSpan={7}>
                      No data right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}