// src/app/api/labs/kalshi/deviation/route.ts
// Oren Deviation Engine V3
// Dynamically discovers KXINX brackets near current SPX price
// Scores via SPY realized vol + N(d2) digital option model

import { NextRequest, NextResponse } from "next/server";
import {
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

// ── SPY daily candles from Polygon ───────────────────────────────────────────
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

// ── Discover today's KXINX markets from Kalshi ──────────────────────────────
interface KalshiMarketRaw {
  ticker: string;
  subtitle: string;
  yes_bid: number | null;
  yes_ask: number | null;
  floor_strike: number | null;
  cap_strike: number | null;
  strike_type: string;
}

async function getKXINXMarkets(eventTicker: string): Promise<KalshiMarketRaw[]> {
  const data = await fetchSafe(
    `${KALSHI_BASE}/events/${encodeURIComponent(eventTicker)}/markets?limit=50`
  );
  return data?.markets ?? [];
}

// ── Build today's event ticker ────────────────────────────────────────────────
function getTodayEventTicker(): string {
  const now = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = months[now.getUTCMonth()];
  // Advance to next trading day if after 4pm EST (21:00 UTC)
  const dd = String(now.getUTCDate() + (now.getUTCHours() >= 21 ? 1 : 0)).padStart(2, "0");
  return `KXINX-${yy}${mm}${dd}H1600`;
}

// ── Parse strike info from Kalshi market ─────────────────────────────────────
interface StrikeInfo {
  strikeLow: number | null;
  strikeHigh: number | null;
  label: string;
}

function parseKalshiStrike(m: KalshiMarketRaw): StrikeInfo {
  const floor = m.floor_strike != null ? Number(m.floor_strike) : null;
  const cap = m.cap_strike != null ? Number(m.cap_strike) : null;
  const type = m.strike_type ?? "";

  // Range bracket: floor ≤ SPX ≤ cap
  if (type === "between" && floor != null && cap != null) {
    return {
      strikeLow: floor,
      strikeHigh: cap,
      label: `S&P 500 ${floor.toLocaleString()}–${cap.toLocaleString()} today`,
    };
  }
  // Above cap
  if ((type === "greater" || type === "above") && cap != null) {
    return {
      strikeLow: null,
      strikeHigh: cap,
      label: `S&P 500 above ${cap.toLocaleString()} today`,
    };
  }
  // Below floor
  if ((type === "less" || type === "below") && floor != null) {
    return {
      strikeLow: floor,
      strikeHigh: null,
      label: `S&P 500 below ${floor.toLocaleString()} today`,
    };
  }

  // Fallback: parse from ticker
  const tMatch = m.ticker.match(/T(\d+(?:\.\d+)?)/);
  if (tMatch) {
    const k = Math.ceil(Number(tMatch[1]));
    return { strikeLow: null, strikeHigh: k, label: `S&P 500 above ${k.toLocaleString()} today` };
  }
  const bMatch = m.ticker.match(/B(\d+)/);
  if (bMatch) {
    const lo = Number(bMatch[1]);
    return { strikeLow: lo, strikeHigh: lo + 25, label: `S&P 500 ${lo.toLocaleString()}–${(lo + 25).toLocaleString()} today` };
  }

  return { strikeLow: null, strikeHigh: null, label: m.subtitle ?? m.ticker };
}

// ── Select brackets nearest to current SPX price ─────────────────────────────
// SPY * 10 ≈ SPX. Returns the 5 most relevant markets (2 below, current, 2 above)
function selectNearestBrackets(
  markets: KalshiMarketRaw[],
  spxPrice: number,
  count = 5
): KalshiMarketRaw[] {
  // Score each market by how close its midpoint is to current SPX
  const scored = markets
    .map((m) => {
      const floor = m.floor_strike != null ? Number(m.floor_strike) : null;
      const cap = m.cap_strike != null ? Number(m.cap_strike) : null;
      let mid: number;
      if (floor != null && cap != null) mid = (floor + cap) / 2;
      else if (cap != null) mid = cap + 25;
      else if (floor != null) mid = floor - 25;
      else mid = spxPrice;
      return { m, dist: Math.abs(mid - spxPrice) };
    })
    .sort((a, b) => a.dist - b.dist);

  return scored.slice(0, count).map((s) => s.m);
}

// ── Hours remaining until 4pm EST ────────────────────────────────────────────
function hoursUntilClose(): number {
  const now = new Date();
  const closeUTC = new Date(now);
  closeUTC.setUTCHours(21, 0, 0, 0);
  const diff = (closeUTC.getTime() - now.getTime()) / (1000 * 60 * 60);
  return Math.max(0.25, Math.min(6.5, diff));
}

// ── Scored market type ────────────────────────────────────────────────────────
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
  strikeLow: number | null;
  strikeHigh: number | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const isDebug = req.nextUrl.searchParams.get("debug") === "1";

    if (!isDebug && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    if (!POLYGON_KEY) {
      return NextResponse.json({ ok: false, error: "POLYGON_API_KEY not set" }, { status: 500 });
    }

    const eventTicker = getTodayEventTicker();
    const hoursLeft = hoursUntilClose();

    // Fetch SPY candles + today's KXINX markets in parallel
    const [spyCandles, rawMarkets] = await Promise.all([
      getSPYCandles(20),
      getKXINXMarkets(eventTicker),
    ]);

    if (spyCandles.length === 0) {
      return NextResponse.json({ ok: false, error: "No SPY candles from Polygon" }, { status: 500 });
    }

    const spotSPY = spyCandles[spyCandles.length - 1].close;
    const spxPrice = spotSPY * 10; // SPY → SPX approximation

    // Select nearest brackets to current SPX
    const selectedMarkets = selectNearestBrackets(rawMarkets, spxPrice, 5);

    if (selectedMarkets.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `No markets found for event ${eventTicker}`,
        eventTicker,
      }, { status: 404 });
    }

    // Fetch live quotes for selected markets
    const quotes = await Promise.all(
      selectedMarkets.map((m) => getKalshiQuote(m.ticker))
    );

    const sparkline = normalizeSparkline(spyCandles);

    const scored: ScoredMarket[] = selectedMarkets.map((m, i) => {
      const quote = quotes[i];
      const { strikeLow, strikeHigh, label } = parseKalshiStrike(m);
      const result = runModelEngine(spyCandles, quote, strikeLow, strikeHigh, hoursLeft);

      return {
        id: `kalshi:${m.ticker}`,
        source: "kalshi",
        title: label,
        ticker: m.ticker,
        category: strikeLow != null && strikeHigh != null ? "sp500_range" : "sp500_level",
        closeTime: null,
        url: "https://kalshi.com/markets/kxinx",
        quote,
        result,
        sparkline,
        candleSource: "polygon-spy-daily",
        strikeLow,
        strikeHigh,
      };
    });

    const sorted = sortByEdge(scored);

    const response = {
      ok: true,
      updatedAt: new Date().toISOString(),
      count: sorted.length,
      eventTicker,
      spxPrice: Math.round(spxPrice),
      spyCandleCount: spyCandles.length,
      hoursUntilClose: hoursLeft,
      markets: sorted,
      ...(isDebug && {
        spyCandles: spyCandles.map((c) => ({
          date: new Date(c.ts * 1000).toISOString().slice(0, 10),
          close: c.close,
        })),
        allMarketCount: rawMarkets.length,
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