// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Quote = {
  symbol: string;
  name?: string;
  price?: number;
  changesPercentage?: number; // percent number (e.g. 2.34)
  change?: number;
  marketCap?: number;
  volume?: number;
  avgVolume?: number;
};

function n(x: unknown) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// Public CSV of S&P 500 constituents (no API key)
async function fetchSP500Symbols(): Promise<Set<string>> {
  const url = "https://datahub.io/core/s-and-p-500-companies/r/constituents.csv";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch S&P 500 list (${res.status})`);

  const csv = await res.text();
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);

  const out = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const [symbolRaw] = line.split(",");
    const symbol = (symbolRaw ?? "").trim().replaceAll('"', "");
    if (symbol) out.add(symbol);
  }
  return out;
}

/**
 * Movers source: Financial Modeling Prep (FMP)
 * Env var required: FMP_API_KEY
 */
async function fetchMoversFromFMP(kind: "gainers" | "losers"): Promise<Quote[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY env var (Financial Modeling Prep).");

  const url =
    kind === "gainers"
      ? `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${key}`
      : `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FMP movers fetch failed (${res.status})`);
  const j = (await res.json()) as any[];

  return (Array.isArray(j) ? j : []).map((row) => ({
    symbol: String(row.symbol ?? ""),
    name: row.name ? String(row.name) : undefined,
    price: n(row.price),
    changesPercentage: n(
      typeof row.changesPercentage === "string"
        ? String(row.changesPercentage).replace("%", "")
        : row.changesPercentage
    ),
    change: n(row.change),
  }));
}

/**
 * Structural filter (v0):
 * - keep only decent price names
 * - rank by absolute % move (shiny + useful)
 * Later: add realized vol, ATR proxy, whipsaw, liquidity filters.
 */
function structuralFilterAndScore(q: Quote) {
  const price = n(q.price);
  const pct = n(q.changesPercentage);

  if (price <= 5) return { ok: false, score: 0 };

  const score = Math.abs(pct);
  return { ok: true, score };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = clamp(Number(searchParams.get("limit") ?? "20"), 5, 60);

    const [spSet, gainers, losers] = await Promise.all([
      fetchSP500Symbols(),
      fetchMoversFromFMP("gainers"),
      fetchMoversFromFMP("losers"),
    ]);

    const raw = [...gainers, ...losers].filter((q) => q.symbol && spSet.has(q.symbol));

    const ranked = raw
      .map((q) => {
        const s = structuralFilterAndScore(q);
        return { ...q, _ok: s.ok, _score: s.score };
      })
      .filter((q) => q._ok)
      .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
      .slice(0, limit)
      .map(({ _ok, _score, ...rest }) => rest);

    return NextResponse.json({
      ok: true,
      asOf: new Date().toISOString(),
      universe: "S&P 500",
      count: ranked.length,
      movers: ranked,
      note:
        "Movers ranked by absolute % move (v0). Next iteration: add intraday whipsaw + realized vol + liquidity.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}