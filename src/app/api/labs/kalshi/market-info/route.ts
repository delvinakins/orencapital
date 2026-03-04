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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("ticker") ?? "").trim();
    const ticker = raw.toUpperCase();

    if (!ticker) {
      return NextResponse.json({ ok: false, error: "Missing ticker" }, { status: 400 });
    }

    const mUrl = `${kalshiBase()}/markets/${encodeURIComponent(ticker)}`;
    const res = await fetchWithTimeout(mUrl);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, ticker, error: `Kalshi market ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    // Pass-through with ok:true; we want to SEE series_ticker + status + anything useful
    return NextResponse.json({ ok: true, ticker, ...data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.name === "AbortError" ? "Kalshi timeout" : (err?.message ?? "Unknown error") },
      { status: 500 }
    );
  }
}