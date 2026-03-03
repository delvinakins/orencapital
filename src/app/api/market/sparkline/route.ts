import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseUrl() {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("Missing POLYGON_API_KEY");
  return { key };
}

export async function GET(req: Request) {
  try {
    const { key } = baseUrl();
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    // last ~1 trading day window (good enough for mini charts)
    const to = new Date();
    const from = new Date(to.getTime() - 1000 * 60 * 60 * 24);

    const toISO = to.toISOString().slice(0, 10);
    const fromISO = from.toISOString().slice(0, 10);

    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
      `/range/5/minute/${fromISO}/${toISO}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json?.results?.length) {
      return NextResponse.json({ ok: false, error: "No data" }, { status: 200 });
    }

    // Map to points; use close
    const points = (json.results as any[])
      .map((r) => ({ time: r.t as number, value: r.c as number }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));

    return NextResponse.json({ ok: true, points }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Sparkline failed" },
      { status: 500 }
    );
  }
}