// src/app/movers/page.tsx
import { headers } from "next/headers";
import { MoverChart, type MoverPt } from "@/components/charts/MoverChart";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series?: MoverPt[];
};

type ApiResp = { ok: boolean; rows: Row[] };

function pct(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

function price(x: number | null) {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function badgeTone(tag: string) {
  switch (tag) {
    case "Extreme":
    case "Red":
      return "border-white/20 bg-white/10 text-white";
    case "High":
    case "Amber":
      return "border-white/15 bg-white/5 text-white/90";
    default:
      return "border-white/10 bg-transparent text-white/70";
  }
}

async function getBaseUrlFromHeaders() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return "https://orencapital.com";
  return `${proto}://${host}`;
}

export default async function MoversPage() {
  const baseUrl = await getBaseUrlFromHeaders();

  const res = await fetch(`${baseUrl}/api/market/movers?limit=25&series=1`, {
    cache: "no-store",
  });

  const data = (await res.json()) as ApiResp;
  const rows = (data.ok ? data.rows : []).slice(0, 25);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Movers</h1>
        <p className="mt-1 text-sm text-white/60">
          S&amp;P 500 movers with intraday tape.
        </p>
      </div>

      {/* MOBILE: cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
        {rows.map((r) => (
          <div
            key={r.symbol}
            className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {r.symbol}
                </div>

                <div className="mt-1 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(
                      r.dayVolTag
                    )}`}
                  >
                    Daily Vol: {r.dayVolTag}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(
                      r.structuralRiskTag
                    )}`}
                  >
                    Structural: {r.structuralRiskTag}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs text-white/50">Price</div>
                <div className="text-sm font-medium text-white">
                  {price(r.price)}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] text-white/50">Change</div>
                <div className="mt-1 text-sm font-medium text-white">
                  {pct(r.changePct)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] text-white/50">Range</div>
                <div className="mt-1 text-sm font-medium text-white">
                  {pct(r.rangePct)}
                </div>
              </div>
            </div>

            {r.series && r.series.length >= 2 ? (
              <div className="mt-2">
                <MoverChart data={r.series} yDomain={[0, 100]} label="Tape" />
              </div>
            ) : (
              <div className="mt-2 text-xs text-white/40">No series</div>
            )}
          </div>
        ))}
      </div>

      {/* DESKTOP: table */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
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
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-white/5">
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {r.symbol}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80">
                      {price(r.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80">
                      {pct(r.changePct)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80">
                      {pct(r.rangePct)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(
                          r.dayVolTag
                        )}`}
                      >
                        {r.dayVolTag}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(
                          r.structuralRiskTag
                        )}`}
                      >
                        {r.structuralRiskTag}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.series && r.series.length >= 2 ? (
                        <div className="w-[260px]">
                          <MoverChart data={r.series} yDomain={[0, 100]} label="" />
                        </div>
                      ) : (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}