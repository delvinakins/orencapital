import { NextResponse } from "next/server";

export const runtime = "nodejs";

function kalshiBase() {
  return "https://api.elections.kalshi.com/trade-api/v2";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const series = (url.searchParams.get("series") ?? "").trim();
    const ticker = (url.searchParams.get("ticker") ?? "").trim();
    const period = (url.searchParams.get("period") ?? "60").trim();

    if (!series || !ticker) {
      return NextResponse.json({ ok: false, error: "Missing series or ticker" }, { status: 400 });
    }

    const cUrl =
      `${kalshiBase()}/series/${encodeURIComponent(series)}` +
      `/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${encodeURIComponent(period)}`;

    const res = await fetch(cUrl, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Kalshi candles ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}