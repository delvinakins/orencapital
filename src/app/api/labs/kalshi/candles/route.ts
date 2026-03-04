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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawTicker = (url.searchParams.get("ticker") ?? "").trim();
    const ticker = rawTicker.toUpperCase();
    const period = (url.searchParams.get("period") ?? "60").trim(); // 1,60,1440
    const lookbackDays = Math.min(Number(url.searchParams.get("days") ?? 7), 30);

    if (!ticker) {
      return NextResponse.json({ ok: false, error: "Missing ticker" }, { status: 400 });
    }

    // 1) Discover series_ticker from market metadata (never guess)
    const mUrl = `${kalshiBase()}/markets/${encodeURIComponent(ticker)}`;
    const mRes = await fetchWithTimeout(mUrl);

    if (!mRes.ok) {
      const text = await mRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, ticker, error: `Kalshi market ${mRes.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const mData: any = await mRes.json();

    // Kalshi market response includes series_ticker somewhere in the payload;
    // we handle multiple shapes defensively.
    const seriesTicker =
      (mData?.market?.series_ticker ?? mData?.series_ticker ?? mData?.event?.series_ticker ?? "").toString().trim();

    if (!seriesTicker) {
      return NextResponse.json(
        { ok: false, ticker, error: "Could not determine series_ticker from market response" },
        { status: 500 }
      );
    }

    const series = seriesTicker.toUpperCase();

    // 2) Try LIVE candlesticks first
    const liveUrl =
      `${kalshiBase()}/series/${encodeURIComponent(series)}` +
      `/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${encodeURIComponent(period)}`;

    const liveRes = await fetchWithTimeout(liveUrl);

    if (liveRes.ok) {
      const data = await liveRes.json();
      return NextResponse.json({ ok: true, mode: "live", series, ticker, ...data });
    }

    // 3) Fallback to HISTORICAL candles (last N days)
    const end_ts = nowSec();
    const start_ts = end_ts - lookbackDays * 24 * 60 * 60;

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
    return NextResponse.json({ ok: true, mode: "historical", series, ticker, ...histData });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.name === "AbortError" ? "Kalshi timeout" : (err?.message ?? "Unknown error") },
      { status: 500 }
    );
  }
}