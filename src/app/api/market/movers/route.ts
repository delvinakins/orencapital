import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series?: Array<{ ts: number; v: number }>; // normalized 0-100
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Polygon snapshot ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ---------- Series: aggs + fallback ----------

type AggResp = { results?: Array<{ t: number; c: number }> };

// cache series 60s per symbol
const seriesCache = new Map<string, { ts: number; series: Array<{ ts: number; v: number }> }>();

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

async function fetch5mSeriesWide(key: string, symbol: string): Promise<Array<{ ts: number; v: number }>> {
  const cacheKey = `${symbol}:5m:wide`;
  const now = Date.now();
  const cached = seriesCache.get(cacheKey);
  if (cached && now - cached.ts < 60_000) return cached.series;

  // Wide window (last 7 days → today) so we don’t get empty on weekends/holidays/early-hours
  const today = new Date();
  const from = yyyyMmDd(addDays(today, -7));
  const to = yyyyMmDd(today);

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    seriesCache.set(cacheKey, { ts: now, series: [] });
    return [];
  }

  const data = (await res.json()) as AggResp;

  // Use closes as the series signal
  const raw = (data.results ?? [])
    .filter((r) => typeof r.t === "number" && typeof r.c === "number")
    .map((r) => ({ ts: r.t, v: r.c }));

  // Keep the last ~1 trading day worth of 5m bars (78 bars ~ 6.5 hours)
  const trimmed = raw.length > 90 ? raw.slice(-90) : raw;

  const series = normalize0to100(trimmed);
  seriesCache.set(cacheKey, { ts: now, series });
  return series;
}

function fallbackSeriesFromDay(day: any): Array<{ ts: number; v: number }> {
  const now = Date.now();

  const o = typeof day?.o === "number" ? day.o : null;
  const c = typeof day?.c === "number" ? day.c : null;
  const h = typeof day?.h === "number" ? day.h : null;
  const l = typeof day?.l === "number" ? day.l : null;

  // If we can’t build anything meaningful, return a flat midline
  if (o == null || c == null) {
    return [
      { ts: now - 60 * 60 * 1000, v: 50 },
      { ts: now, v: 50 },
    ];
  }

  // Synthetic “tape-like” steps using OHLC (still normalized after)
  const pts = [
    { ts: now - 6 * 60 * 60 * 1000, v: o },
    { ts: now - 4 * 60 * 60 * 1000, v: l ?? Math.min(o, c) },
    { ts: now - 2 * 60 * 60 * 1000, v: h ?? Math.max(o, c) },
    { ts: now - 1 * 60 * 60 * 1000, v: (o + c) / 2 },
    { ts: now, v: c },
  ];

  return normalize0to100(pts);
}

export async function GET(req: Request) {
  const key = getKey();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 50);
  const withSeries = url.searchParams.get("series") === "1";

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Missing MASSIVE_API_KEY or POLYGON_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const sp500 = await getSp500();
    const snapshot = await fetchSnapshots(key);

    // Keep a map of day data for fallback series
    const dayBySymbol = new Map<string, any>();

    const rows: Row[] = (snapshot.tickers ?? [])
      .filter((t: any) => sp500.has(t.ticker))
      .map((t: any) => {
        const day = t.day ?? {};
        dayBySymbol.set(t.ticker, day);

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

    if (!withSeries) {
      return NextResponse.json({
        ok: true,
        rows: top,
        source: "polygon",
        universe: "sp500",
      });
    }

    const enriched = await Promise.all(
      top.map(async (r) => {
        let series = await fetch5mSeriesWide(key, r.symbol);

        // If Polygon aggs still returns empty, synthesize a series from snapshot OHLC
        if (!series || series.length < 2) {
          const day = dayBySymbol.get(r.symbol);
          series = fallbackSeriesFromDay(day);
        }

        return { ...r, series };
      })
    );

    return NextResponse.json({
      ok: true,
      rows: enriched,
      source: "polygon",
      universe: "sp500",
      series: { interval: "5m", normalized: true, fallback: "ohlc" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}