// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GainerLoserRow = {
  symbol: string;
  name?: string;
  price?: number;
  changesPercentage?: number; // some endpoints use this
  changePercentage?: number; // others use this
  change?: number;
};

type QuoteRow = {
  symbol: string;
  name?: string;
  price?: number;
  changePercentage?: number;
  changesPercentage?: number;
  dayLow?: number;
  dayHigh?: number;
  volume?: number;
};

function num(x: any): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickChangePct(r: any): number | null {
  // FMP sometimes returns changePercentage, sometimes changesPercentage
  const a = num(r?.changePercentage);
  const b = num(r?.changesPercentage);
  // Sometimes these are already percent units (e.g. 0.20441) or (e.g. 0.20441?) on stable quote it looks like 0.20441.
  // We'll assume "0.20441" means 0.20441%? Actually your sample shows 0.20441 with change 0.54 on price ~264 => 0.204% (percent units).
  // We'll treat it as percent units and convert to fraction by /100.
  const pct = a ?? b;
  if (pct == null) return null;
  return pct / 100;
}

function dayVolTag(rangePct: number | null): "Normal" | "High" | "Extreme" {
  if (rangePct == null) return "Normal";
  if (rangePct >= 0.08) return "Extreme";
  if (rangePct >= 0.04) return "High";
  return "Normal";
}

function structuralRiskTag(
  rangePct: number | null,
  changePct: number | null
): "Green" | "Amber" | "Red" {
  // Simple v1 heuristic: big intraday range + big move = higher structural stress
  const r = rangePct ?? 0;
  const c = Math.abs(changePct ?? 0);

  if (r >= 0.08 || c >= 0.06) return "Red";
  if (r >= 0.045 || c >= 0.035) return "Amber";
  return "Green";
}

async function fmpGet<T>(path: string, apiKey: string): Promise<T> {
  const url = `https://financialmodelingprep.com${path}${path.includes("?") ? "&" : "?"}apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`FMP fetch failed (${res.status}): ${txt.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY env var (Financial Modeling Prep)." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "25"), 1), 50);

    // 1) Pull S&P 500 constituents
    const sp = await fmpGet<Array<{ symbol: string }>>("/stable/sp500-constituent", apiKey);
    const spSet = new Set((sp ?? []).map((x) => x.symbol).filter(Boolean));

    // 2) Pull biggest gainers + losers (stable)
    const [gainers, losers] = await Promise.all([
      fmpGet<GainerLoserRow[]>("/stable/biggest-gainers", apiKey),
      fmpGet<GainerLoserRow[]>("/stable/biggest-losers", apiKey),
    ]);

    const merged = [...(gainers ?? []), ...(losers ?? [])]
      .filter((r) => r?.symbol && spSet.has(r.symbol))
      .slice(0, Math.max(limit * 2, 25)); // overfetch a bit for better ranking after enrichment

    // 3) Enrich with quote (dayHigh/dayLow) so we can compute rangePct
    //    FMP stable quote appears to accept comma-separated symbols in practice on many endpoints,
    //    but to be safe we do batched calls in chunks.
    const symbols = Array.from(new Set(merged.map((r) => r.symbol)));
    const chunks: string[][] = [];
    const CHUNK = 50;
    for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));

    const quoteRows: QuoteRow[] = [];
    for (const group of chunks) {
      const sym = group.join(",");
      const q = await fmpGet<QuoteRow[]>(`/stable/quote?symbol=${encodeURIComponent(sym)}`, apiKey);
      if (Array.isArray(q)) quoteRows.push(...q);
    }

    const qMap = new Map<string, QuoteRow>();
    for (const q of quoteRows) if (q?.symbol) qMap.set(q.symbol, q);

    // 4) Build rows and rank by intraday range first (then absolute move)
    const rows = merged
      .map((r) => {
        const q = qMap.get(r.symbol);

        const price = num(q?.price ?? r.price);
        const changePct = pickChangePct(q ?? r);

        const dayLow = num(q?.dayLow);
        const dayHigh = num(q?.dayHigh);
        const rangePct =
          price && dayLow != null && dayHigh != null && price > 0
            ? (dayHigh - dayLow) / price
            : null;

        const row = {
          symbol: r.symbol,
          price,
          changePct,
          rangePct,
          dayVolTag: dayVolTag(rangePct),
          structuralRiskTag: structuralRiskTag(rangePct, changePct),
        };

        return row;
      })
      .sort((a, b) => {
        const ar = a.rangePct ?? 0;
        const br = b.rangePct ?? 0;
        if (br !== ar) return br - ar;

        const ac = Math.abs(a.changePct ?? 0);
        const bc = Math.abs(b.changePct ?? 0);
        return bc - ac;
      })
      .slice(0, limit);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "FMP movers fetch failed" },
      { status: 500 }
    );
  }
}