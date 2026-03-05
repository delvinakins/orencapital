// src/app/api/labs/kalshi/deviation/route.ts
// Oren Deviation Engine
// Candle history: Polymarket SPX daily Up/Down series (no auth needed)
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
const POLY_GAMMA = "https://gamma-api.polymarket.com";
const POLY_CLOB = "https://clob.polymarket.com";

let cache: { ts: number; data: any } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchSafe(url: string, ms = 4000): Promise<any | null> {
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

// ── Polymarket: build SPX daily candles ──────────────────────────────────────
function buildSlug(date: Date): string {
  const months = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ];
  const m = months[date.getUTCMonth()];
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  return `spx-up-or-down-on-${m}-${d}-${y}`;
}

function getRecentTradingDays(n: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  let cursor = new Date(now);
  cursor.setUTCDate(cursor.getUTCDate() - 1);

  while (days.length < n) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

interface SlugDebug {
  slug: string;
  date: string;
  step: "no_event" | "no_token" | "ok_gamma" | "no_history_clob" | "no_valid_price_clob" | "ok_clob";
  tokenId?: string | null;
  closePrice?: number | null;
  source?: string;
}

// Extract "Up" outcome close price from Gamma market object.
// outcomePrices is typically '["0.97","0.03"]' — index 0 = Up.
// Falls back to lastTradePrice if present.
function extractGammaClosePrice(market: any): number | null {
  try {
    const raw = market.outcomePrices ?? market.lastTradePrice ?? null;
    if (!raw) return null;

    if (typeof raw === "string" && raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      const p = Number(arr[0]);
      if (!isNaN(p) && p > 0.02 && p < 0.98) return p * 100;
      return null;
    }

    const p = Number(raw);
    if (!isNaN(p) && p > 0.02 && p < 0.98) return p * 100;
    return null;
  } catch {
    return null;
  }
}

async function getPolymarketSPXCandles(
  days = 15,
  debug = false
): Promise<{ candles: Candle[]; slugDebug: SlugDebug[] }> {
  const tradingDays = getRecentTradingDays(days);
  const slugDebug: SlugDebug[] = [];

  const results = await Promise.allSettled(
    tradingDays.map(async (date): Promise<Candle | null> => {
      const slug = buildSlug(date);
      const dateStr = date.toISOString().slice(0, 10);
      const data = await fetchSafe(`${POLY_GAMMA}/events?slug=${slug}`);
      const event = Array.isArray(data) ? data[0] : data;

      if (!event?.markets?.length) {
        if (debug) slugDebug.push({ slug, date: dateStr, step: "no_event" });
        return null;
      }

      const market = event.markets[0];

      // Extract tokenId for CLOB fallback
      let tokenId: string | null = null;
      try {
        const ids =
          typeof market.clobTokenIds === "string"
            ? JSON.parse(market.clobTokenIds)
            : market.clobTokenIds;
        tokenId = ids?.[0] ?? null;
      } catch {}

      if (!tokenId) {
        if (debug) slugDebug.push({ slug, date: dateStr, step: "no_token" });
        return null;
      }

      // ── Strategy 1: Gamma outcomePrices (resolved markets) ──────────────────
      const gammaPrice = extractGammaClosePrice(market);
      if (gammaPrice !== null) {
        if (debug)
          slugDebug.push({ slug, date: dateStr, step: "ok_gamma", tokenId, closePrice: gammaPrice, source: "gamma" });
        return { ts: Math.floor(date.getTime() / 1000), close: gammaPrice };
      }

      // ── Strategy 2: CLOB prices-history (live/recent markets) ───────────────
      const histData = await fetchSafe(
        `${POLY_CLOB}/prices-history?market=${tokenId}&interval=1d&fidelity=60`
      );
      const history = histData?.history;

      if (!Array.isArray(history) || history.length === 0) {
        if (debug)
          slugDebug.push({ slug, date: dateStr, step: "no_history_clob", tokenId });
        return null;
      }

      let closePrice: number | null = null;
      for (let i = history.length - 1; i >= 0; i--) {
        const p = Number(history[i].p);
        if (p > 0.02 && p < 0.97) {
          closePrice = p * 100;
          break;
        }
      }

      if (closePrice === null) {
        if (debug)
          slugDebug.push({ slug, date: dateStr, step: "no_valid_price_clob", tokenId });
        return null;
      }

      if (debug)
        slugDebug.push({ slug, date: dateStr, step: "ok_clob", tokenId, closePrice, source: "clob" });

      return { ts: Math.floor(date.getTime() / 1000), close: closePrice };
    })
  );

  const candles = results
    .filter((r): r is PromiseFulfilledResult<Candle | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((c): c is Candle => c !== null)
    .sort((a, b) => a.ts - b.ts);

  return { candles, slugDebug };
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

    const [{ candles: spxCandles, slugDebug }, ...quoteResults] = await Promise.all([
      getPolymarketSPXCandles(15, isDebug),
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
      ...(isDebug && { slugDebug }),
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