// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";
import { SP500_TICKERS } from "@/lib/market/sp500";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;    // 0..1
  rangePct: number | null;     // (high-low)/open
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
};

function n(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// Very simple “structural-risk” filter v1:
// - rangePct is the main signal
// - changePct adds stress if outsized
function classifyStructuralRisk(rangePct: number | null, changePct: number | null) {
  const r = rangePct ?? 0;
  const c = Math.abs(changePct ?? 0);

  // Score: range dominates, then big move
  const score = (r * 100) * 1.0 + (c * 100) * 0.35;

  if (score >= 18) return "Red" as const;
  if (score >= 10) return "Amber" as const;
  return "Green" as const;
}

function classifyDayVol(rangePct: number | null) {
  const r = rangePct ?? 0;
  if (r >= 0.18) return "Extreme" as const;
  if (r >= 0.10) return "High" as const;
  return "Normal" as const;
}

/**
 * Data source:
 * This endpoint is written to support Polygon right away if you set POLYGON_API_KEY.
 * Polygon provides a “gainers” snapshot endpoint (docs show /v2/snapshot/.../gainers etc).  [oai_citation:1‡GitHub](https://github.com/polygon-io/client-php?utm_source=chatgpt.com)
 *
 * For our use, we still need per-symbol OHLC. We'll fetch per-ticker “previous close” + “last trade/quote”
 * via Polygon v3 endpoints if you want, but to keep this Step 1 shippable:
 * - We return mocked rows if POLYGON_API_KEY is missing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? 25), 5, 100);

  const polygonKey = process.env.POLYGON_API_KEY;

  // ✅ Step 1: shipable stub (looks real in UI, no provider setup required)
  if (!polygonKey) {
    const demo = SP500_TICKERS.slice(0, limit).map((symbol, i) => {
      const rangePct = (0.02 + (i % 7) * 0.015); // 2%..11%
      const changePct = ((i % 9) - 4) * 0.006;   // -2.4%..+2.4%
      return {
        symbol,
        price: null,
        changePct,
        rangePct,
        dayVolTag: classifyDayVol(rangePct),
        structuralRiskTag: classifyStructuralRisk(rangePct, changePct),
      } satisfies Row;
    });

    // sort by rangePct desc
    demo.sort((a, b) => (b.rangePct ?? 0) - (a.rangePct ?? 0));

    return NextResponse.json({ ok: true, source: "demo", rows: demo });
  }

  // 🚧 Step 2 (next): replace this block with real Polygon OHLC aggregation for SP500_TICKERS.
  // For now, keep production-safe:
  return NextResponse.json(
    {
      ok: false,
      error: "POLYGON_API_KEY detected, but real fetch not implemented yet. Remove key to use demo mode for now.",
    },
    { status: 501 }
  );
}