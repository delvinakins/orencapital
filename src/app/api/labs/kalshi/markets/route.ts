// src/app/api/labs/kalshi/markets/route.ts
// Fetches S&P 500 prediction markets from Kalshi + Polymarket, normalized to one schema

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";

async function fetchSafe(url: string, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    return res;
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
  ticker: string;         // platform-native ticker / conditionId
  seriesTicker?: string;  // Kalshi only
  category: "sp500_level" | "sp500_weekly" | "other";
  closeTime: string | null;
  url: string;
}

// ── Kalshi: search for S&P markets ──────────────────────────────────────────
async function fetchKalshiMarkets(): Promise<NormalizedMarket[]> {
  const queries = [
    `${KALSHI_BASE}/markets?status=open&search=S%26P+500&limit=20`,
    `${KALSHI_BASE}/markets?status=open&search=SP500&limit=20`,
    `${KALSHI_BASE}/markets?status=open&search=SPX&limit=20`,
  ];

  const seen = new Set<string>();
  const results: NormalizedMarket[] = [];

  for (const url of queries) {
    const res = await fetchSafe(url);
    if (!res?.ok) continue;

    const data: any = await res.json().catch(() => null);
    const markets: any[] = data?.markets ?? [];

    for (const m of markets) {
      const ticker: string = (m.ticker ?? m.id ?? "").toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);

      const title: string = m.title ?? m.subtitle ?? ticker;
      const lower = title.toLowerCase();

      const category =
        lower.includes("weekly") || lower.includes("week")
          ? "sp500_weekly"
          : lower.includes("close") || lower.includes("level") || lower.includes("above") || lower.includes("below")
          ? "sp500_level"
          : "other";

      results.push({
        id: `kalshi:${ticker}`,
        source: "kalshi",
        title,
        subtitle: m.subtitle ?? "",
        ticker,
        seriesTicker: m.series_ticker ?? undefined,
        category,
        closeTime: m.close_time ?? m.expiration_time ?? null,
        url: `https://kalshi.com/markets/${ticker.toLowerCase()}`,
      });
    }
  }

  return results;
}

// ── Polymarket: search for S&P markets ──────────────────────────────────────
async function fetchPolymarketMarkets(): Promise<NormalizedMarket[]> {
  const queries = [
    `${POLYMARKET_GAMMA}/markets?active=true&closed=false&search=S%26P+500&limit=20`,
    `${POLYMARKET_GAMMA}/markets?active=true&closed=false&search=SPX&limit=20`,
  ];

  const seen = new Set<string>();
  const results: NormalizedMarket[] = [];

  for (const url of queries) {
    const res = await fetchSafe(url);
    if (!res?.ok) continue;

    const data: any = await res.json().catch(() => null);
    // Gamma API returns array directly or wrapped
    const markets: any[] = Array.isArray(data) ? data : (data?.markets ?? data?.data ?? []);

    for (const m of markets) {
      const conditionId: string = m.conditionId ?? m.id ?? "";
      if (!conditionId || seen.has(conditionId)) continue;
      seen.add(conditionId);

      const title: string = m.question ?? m.title ?? conditionId;
      const lower = title.toLowerCase();

      const category =
        lower.includes("weekly") || lower.includes("week")
          ? "sp500_weekly"
          : lower.includes("close") || lower.includes("level") || lower.includes("above") || lower.includes("below")
          ? "sp500_level"
          : "other";

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

// ── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category"); // optional filter

    const [kalshiMarkets, polyMarkets] = await Promise.allSettled([
      fetchKalshiMarkets(),
      fetchPolymarketMarkets(),
    ]);

    let markets: NormalizedMarket[] = [
      ...(kalshiMarkets.status === "fulfilled" ? kalshiMarkets.value : []),
      ...(polyMarkets.status === "fulfilled" ? polyMarkets.value : []),
    ];

    // Filter to only sp500_level + sp500_weekly by default
    markets = markets.filter((m) =>
      categoryFilter ? m.category === categoryFilter : m.category !== "other"
    );

    // Sort: level first, then weekly, then by closeTime ascending
    markets.sort((a, b) => {
      const catOrder = { sp500_level: 0, sp500_weekly: 1, other: 2 };
      const catDiff = catOrder[a.category] - catOrder[b.category];
      if (catDiff !== 0) return catDiff;
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