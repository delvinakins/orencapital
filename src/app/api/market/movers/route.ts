import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  // OPTIONAL spark series for charting (0-100 normalized or price-based)
  series?: Array<{ ts: number; v: number }>;
};

function getKey() {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";
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
  if (spCache && now - spCache.ts < 86400000) return spCache.set;

  const res = await fetch(
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
    { cache: "no-store" }
  );

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
    const text = await res.text();
    throw new Error(`Polygon snapshot fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ---- Intraday series (5m candles) for charting ----

type AggResp = { results?: Array<{ t: number; c: number }> };

// cache series 60s per symbol+window
const seriesCache = new Map<string, { ts: number; series: Array<{ ts: number; v: number }> }>();

function startOfDayET_ms() {
  // Approx: use local date boundaries (good enough for sparkline). We can refine later.
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function fetch5mSeries(key: string, symbol: string): Promise<Array<{ ts: number; v: number }>> {
  const cacheKey = `${symbol}:5m:today`;
  const now = Date.now();
  const cached = seriesCache.get(cacheKey);
  if (cached && now - cached.ts < 60_000) return cached.series;

  const from = startOfDayET_ms();
  const to = now;

  // 5-minute bars today
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // Don’t fail the whole endpoint if one ticker series fails
    seriesCache.set(cacheKey, { ts: now, series: [] });
    return [];
  }

  const data = (await res.json()) as AggResp;

  const raw = (data.results ?? [])
    .filter((r) => typeof r.t === "number" && typeof r.c === "number")
    .map((r) => ({ ts: r.t, v: r.c }));

  // Normalize to 0-100 so all charts share the same yDomain and look consistent
  // (Kalshi vibe). If you prefer price, remove this normalization and set yDomain auto.
  let series: Array<{ ts: number; v: number }> = raw;
  if (raw.length >= 2) {
    const vals = raw.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;

    series =
      span > 0
        ? raw.map((p) => ({ ts: p.ts, v: ((p.v - min) / span) * 100 }))
        : raw.map((p) => ({ ts: p.ts, v: 50 }));
  }

  seriesCache.set(cacheKey, { ts: now, series });
  return series;
}

export async function GET(req: Request) {
  try {
    const key = getKey();
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Missing MASSIVE_API_KEY or POLYGON_API_KEY" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 50);
    const withSeries = url.searchParams.get("series") === "1";

    const sp500 = await getSp500();
    const snapshot = await fetchSnapshots(key);

    const rows: Row[] = (snapshot.tickers ?? [])
      .filter((t: any) => sp500.has(t.ticker))
      .map((t: any) => {
        const day = t.day ?? {};

        const open = day.o;
        const close = day.c;
        const high = day.h;
        const low = day.l;

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

    rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));

    const top = rows.slice(0, limit);

    if (withSeries) {
      const enriched = await Promise.all(
        top.map(async (r) => {
          const series = await fetch5mSeries(key, r.symbol);
          return { ...r, series };
        })
      );

      return NextResponse.json({
        ok: true,
        rows: enriched,
        source: "polygon",
        universe: "sp500",
        series: { interval: "5m", normalized: true },
      });
    }

    return NextResponse.json({
      ok: true,
      rows: top,
      source: "polygon",
      universe: "sp500",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}