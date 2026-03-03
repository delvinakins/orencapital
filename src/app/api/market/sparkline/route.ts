import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prevWeekday(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x;
}

async function fetchAggsDay(symbol: string, dateStr: string, apiKey: string) {
  // 5-min candles for the day (good sparkline density)
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
    symbol
  )}/range/5/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    return { ok: false as const, status: res.status, bodyText: text, url };
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false as const, status: 500, bodyText: text, url };
  }

  const results = Array.isArray(json?.results) ? json.results : [];
  const points = results
    .map((r: any) => Number(r?.c))
    .filter((n: any) => Number.isFinite(n));

  return { ok: true as const, status: 200, points, url };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing POLYGON_API_KEY" }, { status: 500 });
    }

    // Try today; if Polygon blocks “today before EOD” on your plan, auto-fallback to prior weekday.
    const today = new Date();
    const todayStr = ymd(today);

    const first = await fetchAggsDay(symbol, todayStr, apiKey);
    if (first.ok && first.points.length > 1) {
      return NextResponse.json({ ok: true, symbol, date: todayStr, points: first.points });
    }

    // fallback
    const prev = prevWeekday(today);
    const prevStr = ymd(prev);
    const second = await fetchAggsDay(symbol, prevStr, apiKey);

    if (second.ok && second.points.length > 1) {
      return NextResponse.json({
        ok: true,
        symbol,
        date: prevStr,
        points: second.points,
        note: "fallback_prev_day",
      });
    }

    // If both fail, return enough to debug quickly
    return NextResponse.json(
      {
        ok: false,
        error: "Sparkline fetch failed",
        attempts: [
          { date: todayStr, status: first.status, sample: String(first.bodyText).slice(0, 200), url: first.url },
          { date: prevStr, status: second.status, sample: String(second.bodyText).slice(0, 200), url: second.url },
        ],
      },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}