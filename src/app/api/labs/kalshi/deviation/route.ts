// src/app/api/labs/kalshi/deviation/route.ts
// Oren Deviation Engine
// Candle history: Polygon.io SPX daily closes (already integrated)
// Live quotes: Kalshi KXINX / KXINXY markets

import { NextRequest, NextResponse } from "next/server";
import {
  runDeviationEngine,
  sortByEdge,
  normalizeSparkline,
  type Candle,
  type MarketQuote,
  type DeviationResult,
} from "@/lib/kalshi/deviationEngine";

export const runtime = "nodejs";
export const maxDuration = 45;

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYGON_BASE = "https://api.polygon.io";
const POLYGON_KEY = process.env.POLYGON_API_KEY ?? "";

let cache: { ts: number; data: any } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchSafe(url: string, ms = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Polygon: SPX daily closes ────────────────────────────────────────────────
async function getSPXCandles(days = 15): Promise<Candle[]> {
  // Request 2x window to account for weekends/holidays, then trim to `days`
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days * 2);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const url =
    `${POLYGON_BASE}/v2/aggs/ticker/SPY/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=${days * 2}&apiKey=${POLYGON_KEY}`;

  const data = await fetchSafe(url);
  if (!Array.isArray(data?.results) || data.results.length === 0) return [];

  return data.results.slice(-days).map((bar: any) => ({
    ts: Math.floor(bar.t / 1000), // Polygon returns ms timestamps
    close: bar.c,
  }));
}

// ── Kalshi: live quote ──────────────────────────────────────────────────────
async function getKalshiQuote(ticker: string): Promise<MarketQuote> {
  const data = await fetchSafe(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
  const m = data?.market ?? data;
  if (!m) return { yesBid: null, yesAsk: null };
  return {
    yesBid: m.yes_bid != null ? Number(m.yes_bid) : null,
    yesAsk: m.yes_ask != null ? Number(m.yes_ask) : null,
  };
}

// ── Scored market type ──────────────────────────────────────────────────────
export interface ScoredMarket {
  id: string;
  source: "kalshi" | "polymarket";
  title: string;
  ticker: string;
  category: string;
  closeTime: string | null;
  url: string;
  quote: MarketQuote;
  result: DeviationResult;
  sparkline: Array<{ ts: number; v: number }>;
  candleSource: string;
}

// ── Curated Kalshi markets ──────────────────────────────────────────────────
function getCuratedMarkets() {
  const now = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = months[now.getUTCMonth()];
  const dd = String(now.getUTCDate() + (now.getUTCHours() >= 21 ? 1 : 0)).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;

  return [
    {
      id: `kalshi:KXINX-${dateStr}H1600-T7249.9999`,
      ticker: `KXINX-${dateStr}H1600-T7249.9999`,
      title: "S&P 500 above 7250 today",
      category: "sp500_level",
      closeTime: null,
      url: "https://kalshi.com/markets/kxinx",
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7237`,
      ticker: `KXINX-${dateStr}H1600-B7237`,
      title: "S&P 500 7225–7250 today",
      category: "sp500_range",
      closeTime: null,
      url: "https://kalshi.com/markets/kxinx",
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7212`,
      ticker: `KXINX-${dateStr}H1600-B7212`,
      title: "S&P 500 7200–7225 today",
      category: "sp500_range",
      closeTime: null,
      url: "https://kalshi.com/markets/kxinx",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7300",
      ticker: "KXINXY-26DEC31H1600-B7300",
      title: "S&P 500 7200–7400 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7500",
      ticker: "KXINXY-26DEC31H1600-B7500",
      title: "S&P 500 7400–7600 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7100",
      ticker: "KXINXY-26DEC31H1600-B7100",
      title: "S&P 500 7000–7200 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T9000",
      ticker: "KXINXY-26DEC31H1600-T9000",
      title: "S&P 500 above 9000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T4000",
      ticker: "KXINXY-26DEC31H1600-T4000",
      title: "S&P 500 below 4000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
    },
  ];
}

// ── Handler ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const isDebug = req.nextUrl.searchParams.get("debug") === "1";

    if (!isDebug && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    if (!POLYGON_KEY) {
      return NextResponse.json(
        { ok: false, error: "POLYGON_API_KEY env var not set" },
        { status: 500 }
      );
    }

    const [spxCandles, ...quoteResults] = await Promise.all([
      getSPXCandles(15),
      ...getCuratedMarkets().map((m) => getKalshiQuote(m.ticker)),
    ]);

    const markets = getCuratedMarkets();

    const scored: ScoredMarket[] = markets.map((m, i) => {
      const quote = quoteResults[i];
      const result = runDeviationEngine(spxCandles, quote);
      const sparkline = normalizeSparkline(spxCandles);

      return {
        id: m.id,
        source: "kalshi" as const,
        title: m.title,
        ticker: m.ticker,
        category: m.category,
        closeTime: m.closeTime,
        url: m.url,
        quote,
        result,
        sparkline,
        candleSource: "polygon-spx-daily",
      };
    });

    const sorted = sortByEdge(scored);

    const response = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: sorted.length,
      candleCount: spxCandles.length,
      markets: sorted,
      ...(isDebug && {
        candles: spxCandles.map((c) => ({
          date: new Date(c.ts * 1000).toISOString().slice(0, 10),
          close: c.close,
        })),
      }),
    };

    if (!isDebug) {
      cache = { ts: Date.now(), data: response };
    }

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}