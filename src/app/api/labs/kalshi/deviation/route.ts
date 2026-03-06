// src/app/api/labs/kalshi/deviation/route.ts
// Oren Deviation Engine V2
// Daily KXINX markets: scored via SPY realized vol + N(d2) digital option model
// EOY KXINXY markets: scored via Kalshi candle history + EWMA baseline

import { NextRequest, NextResponse } from "next/server";
import {
  runDeviationEngine,
  runModelEngine,
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

async function getSPYCandles(days = 20): Promise<Candle[]> {
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
    ts: Math.floor(bar.t / 1000),
    close: bar.c,
  }));
}

async function getKalshiCandles(ticker: string, limit = 60): Promise<Candle[]> {
  const url = `${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=1440&limit=${limit}`;
  const data = await fetchSafe(url);
  const sticks = data?.candlesticks ?? data?.candles ?? [];
  if (!Array.isArray(sticks) || sticks.length === 0) return [];
  return sticks
    .map((c: any) => {
      const close = c.yes_ask ?? c.close ?? c.yes_price ?? null;
      const ts = c.end_period_ts ?? c.ts ?? null;
      if (close == null || ts == null) return null;
      return { ts, close: Number(close) } as Candle;
    })
    .filter((c): c is Candle => c !== null)
    .sort((a, b) => a.ts - b.ts);
}

async function getKalshiQuote(ticker: string): Promise<MarketQuote> {
  const data = await fetchSafe(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
  const m = data?.market ?? data;
  if (!m) return { yesBid: null, yesAsk: null };
  return {
    yesBid: m.yes_bid != null ? Number(m.yes_bid) : null,
    yesAsk: m.yes_ask != null ? Number(m.yes_ask) : null,
  };
}

function hoursUntilClose(): number {
  const now = new Date();
  const closeUTC = new Date(now);
  closeUTC.setUTCHours(21, 0, 0, 0);
  const diff = (closeUTC.getTime() - now.getTime()) / (1000 * 60 * 60);
  return Math.max(0.25, Math.min(6.5, diff));
}

interface StrikeInfo {
  strikeLow: number | null;
  strikeHigh: number | null;
}

function parseStrike(ticker: string): StrikeInfo {
  const tMatch = ticker.match(/T(\d+(?:\.\d+)?)/);
  if (tMatch) return { strikeLow: null, strikeHigh: Math.ceil(Number(tMatch[1])) };
  const bMatch = ticker.match(/B(\d+)/);
  if (bMatch) {
    const lo = Number(bMatch[1]);
    return { strikeLow: lo, strikeHigh: lo + 25 };
  }
  return { strikeLow: null, strikeHigh: null };
}

export interface ScoredMarket {
  id: string;
  source: "kalshi";
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

type ScoringMode = "model" | "history";

interface MarketDef {
  id: string;
  ticker: string;
  title: string;
  category: string;
  closeTime: string | null;
  url: string;
  scoringMode: ScoringMode;
}

function getMarketDefs(): MarketDef[] {
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
      scoringMode: "model",
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7237`,
      ticker: `KXINX-${dateStr}H1600-B7237`,
      title: "S&P 500 7225–7250 today",
      category: "sp500_range",
      closeTime: null,
      url: "https://kalshi.com/markets/kxinx",
      scoringMode: "model",
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7212`,
      ticker: `KXINX-${dateStr}H1600-B7212`,
      title: "S&P 500 7200–7225 today",
      category: "sp500_range",
      closeTime: null,
      url: "https://kalshi.com/markets/kxinx",
      scoringMode: "model",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7300",
      ticker: "KXINXY-26DEC31H1600-B7300",
      title: "S&P 500 7200–7400 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      scoringMode: "history",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7500",
      ticker: "KXINXY-26DEC31H1600-B7500",
      title: "S&P 500 7400–7600 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      scoringMode: "history",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7100",
      ticker: "KXINXY-26DEC31H1600-B7100",
      title: "S&P 500 7000–7200 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      scoringMode: "history",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T9000",
      ticker: "KXINXY-26DEC31H1600-T9000",
      title: "S&P 500 above 9000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      scoringMode: "history",
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T4000",
      ticker: "KXINXY-26DEC31H1600-T4000",
      title: "S&P 500 below 4000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      scoringMode: "history",
    },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const isDebug = req.nextUrl.searchParams.get("debug") === "1";

    if (!isDebug && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    if (!POLYGON_KEY) {
      return NextResponse.json({ ok: false, error: "POLYGON_API_KEY not set" }, { status: 500 });
    }

    const markets = getMarketDefs();
    const hoursLeft = hoursUntilClose();
    const eoyMarkets = markets.filter((m) => m.scoringMode === "history");

    const [spyCandles, ...rest] = await Promise.all([
      getSPYCandles(20),
      ...markets.map((m) => getKalshiQuote(m.ticker)),
      ...eoyMarkets.map((m) => getKalshiCandles(m.ticker)),
    ]);

    const quotes = rest.slice(0, markets.length) as MarketQuote[];
    const eoyCandles = rest.slice(markets.length) as Candle[][];

    let eoyIdx = 0;
    const scored: ScoredMarket[] = markets.map((m, i) => {
      const quote = quotes[i];
      let result: DeviationResult;
      let sparkline: Array<{ ts: number; v: number }>;

      if (m.scoringMode === "model") {
        const { strikeLow, strikeHigh } = parseStrike(m.ticker);
        result = runModelEngine(spyCandles, quote, strikeLow, strikeHigh, hoursLeft);
        sparkline = normalizeSparkline(spyCandles);
      } else {
        const candles = eoyCandles[eoyIdx++];
        result = runDeviationEngine(candles, quote);
        sparkline = normalizeSparkline(candles.length > 0 ? candles : spyCandles);
      }

      return {
        id: m.id,
        source: "kalshi",
        title: m.title,
        ticker: m.ticker,
        category: m.category,
        closeTime: m.closeTime,
        url: m.url,
        quote,
        result,
        sparkline,
        candleSource: m.scoringMode === "model" ? "polygon-spy-daily" : "kalshi-candles",
      };
    });

    const sorted = sortByEdge(scored);

    const response = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: sorted.length,
      spyCandleCount: spyCandles.length,
      hoursUntilClose: hoursLeft,
      markets: sorted,
      ...(isDebug && {
        spyCandles: spyCandles.map((c) => ({
          date: new Date(c.ts * 1000).toISOString().slice(0, 10),
          close: c.close,
        })),
      }),
    };

    if (!isDebug) cache = { ts: Date.now(), data: response };
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}