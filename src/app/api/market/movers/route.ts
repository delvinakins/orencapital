// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Pt = { ts: number; v: number };

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
  series?: Pt[];
  seriesMeta?: { kind: "real" | "fallback"; interval?: "5m"; normalized: boolean };
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

// ---------- Series helpers ----------
type AggResp = { results?: Array<{ t: number; c: number }> };

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

function normalize0to100(points: Pt[]): Pt[] {
  if (points.length < 2) return points;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  if (span <= 0) return points.map((p) => ({ ts: p.ts, v: 50 }));
  return points.map((p) => ({ ts: p.ts, v: ((p.v - min) / span) * 100 }));
}

// cache series 60s per symbol
const seriesCache = new Map<string, { ts: number; series: Pt[]; kind: "real" | "fallback" }>();

async function fetch5mSeriesReal(key: string, symbol: string): Promise<Pt[]> {
  const now = Date.now();
  const cacheKey = `${symbol}:5m:last7`;
  const cached = seriesCache.get(cacheKey);
  if (cached && now - cached.ts < 60_000 && cached.kind === "real") return cached.series;

  // last 7 days window (captures last full session reliably)
  const today = new Date();
  const from = yyyyMmDd(addDays(today, -7));
  const to = yyyyMmDd(today);

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as AggResp;
  const raw = (data.results ?? [])
    .filter((r) => typeof r.t === "number" && typeof r.c === "number")
    .map((r) => ({ ts: r.t, v: r.c }));

  if (raw.length < 2) return [];

  // keep last ~90 points for clean sparkline
  const trimmed = raw.length > 90 ? raw.slice(-90) : raw;
  const norm = normalize0to100(trimmed);

  seriesCache.set(cacheKey, { ts: now, series: norm, kind: "real" });
  return norm;
}

function fallbackTapeFromDay(day: any): Pt[] {
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

  const raw: Pt[] = [];
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

  return normalize0to100(raw);
}

export async function GET(req: Request) {
  try {
    const key = getKey();
    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing POLYGON_API_KEY" }, { status: 500 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
    const withSeries = url.searchParams.get("series") === "1";

    const sp500 = await getSp500();
    const snapshot = await fetchSnapshots(key);

    const dayBySymbol = new Map<string, any>();

    const rowsBase: Row[] = (snapshot.tickers ?? [])
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

    rowsBase.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
    const top = rowsBase.slice(0, limit);

    if (!withSeries) {
      return NextResponse.json({ ok: true, rows: top, source: "polygon", universe: "sp500" });
    }

    const enriched = await Promise.all(
      top.map(async (r) => {
        const real = await fetch5mSeriesReal(key, r.symbol);
        if (real.length >= 2) {
          return { ...r, series: real, seriesMeta: { kind: "real", interval: "5m", normalized: true } };
        }
        const day = dayBySymbol.get(r.symbol);
        const fb = fallbackTapeFromDay(day);
        return { ...r, series: fb, seriesMeta: { kind: "fallback", normalized: true } };
      })
    );

    return NextResponse.json({
      ok: true,
      rows: enriched,
      source: "polygon",
      universe: "sp500",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}