// src/app/api/labs/kalshi/deviation/route.ts
// Runs the Oren Deviation Engine across S&P prediction markets
// Returns markets sorted by |edgeZ| descending

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

// ── Curated markets ───────────────────────────────────────────────────────────
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
      seriesTicker: "KXINX",
      title: `S&P 500 above 7250 today`,
      category: "sp500_level",
      closeTime: null,
      url: `https://kalshi.com/markets/kxinx`,
      source: "kalshi" as const,
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7237`,
      ticker: `KXINX-${dateStr}H1600-B7237`,
      seriesTicker: "KXINX",
      title: `S&P 500 between 7225–7250 today`,
      category: "sp500_range",
      closeTime: null,
      url: `https://kalshi.com/markets/kxinx`,
      source: "kalshi" as const,
    },
    {
      id: `kalshi:KXINX-${dateStr}H1600-B7212`,
      ticker: `KXINX-${dateStr}H1600-B7212`,
      seriesTicker: "KXINX",
      title: `S&P 500 between 7200–7225 today`,
      category: "sp500_range",
      closeTime: null,
      url: `https://kalshi.com/markets/kxinx`,
      source: "kalshi" as const,
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7300",
      ticker: "KXINXY-26DEC31H1600-B7300",
      seriesTicker: "KXINXY",
      title: "S&P 500 between 7200–7400 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      source: "kalshi" as const,
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7500",
      ticker: "KXINXY-26DEC31H1600-B7500",
      seriesTicker: "KXINXY",
      title: "S&P 500 between 7400–7600 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      source: "kalshi" as const,
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-B7100",
      ticker: "KXINXY-26DEC31H1600-B7100",
      seriesTicker: "KXINXY",
      title: "S&P 500 between 7000–7200 EOY 2026",
      category: "sp500_range",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      source: "kalshi" as const,
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T9000",
      ticker: "KXINXY-26DEC31H1600-T9000",
      seriesTicker: "KXINXY",
      title: "S&P 500 above 9000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      source: "kalshi" as const,
    },
    {
      id: "kalshi:KXINXY-26DEC31H1600-T4000",
      ticker: "KXINXY-26DEC31H1600-T4000",
      seriesTicker: "KXINXY",
      title: "S&P 500 below 4000 EOY 2026",
      category: "sp500_level",
      closeTime: "2026-12-31T21:00:00Z",
      url: "https://kalshi.com/markets/kxinxy",
      source: "kalshi" as const,
    },
  ];
}

// ── Kalshi: get quote from market endpoint ────────────────────────────────────
async function getKalshiQuote(ticker: string): Promise<MarketQuote> {
  const data = await fetchSafe(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}`);
  const m = data?.market ?? data;
  if (!m) return { yesBid: null, yesAsk: null };

  const yesBid = m.yes_bid != null ? Number(m.yes_bid) : null;
  const yesAsk = m.yes_ask != null ? Number(m.yes_ask) : null;

  return { yesBid, yesAsk };
}

// ── Kalshi: get candles ───────────────────────────────────────────────────────
// Tries multiple period intervals and lookback windows to maximize data
async function getKalshiCandles(ticker: string, seriesTicker: string): Promise<Candle[]> {
  const endTs = Math.floor(Date.now() / 1000);

  // Try multiple approaches in order of preference
  const attempts = [
    // Historical 30d, 1h candles
    `${KALSHI_BASE}/historical/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${endTs - 30 * 24 * 60 * 60}&end_ts=${endTs}&period_interval=60`,
    // Historical 7d, 1h candles
    `${KALSHI_BASE}/historical/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${endTs - 7 * 24 * 60 * 60}&end_ts=${endTs}&period_interval=60`,
    // Historical 30d, 1d candles
    `${KALSHI_BASE}/historical/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${endTs - 30 * 24 * 60 * 60}&end_ts=${endTs}&period_interval=1440`,
    // Live series endpoint, 1h
    `${KALSHI_BASE}/series/${encodeURIComponent(seriesTicker)}/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=60`,
    // Live series endpoint, 1d
    `${KALSHI_BASE}/series/${encodeURIComponent(seriesTicker)}/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=1440`,
  ];

  for (const url of attempts) {
    const data = await fetchSafe(url);
    const sticks: any[] = data?.candlesticks ?? [];
    if (sticks.length >= 2) {
      return sticks
        .slice(-120)
        .map((c: any) => ({ ts: Number(c.start_ts), close: Number(c.close) }))
        .filter((c) => c.close > 0 && c.close <= 100);
    }
  }

  return [];
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
}

async function scoreMarket(m: ReturnType<typeof getCuratedMarkets>[number]): Promise<ScoredMarket> {
  const [quote, candles] = await Promise.all([
    getKalshiQuote(m.ticker),
    getKalshiCandles(m.ticker, m.seriesTicker),
  ]);

  const result = runDeviationEngine(candles, quote);
  const sparkline = normalizeSparkline(candles);

  return {
    id: m.id,
    source: m.source,
    title: m.title,
    ticker: m.ticker,
    category: m.category,
    closeTime: m.closeTime,
    url: m.url,
    quote,
    result,
    sparkline,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    const markets = getCuratedMarkets();

    const scored = (
      await Promise.allSettled(markets.map(scoreMarket))
    )
      .filter((r): r is PromiseFulfilledResult<ScoredMarket> => r.status === "fulfilled")
      .map((r) => r.value);

    const sorted = sortByEdge(scored);

    const response = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: sorted.length,
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