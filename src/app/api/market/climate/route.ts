// src/app/api/market/climate/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Climate = {
  score: number; // 0..100
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  details: string;
  vix?: number;
  spx?: number;
  spx200?: number;
  cap_bps: number | null; // ARC cap recommendation
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function mean(xs: number[]) {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

async function fetchFredSeries(series_id: string, limit = 260) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("Missing FRED_API_KEY");

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("series_id", series_id);
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`FRED ${series_id} failed: ${res.status}`);

  const json = await res.json();
  const obs = (json?.observations ?? []) as Array<{ value: string }>;

  // newest -> oldest
  const values = obs
    .map((o) => Number(o.value))
    .filter((n) => Number.isFinite(n));

  return values;
}

/**
 * Scoring model (simple + explainable):
 * - VIX penalty: 0 at <= 14, 100 at >= 40 (linear)
 * - Trend penalty: 0 if SPX >= 200d MA, up to 100 if 15% below
 * - Combined: 65% VIX + 35% trend
 */
function computeClimate(vix: number, spx: number, spx200: number): Climate {
  const vixScore = clamp(((vix - 14) / (40 - 14)) * 100, 0, 100);

  const rel = spx200 > 0 ? (spx - spx200) / spx200 : 0; // negative if below MA
  const trendScore = clamp(((-rel) / 0.15) * 100, 0, 100); // 15% below MA => 100

  const score = Math.round(0.65 * vixScore + 0.35 * trendScore);

  let label: Climate["label"] = "Stable";
  let tone: Climate["tone"] = "accent";
  let cap_bps: number | null = null;

  if (score >= 70) {
    label = "High Risk";
    tone = "warn";
    cap_bps = 25; // 0.25%
  } else if (score >= 45) {
    label = "Elevated";
    tone = "neutral";
    cap_bps = 50; // 0.50%
  }

  const details =
    label === "Stable"
      ? `Volatility normal · Trend healthy`
      : label === "Elevated"
        ? `Volatility elevated · Trend mixed · ARC cap suggested`
        : `Volatility high · Trend fragile · ARC cap engaged`;

  return { score, label, tone, details, vix, spx, spx200, cap_bps };
}

export async function GET() {
  try {
    // VIX: FRED series VIXCLS
    // SP500: FRED series SP500
    const vixSeries = await fetchFredSeries("VIXCLS", 30);
    const spxSeries = await fetchFredSeries("SP500", 260);

    const vix = vixSeries[0];
    const spx = spxSeries[0];
    const spx200 = mean(spxSeries.slice(0, 200));

    if (![vix, spx, spx200].every((n) => Number.isFinite(n))) {
      return NextResponse.json({ ok: false, error: "Insufficient data" }, { status: 500 });
    }

    const climate = computeClimate(vix, spx, spx200);

    return NextResponse.json({ ok: true, climate });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}