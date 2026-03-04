// src/app/api/labs/kalshi/markets/route.ts
// Fetches S&P 500 prediction markets from Kalshi + Polymarket, normalized to one schema

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";

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

export interface NormalizedMarket {
  id: string;
  source: "kalshi" | "polymarket";
  title: string;
  subtitle: string;
  ticker: string;
  seriesTicker?: string;
  category: "sp500_level" | "sp500_weekly" | "sp500_range" | "other";
  closeTime: string | null;
  url: string;
}

// Known Kalshi S&P 500 series tickers
// KXINX  = S&P daily range
// KXINXY = S&P yearly range
// KXSP500 = S&P level / close
const KALSHI_SP_SERIES = ["KXINX", "KXINXY", "KXSP500", "INXD", "INXW"];

async function fetchKalshiMarkets(): Promise<NormalizedMarket[]> {
  const seen = new Set<string>();
  const results: NormalizedMarket[] = [];

  for (const series of KALSHI_SP_SERIES) {
    const data = await fetchSafe(
      `${KALSHI_BASE}/markets?status=open&series_ticker=${encodeURIComponent(series)}&limit=20`
    );

    const markets: any[] = data?.markets ?? [];

    for (const m of markets) {
      const ticker: string = (m.ticker ?? "").toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);

      const title: string = m.title ?? m.subtitle ?? ticker;
      const lower = title.toLowerCase();

      const category =
        lower.includes("week") ? "sp500_weekly" :
        lower.includes("range") ? "sp500_range" :
        lower.includes("close") || lower.includes("above") || lower.includes("below") || lower.includes("level") ? "sp500_level" :
        "sp500_range";

      results.push({
        id: `kalshi:${ticker}`,
        source: "kalshi",
        title,
        subtitle: m.subtitle ?? "",
        ticker,
        seriesTicker: m.series_ticker ?? series,
        category,
        closeTime: m.close_time ?? m.expiration_time ?? null,
        url: `https://kalshi.com/markets/${series.toLowerCase()}/${ticker.toLowerCase()}`,
      });
    }
  }

  return results;
}

async function fetchPolymarketMarkets(): Promise<NormalizedMarket[]> {
  const queries = [
    `${POLYMARKET_GAMMA}/markets?active=true&closed=false&search=S%26P+500&limit=20`,
    `${POLYMARKET_GAMMA}/markets?active=true&closed=false&search=SPX&limit=20`,
    `${POLYMARKET_GAMMA}/markets?active=true&closed=false&search=S%26P&limit=10`,
  ];

  const seen = new Set<string>();
  const results: NormalizedMarket[] = [];

  for (const url of queries) {
    const data = await fetchSafe(url);
    const markets: any[] = Array.isArray(data) ? data : (data?.markets ?? data?.data ?? []);

    for (const m of markets) {
      const conditionId: string = m.conditionId ?? m.id ?? "";
      if (!conditionId || seen.has(conditionId)) continue;
      seen.add(conditionId);

      const title: string = m.question ?? m.title ?? conditionId;
      const lower = title.toLowerCase();

      // Only include if clearly S&P related
      if (!lower.includes("s&p") && !lower.includes("spx") && !lower.includes("sp500") && !lower.includes("s&amp;p")) continue;

      const category =
        lower.includes("week") ? "sp500_weekly" :
        lower.includes("range") ? "sp500_range" :
        "sp500_level";

      results.push({
        id: `polymarket:${conditionId}`,
        source: "polymarket",
        title,
        subtitle: m.description ?? "",
        ticker: conditionId,
        category,
        closeTime: m.endDate ?? m.end_date_iso ?? null,
        url: m.url ?? `https://polymarket.com/event/${conditionId}`,
      });
    }
  }

  return results;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category");

    const [kalshiMarkets, polyMarkets] = await Promise.allSettled([
      fetchKalshiMarkets(),
      fetchPolymarketMarkets(),
    ]);

    let markets: NormalizedMarket[] = [
      ...(kalshiMarkets.status === "fulfilled" ? kalshiMarkets.value : []),
      ...(polyMarkets.status === "fulfilled" ? polyMarkets.value : []),
    ];

    if (categoryFilter) {
      markets = markets.filter((m) => m.category === categoryFilter);
    }

    // Sort by closeTime ascending (nearest expiry first)
    markets.sort((a, b) => {
      if (!a.closeTime) return 1;
      if (!b.closeTime) return -1;
      return new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime();
    });

    return NextResponse.json({
      ok: true,
      count: markets.length,
      markets,
      sources: {
        kalshi: kalshiMarkets.status === "fulfilled" ? kalshiMarkets.value.length : 0,
        polymarket: polyMarkets.status === "fulfilled" ? polyMarkets.value.length : 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}