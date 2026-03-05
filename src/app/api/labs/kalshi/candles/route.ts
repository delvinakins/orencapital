// src/app/api/labs/kalshi/candles/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function kalshiBase() {
  return "https://api.elections.kalshi.com/trade-api/v2";
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// Derive series ticker from market ticker
// e.g. KXINXY-26DEC31H1600-B7300 → KXINXY
// e.g. KXINX-26MAR06H1600-T7249.9999 → KXINX
function deriveSeriesTicker(ticker: string): string {
  return ticker.split("-")[0].toUpperCase();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawTicker = (url.searchParams.get("ticker") ?? "").trim();
    const ticker = rawTicker.toUpperCase();
    const period = (url.searchParams.get("period") ?? "60").trim();
    const lookbackDays = Math.min(Number(url.searchParams.get("days") ?? 30), 90);

    if (!ticker) {
      return NextResponse.json({ ok: false, error: "Missing ticker" }, { status: 400 });
    }

    // Derive series ticker from ticker string directly — no market API lookup needed
    const series = url.searchParams.get("series")
      ? (url.searchParams.get("series") as string).toUpperCase()
      : deriveSeriesTicker(ticker);

    const end_ts = nowSec();
    const start_ts = end_ts - lookbackDays * 24 * 60 * 60;

    // 1) Try live candlesticks first
    const liveUrl =
      `${kalshiBase()}/series/${encodeURIComponent(series)}` +
      `/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${encodeURIComponent(period)}`;

    const liveRes = await fetchWithTimeout(liveUrl);

    if (liveRes.ok) {
      const data = await liveRes.json();
      if (data?.candlesticks?.length) {
        return NextResponse.json({ ok: true, mode: "live", series, ticker, ...data });
      }
    }

    // 2) Fallback to historical candles
    const histUrl =
      `${kalshiBase()}/historical/markets/${encodeURIComponent(ticker)}` +
      `/candlesticks?start_ts=${start_ts}&end_ts=${end_ts}&period_interval=${encodeURIComponent(period)}`;

    const histRes = await fetchWithTimeout(histUrl);

    if (!histRes.ok) {
      const text = await histRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          series,
          ticker,
          error: `Kalshi candles failed (live ${liveRes.status}, hist ${histRes.status}): ${text.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }

    const histData = await histRes.json();

    if (!histData?.candlesticks?.length) {
      return NextResponse.json(
        { ok: false, series, ticker, error: "No candlestick data returned from Kalshi" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, mode: "historical", series, ticker, ...histData });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.name === "AbortError" ? "Kalshi timeout" : (err?.message ?? "Unknown error") },
      { status: 500 }
    );
  }
}