// src/app/api/labs/kalshi/deviation/route.ts
// Runs the Oren Deviation Engine across all S&P prediction markets
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

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";
const POLYMARKET_CLOB = "https://clob.polymarket.com";

// Cache the full board for 60 seconds
let cache: { ts: number; data: any } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchSafe(url: string, ms = 8000): Promise<any | null> {
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

// ── Kalshi: get quote (mid/spread) ───────────────────────────────────────────
async function getKalshiQuote(ticker: string): Promise<MarketQuote> {
  const data = await fetchSafe(`${KALSHI_BASE}/markets/${encodeURIComponent(ticker)}/orderbook`);
  if (!data?.orderbook) return { yesBid: null, yesAsk: null };

  const yesBids: any[] = data.orderbook.yes_bids ?? [];
  const noBids: any[] = data.orderbook.no_bids ?? [];

  const bestYesBid = yesBids.reduce((best: any, l: any) => {
    const p = Number(l.price);
    return p > (best?.price ?? -Infinity) ? { price: p, quantity: Number(l.quantity ?? 0) } : best;
  }, null);

  const bestNoBid = noBids.reduce((best: any, l: any) => {
    const p = Number(l.price);
    return p > (best?.price ?? -Infinity) ? { price: p, quantity: Number(l.quantity ?? 0) } : best;
  }, null);

  const yesBid = bestYesBid?.price ?? null;
  const yesAsk = bestNoBid?.price != null ? 100 - bestNoBid.price : null;

  return {
    yesBid,
    yesAsk,
    yesBidQty: bestYesBid?.quantity ?? undefined,
    noBidQty: bestNoBid?.quantity ?? undefined,
  };
}

// ── Kalshi: get candles ───────────────────────────────────────────────────────
async function getKalshiCandles(ticker: string, seriesTicker?: string): Promise<Candle[]> {
  const period = "60";
  const series = seriesTicker ?? ticker.split("-")[0];

  // Try live candles first
  const liveData = await fetchSafe(
    `${KALSHI_BASE}/series/${encodeURIComponent(series)}/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${period}`
  );

  if (liveData?.candlesticks?.length) {
    return (liveData.candlesticks as any[])
      .slice(-120)
      .map((c: any) => ({ ts: Number(c.start_ts), close: Number(c.close) }));
  }

  // Fallback: historical
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 7 * 24 * 60 * 60;
  const histData = await fetchSafe(
    `${KALSHI_BASE}/historical/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=${period}`
  );

  if (histData?.candlesticks?.length) {
    return (histData.candlesticks as any[])
      .slice(-120)
      .map((c: any) => ({ ts: Number(c.start_ts), close: Number(c.close) }));
  }

  return [];
}

// ── Polymarket: get quote ────────────────────────────────────────────────────
async function getPolymarketQuote(conditionId: string): Promise<MarketQuote> {
  // Gamma API has price data
  const data = await fetchSafe(`${POLYMARKET_GAMMA}/markets/${conditionId}`);
  if (!data) return { yesBid: null, yesAsk: null };

  // Gamma returns outcomePrices as JSON array string e.g. '["0.47","0.53"]'
  let outcomePrices: number[] = [];
  try {
    const raw = typeof data.outcomePrices === "string"
      ? JSON.parse(data.outcomePrices)
      : data.outcomePrices;
    outcomePrices = (raw as string[]).map(Number);
  } catch {
    outcomePrices = [];
  }

  // YES price is first outcome (cents equivalent: multiply by 100)
  const yesPrice = outcomePrices[0] != null ? outcomePrices[0] * 100 : null;

  // Try CLOB orderbook for spread
  let yesBid: number | null = yesPrice;
  let yesAsk: number | null = yesPrice;

  const clobData = await fetchSafe(`${POLYMARKET_CLOB}/book?token_id=${conditionId}`);
  if (clobData) {
    const bids: any[] = clobData.bids ?? [];
    const asks: any[] = clobData.asks ?? [];
    if (bids.length) {
      yesBid = Math.max(...bids.map((b: any) => Number(b.price) * 100));
    }
    if (asks.length) {
      yesAsk = Math.min(...asks.map((a: any) => Number(a.price) * 100));
    }
  }

  return { yesBid, yesAsk };
}

// ── Polymarket: get candles via time-series ──────────────────────────────────
async function getPolymarketCandles(conditionId: string): Promise<Candle[]> {
  // Gamma API price history
  const data = await fetchSafe(
    `${POLYMARKET_GAMMA}/prices-history?market=${conditionId}&interval=1h&fidelity=60`
  );

  const history: any[] = data?.history ?? data?.prices ?? [];
  if (!history.length) return [];

  return history
    .slice(-120)
    .map((p: any) => ({
      ts: Number(p.t ?? p.timestamp ?? 0),
      close: Number(p.p ?? p.price ?? 0) * 100, // Polymarket prices are 0–1, convert to cents
    }))
    .filter((c) => c.ts > 0 && c.close >= 0 && c.close <= 100);
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

// ── Score a single Kalshi market ─────────────────────────────────────────────
async function scoreKalshiMarket(m: any): Promise<ScoredMarket> {
  const [quote, candles] = await Promise.all([
    getKalshiQuote(m.ticker),
    getKalshiCandles(m.ticker, m.seriesTicker),
  ]);

  const result = runDeviationEngine(candles, quote);
  const sparkline = normalizeSparkline(candles);

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
  };
}

// ── Score a single Polymarket market ─────────────────────────────────────────
async function scorePolymarketMarket(m: any): Promise<ScoredMarket> {
  const [quote, candles] = await Promise.all([
    getPolymarketQuote(m.ticker),
    getPolymarketCandles(m.ticker),
  ]);

  const result = runDeviationEngine(candles, quote);
  const sparkline = normalizeSparkline(candles);

  return {
    id: m.id,
    source: "polymarket",
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

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    // Serve cache if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    // 1. Fetch market list
    const marketsRes = await fetchSafe(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/labs/kalshi/markets`
    );

    const markets: any[] = marketsRes?.markets ?? [];

    if (!markets.length) {
      return NextResponse.json({ ok: false, error: "No markets found" }, { status: 502 });
    }

    // 2. Score all markets concurrently (cap at 15 to avoid rate limits)
    const capped = markets.slice(0, 15);

    const scored = (
      await Promise.allSettled(
        capped.map((m) =>
          m.source === "kalshi" ? scoreKalshiMarket(m) : scorePolymarketMarket(m)
        )
      )
    )
      .filter((r): r is PromiseFulfilledResult<ScoredMarket> => r.status === "fulfilled")
      .map((r) => r.value);

    // 3. Sort by |edgeZ| descending
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