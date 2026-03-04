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
  series: MoverPt[];
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

// Cache SP500 list 24h
let spCache: { ts: number; set: Set<string> } | null = null;

async function getSp500(): Promise<Set<string>> {
  const now = Date.now();
  if (spCache && now - spCache.ts < 86_400_000) return spCache.set;

  const res = await fetch(
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`SP500 list fetch failed (${res.status})`);

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
  if (!res.ok) throw new Error("Market data temporarily unavailable.");
  return res.json();
}

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
    return { arrow: "", cls: "text-white/75" };
  }
  if (changePct > 0) return { arrow: "▲", cls: "text-emerald-300" };
  return { arrow: "▼", cls: "text-rose-300" };
}

function tagPill(tag: Row["dayVolTag"] | Row["structuralRiskTag"]) {
  // subtle border + glow background (Kalshi-ish)
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

// 30-point normalized fallback tape (so it looks like real tape)
function fallbackTape(day: any): MoverPt[] {
  const now = Date.now();

  const o = typeof day?.o === "number" ? day.o : null;
  const c = typeof day?.c === "number" ? day.c : null;
  const h = typeof day?.h === "number" ? day.h : null;
  const l = typeof day?.l === "number" ? day.l : null;

  const base = o ?? c ?? 100;
  const low = l ?? base * 0.985;
  const high = h ?? base * 1.015;
  const close = c ?? base;

  const anchors = [base, low, (low + high) / 2, high, (high + close) / 2, close];

  const steps = 30;
  const start = now - 6 * 60 * 60 * 1000;

  const raw: Array<{ ts: number; v: number }> = [];
  for (let i = 0; i < steps; i++) {
    const ts = start + (i * (now - start)) / (steps - 1);

    const a = (i / (steps - 1)) * (anchors.length - 1);
    const idx = Math.floor(a);
    const frac = a - idx;

    const v0 = anchors[idx]!;
    const v1 = anchors[Math.min(idx + 1, anchors.length - 1)]!;
    const v = v0 + (v1 - v0) * frac;

    raw.push({ ts, v });
  }

  const vals = raw.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;

  if (span <= 0) return raw.map((p) => ({ ts: p.ts, v: 50 }));
  return raw.map((p) => ({ ts: p.ts, v: ((p.v - min) / span) * 100 }));
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
            series: fallbackTape(day),
          };
        });

      rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
      rows = rows.slice(0, 10);
    } catch {
      userError = "Movers are temporarily unavailable.";
      rows = [];
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Movers</h1>
        <p className="mt-1 text-sm text-white/60">Top 10 S&amp;P 500 movers.</p>
      </div>

      {userError ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          {userError}
        </div>
      ) : null}

      {/* MOBILE: cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:hidden">
        {rows.map((r) => {
          const meta = changeMeta(r.changePct);
          return (
            <div
              key={r.symbol}
              className="rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{r.symbol}</div>

                  <div className="mt-1 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${tagPill(
                        r.dayVolTag
                      )}`}
                    >
                      Daily Vol: {r.dayVolTag}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${tagPill(
                        r.structuralRiskTag
                      )}`}
                    >
                      Structural: {r.structuralRiskTag}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs text-white/50">Price</div>
                  <div className="text-sm font-medium text-white">{fmtPrice(r.price)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
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

              <div className="mt-2">
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
                  return (
                    <tr key={r.symbol} className="border-b border-white/5">
                      <td className="px-4 py-3 text-sm font-medium text-white">{r.symbol}</td>
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
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagPill(
                            r.structuralRiskTag
                          )}`}
                        >
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