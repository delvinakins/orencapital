import { NextResponse } from "next/server";

export const runtime = "nodejs";

function kalshiBase() {
  return "https://api.elections.kalshi.com/trade-api/v2";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawSeries = (url.searchParams.get("series") ?? "").trim();
    const rawTicker = (url.searchParams.get("ticker") ?? "").trim();
    const period = (url.searchParams.get("period") ?? "60").trim();

    const series = rawSeries.toUpperCase();
    const ticker = rawTicker.toUpperCase();

    if (!series || !ticker) {
      return NextResponse.json({ ok: false, error: "Missing series or ticker" }, { status: 400 });
    }

    const cUrl =
      `${kalshiBase()}/series/${encodeURIComponent(series)}` +
      `/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${encodeURIComponent(period)}`;

    const res = await fetch(cUrl, { cache: "no-store" });

    // IMPORTANT: Always return JSON to avoid Cloudflare HTML error pages confusing the UI
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          series,
          ticker,
          error: `Kalshi candles ${res.status}: ${text.slice(0, 180)}`,
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, series, ticker, ...data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}