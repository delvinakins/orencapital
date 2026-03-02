// src/app/movers/page.tsx
import Link from "next/link";
import TradingViewMini from "@/components/TradingViewMini";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
};

function getBaseUrl() {
  const env =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://orencapital.com";

  return env.replace(/\/$/, "");
}

async function getRows(): Promise<Row[]> {
  const base = getBaseUrl();
  const url = `${base}/api/market/movers?limit=25`;

  const res = await fetch(url, { cache: "no-store" });

  // if API errors, don’t crash the whole page
  if (!res.ok) return [];

  const j = await res.json();
  return (j?.rows ?? []) as Row[];
}

function pct(x: number | null) {
  if (x == null) return "—";
  return `${(x * 100).toFixed(2)}%`;
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

export default async function MoversPage() {
  const rows = await getRows();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            S&P 500 Volatility Radar
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Today’s biggest intraday movers, filtered to the S&P 500 and tagged
            by structural risk.
          </p>
        </div>

        <Link
          href="/risk"
          className="text-sm text-slate-300 hover:text-white hover:underline"
        >
          Go to Survivability →
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold text-slate-300">
          <div className="col-span-2">Symbol</div>
          <div className="col-span-2">Change</div>
          <div className="col-span-2">Range</div>
          <div className="col-span-2">Day Vol</div>
          <div className="col-span-2">Structural</div>
          <div className="col-span-2 text-right">Chart</div>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-300">
            No data right now.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.symbol}
              className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-4 text-sm text-slate-200 last:border-b-0"
            >
              <div className="col-span-2 font-semibold text-white">
                {r.symbol}
              </div>
              <div className="col-span-2">{pct(r.changePct)}</div>
              <div className="col-span-2">{pct(r.rangePct)}</div>
              <div className="col-span-2">
                <VolTag v={r.dayVolTag} />
              </div>
              <div className="col-span-2">
                <Tag v={r.structuralRiskTag} />
              </div>

              {/* TradingView Mini Chart widget (client component) */}
              <div className="col-span-2 flex justify-end">
                <div className="w-[180px]">
                  <TradingViewMini symbol={r.symbol} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Charts powered by TradingView embeds.
      </p>
    </main>
  );
}