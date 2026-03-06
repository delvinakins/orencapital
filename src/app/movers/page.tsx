// src/app/movers/page.tsx
import { MoversTable, type MoverRow } from "@/components/MoversTable";

export const runtime = "nodejs";

function getKey() {
  return (process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "").trim();
}

function pctTag(range: number | null): MoverRow["dayVolTag"] {
  if (!range) return "Normal";
  if (range >= 0.12) return "Extreme";
  if (range >= 0.06) return "High";
  return "Normal";
}

function structuralTag(change: number | null, range: number | null): MoverRow["structuralRiskTag"] {
  const c = Math.abs(change ?? 0);
  const r = range ?? 0;
  if (c >= 0.08 || r >= 0.14) return "Red";
  if (c >= 0.04 || r >= 0.08) return "Amber";
  return "Green";
}

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
  const set = new Set<string>();
  for (const line of text.split("\n").slice(1)) {
    const sym = line.split(",")[0]?.trim();
    if (sym) set.add(sym.toUpperCase());
  }
  spCache = { ts: now, set };
  return set;
}

async function fetchSnapshots(key: string) {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false&apiKey=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Market data temporarily unavailable.");
  return res.json();
}

type AggResp = { results?: Array<{ t: number; c: number }> };

function yyyyMmDd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function normalize0to100(points: Array<{ ts: number; v: number }>) {
  if (points.length < 2) return points;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  if (span <= 0) return points.map((p) => ({ ts: p.ts, v: 50 }));
  return points.map((p) => ({ ts: p.ts, v: ((p.v - min) / span) * 100 }));
}

const seriesCache = new Map<string, { ts: number; series: Array<{ ts: number; v: number }> }>();

async function fetch5mSeriesReal(key: string, symbol: string) {
  const now = Date.now();
  const cacheKey = `${symbol}:5m:last7`;
  const cached = seriesCache.get(cacheKey);
  if (cached && now - cached.ts < 60_000) return cached.series;

  const today = new Date();
  const from = yyyyMmDd(addDays(today, -7));
  const to = yyyyMmDd(today);
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) { seriesCache.set(cacheKey, { ts: now, series: [] }); return []; }

  const data = (await res.json()) as AggResp;
  const raw = (data.results ?? [])
    .filter((r) => typeof r.t === "number" && typeof r.c === "number")
    .map((r) => ({ ts: r.t, v: r.c }));

  if (raw.length < 2) { seriesCache.set(cacheKey, { ts: now, series: [] }); return []; }

  const norm = normalize0to100(raw.length > 90 ? raw.slice(-90) : raw);
  seriesCache.set(cacheKey, { ts: now, series: norm });
  return norm;
}

function fallbackTapeFromDay(day: any) {
  const now = Date.now();
  const base = day?.o ?? day?.c ?? 100;
  const low = day?.l ?? base * 0.985;
  const high = day?.h ?? base * 1.015;
  const close = day?.c ?? base;
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
    raw.push({ ts, v: v0 + (v1 - v0) * frac });
  }
  return normalize0to100(raw);
}

export default async function MoversPage() {
  const key = getKey();
  let rows: MoverRow[] = [];
  let userError: string | null = null;

  if (!key) {
    userError = "Movers are temporarily unavailable.";
  } else {
    try {
      const sp500 = await getSp500();
      const snapshot = await fetchSnapshots(key);
      const dayBySymbol = new Map<string, any>();

      const base = (snapshot.tickers ?? [])
        .filter((t: any) => sp500.has(t.ticker))
        .map((t: any) => {
          const day = t.day ?? {};
          dayBySymbol.set(t.ticker, day);
          const { o: open, c: close, h: high, l: low } = day;
          const changePct = open && close ? (close - open) / open : null;
          const rangePct = open && high && low ? (high - low) / open : null;
          return {
            symbol: t.ticker,
            price: close ?? null,
            changePct,
            rangePct,
            dayVolTag: pctTag(rangePct),
            structuralRiskTag: structuralTag(changePct, rangePct),
          };
        });

      base.sort((a: any, b: any) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));

      rows = await Promise.all(
        base.slice(0, 10).map(async (r: any) => {
          const real = await fetch5mSeriesReal(key, r.symbol);
          if (real.length >= 2) {
            return { ...r, series: real, seriesMeta: { kind: "real" as const, interval: "5m" as const, normalized: true } };
          }
          const fb = fallbackTapeFromDay(dayBySymbol.get(r.symbol));
          return { ...r, series: fb, seriesMeta: { kind: "fallback" as const, normalized: true } };
        })
      );
    } catch {
      userError = "Movers are temporarily unavailable.";
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

      <MoversTable initialRows={rows} />
    </div>
  );
}