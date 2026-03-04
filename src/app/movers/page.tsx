// src/app/movers/page.tsx
import { MoverChart, type MoverPt } from "@/components/charts/MoverChart";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series?: MoverPt[];
};

function getKey() {
  return (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "").trim();
}

function pctTag(range: number | null): Row["dayVolTag"] {
  if (!range) return "Normal";
  if (range >= 0.12) return "Extreme";
  if (range >= 0.06) return "High";
  return "Normal";
}

function structuralTag(change: number | null, range: number | null): Row["structuralRiskTag"] {
  const c = Math.abs(change ?? 0);
  const r = range ?? 0;
  if (c >= 0.08 || r >= 0.14) return "Red";
  if (c >= 0.04 || r >= 0.08) return "Amber";
  return "Green";
}

// Cache SP500 list 24h (server memory)
let spCache: { ts: number; set: Set<string> } | null = null;

async function getSp500(): Promise<Set<string>> {
  const now = Date.now();
  if (spCache && now - spCache.ts < 86_400_000) return spCache.set;

  const res = await fetch(
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`SP500 list fetch failed (${res.status})`);
  }

  const text = await res.text();
  const lines = text.split("\n").slice(1);

  const set = new Set<string>();
  for (const line of lines) {
    const sym = line.split(",")[0]?.trim();
    if (sym) set.add(sym.toUpperCase());
  }

  spCache = { ts: now, set };
  return set;
}

async function fetchSnapshots(key: string) {
  const url =
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    // Don’t leak internal provider response to users; just fail.
    throw new Error("Market data temporarily unavailable.");
  }

  return res.json();
}

// UI helpers
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

export default async function MoversPage() {
  const key = getKey();

  let rows: Row[] = [];
  let userError: string | null = null;

  if (!key) {
    userError = "Movers are temporarily unavailable.";
  } else {
    try {
      const sp500 = await getSp500();
      const snapshot = await fetchSnapshots(key);

      rows = (snapshot.tickers ?? [])
        .filter((t: any) => sp500.has(t.ticker))
        .map((t: any) => {
          const day = t.day ?? {};
          const open = day.o;
          const close = day.c;
          const high = day.h;
          const low = day.l;

          const changePctVal = open && close ? (close - open) / open : null;
          const rangePctVal = open && high && low ? (high - low) / open : null;

          return {
            symbol: t.ticker,
            price: close ?? null,
            changePct: changePctVal,
            rangePct: rangePctVal,
            dayVolTag: pctTag(rangePctVal),
            structuralRiskTag: structuralTag(changePctVal, rangePctVal),
            // series intentionally omitted here (we’ll add it back once aggs series is reliable)
          };
        });

      rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
      rows = rows.slice(0, 25);
    } catch {
      userError = "Movers are temporarily unavailable.";
      rows = [];
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Movers</h1>
        <p className="mt-1 text-sm text-white/60">S&amp;P 500 movers.</p>
      </div>

      {userError ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          {userError}
        </div>
      ) : null}

      {/* MOBILE: cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
        {rows.map((r) => (
          <div key={r.symbol} className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{r.symbol}</div>

                <div className="mt-1 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(r.dayVolTag)}`}>
                    Daily Vol: {r.dayVolTag}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(r.structuralRiskTag)}`}>
                    Structural: {r.structuralRiskTag}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs text-white/50">Price</div>
                <div className="text-sm font-medium text-white">{price(r.price)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] text-white/50">Change</div>
                <div className="mt-1 text-sm font-medium text-white">{pct(r.changePct)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] text-white/50">Range</div>
                <div className="mt-1 text-sm font-medium text-white">{pct(r.rangePct)}</div>
              </div>
            </div>

            {/* Chart renders only if series exists */}
            {r.series && r.series.length >= 2 ? (
              <div className="mt-2">
                <MoverChart data={r.series} yDomain={[0, 100]} label="Tape" />
              </div>
            ) : null}
          </div>
        ))}
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
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-white/5">
                    <td className="px-4 py-3 text-sm font-medium text-white">{r.symbol}</td>
                    <td className="px-4 py-3 text-sm text-white/80">{price(r.price)}</td>
                    <td className="px-4 py-3 text-sm text-white/80">{pct(r.changePct)}</td>
                    <td className="px-4 py-3 text-sm text-white/80">{pct(r.rangePct)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(r.dayVolTag)}`}>
                        {r.dayVolTag}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(r.structuralRiskTag)}`}>
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

                {!userError && rows.length === 0 ? (
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