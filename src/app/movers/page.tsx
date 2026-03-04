// src/app/movers/page.tsx
import { MoverChart, type MoverPt } from "@/components/charts/MoverChart";

export const runtime = "nodejs";

type SeriesMeta = {
  kind: "real" | "fallback";
  interval?: "5m";
  normalized: boolean;
};

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series: MoverPt[];
  seriesMeta?: SeriesMeta;
};

type ApiResp = { ok: boolean; rows?: Row[] };

function fmtPct(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

function fmtPrice(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function changeMeta(changePct: number | null) {
  if (changePct == null || !Number.isFinite(changePct) || changePct === 0) {
    return { arrow: "", cls: "text-white/75", bar: "bg-white/10" };
  }
  if (changePct > 0) return { arrow: "▲", cls: "text-emerald-300", bar: "bg-emerald-400/60" };
  return { arrow: "▼", cls: "text-rose-300", bar: "bg-rose-400/60" };
}

function tagPill(tag: Row["dayVolTag"] | Row["structuralRiskTag"]) {
  switch (tag) {
    case "Extreme":
    case "Red":
      return "border-rose-400/35 bg-rose-500/10 text-rose-200";
    case "High":
    case "Amber":
      return "border-amber-400/35 bg-amber-500/10 text-amber-200";
    case "Normal":
    case "Green":
    default:
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }
}

function seriesChip(meta?: SeriesMeta) {
  if (!meta) return { text: "—", cls: "border-white/10 bg-white/5 text-white/60" };
  if (meta.kind === "real") return { text: "REAL", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  return { text: "EST", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
}

export default async function MoversPage() {
  const res = await fetch("http://localhost:3000/api/market/movers?limit=10&series=1", {
    cache: "no-store",
  });

  const data = (await res.json()) as ApiResp;
  const rows = (data.ok ? data.rows ?? [] : []).slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Movers</h1>
        <p className="mt-1 text-sm text-white/60">
          Top 10 S&amp;P 500 movers.
        </p>
      </div>

      {/* MOBILE: cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
        {rows.map((r) => {
          const meta = changeMeta(r.changePct);
          const chip = seriesChip(r.seriesMeta);

          return (
            <div
              key={r.symbol}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4"
            >
              {/* left accent bar */}
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
                <MoverChart data={r.series} label="Tape" height={160} />
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden lg:block">
        <div className="rounded-2xl border border-white/10 bg-black/30">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-white/50">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Range</th>
                  <th className="px-4 py-3">Daily Vol</th>
                  <th className="px-4 py-3">Structural</th>
                  <th className="px-4 py-3">Tape</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = changeMeta(r.changePct);
                  const chip = seriesChip(r.seriesMeta);

                  return (
                    <tr key={r.symbol} className="border-b border-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* left accent bar */}
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
                          <MoverChart data={r.series} height={44} />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 ? (
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
    </div>
  );
}