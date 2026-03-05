// src/app/api/labs/kalshi/deviation/route.ts
// Oren Deviation Engine
// Candle history: Polymarket SPX daily Up/Down series (no auth needed)
// Live quotes: Kalshi KXINX / KXINXY markets

import { NextResponse } from "next/server";
import {
  runDeviationEngine,
  sortByEdge,
  normalizeSparkline,
  type Candle,
  type MarketQuote,
  type DeviationResult,
} from "@/lib/kalshi/deviationEngine";

export const runtime = "nodejs";
export const maxDuration = 30;

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLY_GAMMA = "https://gamma-api.polymarket.com";
const POLY_CLOB = "https://clob.polymarket.com";

let cache: { ts: number; data: any } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchSafe(url: string, ms = 7000): Promise<any | null> {
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

// ── Polymarket: build SPX daily candles from last N trading days ──────────────
// Uses the spx-daily-up-or-down series — each day is a market with a price history
function buildSlug(date: Date): string {
  const months = ["january","february","march","april","may","june",
                  "july","august","september","october","november","december"];
  const m = months[date.getUTCMonth()];
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  return `spx-up-or-down-on-${m}-${d}-${y}`;
}

// Get last N calendar days (skipping weekends)
function getRecentTradingDays(n: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  let cursor = new Date(now);
  cursor.setUTCDate(cursor.getUTCDate() - 1); // start from yesterday

  while (days.length < n) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) { // skip Sun/Sat
      days.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

async function getPolymarketSPXCandles(days = 30): Promise<Candle[]> {
  const tradingDays = getRecentTradingDays(days);

  // Fetch all events in parallel
  const results = await Promise.allSettled(
    tradingDays.map(async (date) => {
      const slug = buildSlug(date);
      const data = await fetchSafe(`${POLY_GAMMA}/events?slug=${slug}`);
      const event = Array.isArray(data) ? data[0] : data;
      if (!event?.markets?.length) return null;

      const market = event.markets[0];
      // Use lastTradePrice for resolved markets (outcomePrices snaps to 0/1 after resolution)
      let upPrice = 50;
      try {
        const ltp = Number(market.lastTradePrice ?? 0);
        if (ltp > 0.01 && ltp < 0.99) {
          upPrice = ltp * 100;
        } else {
          const prices = typeof market.outcomePrices === "string"
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;
          const p = Number(prices[0]);
          if (p > 0.01 && p < 0.99) upPrice = p * 100;
        }
      } catch {}

      return {
        ts: Math.floor(date.getTime() / 1000),
        close: upPrice,
      } as Candle;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<Candle | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((c): c is Candle => c !== null && c.close > 0 && c.close <= 100)
    .sort((a, b) => a.ts - b.ts); // chronological
}

// ── Kalshi: live quote ────────────────────────────────────────────────────────
async function getKalshiQuote(ticker: string): Promise<MarketQuote> {
  const data = await fetchSafe(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
  const m = data?.market ?? data;
  if (!m) return { yesBid: null, yesAsk: null };
  return {
    yesBid: m.yes_bid != null ? Number(m.yes_bid) : null,
    yesAsk: m.yes_ask != null ? Number(m.yes_ask) : null,
  };
}

// ── Scored market type ────────────────────────────────────────────────────────
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

// ── Curated Kalshi markets ────────────────────────────────────────────────────
function getCuratedMarkets() {
  const now = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = months[now.getUTCMonth()];
  const dd = String(now.getUTCDate() + (now.getUTCHours() >= 21 ? 1 : 0)).padStart(2, "0");
  const dateStr = `${yy}${mm}${dd}`;

  return [
    // Today's daily brackets
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
    // EOY range markets
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

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    // Fetch candles + market quotes in parallel
    const [spxCandles, ...quoteResults] = await Promise.all([
      getPolymarketSPXCandles(30),
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
        candleSource: "polymarket-spx-daily",
      };
    });

    const sorted = sortByEdge(scored);

    const response = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: sorted.length,
      candleCount: spxCandles.length,
      markets: sorted,
    };

    cache = { ts: Date.now(), data: response };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}