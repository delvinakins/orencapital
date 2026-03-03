// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null; // decimal
  rangePct: number | null;  // decimal
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
};

function getKey() {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";
}

function normalizeSymbol(sym: string): string {
  return sym.toUpperCase().replace(".", "-").trim();
}

function pctTag(range: number | null): Row["dayVolTag"] {
  if (!range) return "Normal";
  if (range >= 0.12) return "Extreme";
  if (range >= 0.06) return "High";
  return "Normal";
}

function structuralTag(change: number | null, range: number | null): Row["structuralRiskTag"] {
  const c = Math.abs(change ?? 0);
  const r = range ?? 0;
  if (c >= 0.08 || r >= 0.14) return "Red";
  if (c >= 0.04 || r >= 0.08) return "Amber";
  return "Green";
}

// Cache SP500 list 24h
let spCache: { ts: number; set: Set<string> } | null = null;

async function getSp500(): Promise<Set<string>> {
  const now = Date.now();
  if (spCache && now - spCache.ts < 86400000) return spCache.set;

  const res = await fetch(
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch S&P 500 list");
  }

  const text = await res.text();
  const lines = text.split("\n").slice(1);

  const set = new Set<string>();
  for (const line of lines) {
    const raw = line.split(",")[0]?.trim();
    if (!raw) continue;
    set.add(normalizeSymbol(raw));
  }

  spCache = { ts: now, set };
  return set;
}

async function fetchMovers(direction: "gainers" | "losers", key: string) {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/${direction}?include_otc=false&apiKey=${key}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Massive fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function GET(req: Request) {
  try {
    const key = getKey();
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Missing MASSIVE_API_KEY or POLYGON_API_KEY" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 50);

    const sp500 = await getSp500();

    const [gainers, losers] = await Promise.all([
      fetchMovers("gainers", key),
      fetchMovers("losers", key),
    ]);

    const combined = [...(gainers.tickers ?? []), ...(losers.tickers ?? [])];

    const rows: Row[] = combined
      .filter((t: any) => {
        const sym = normalizeSymbol(String(t?.ticker ?? ""));
        return sp500.has(sym);
      })
      .map((t: any) => {
        const day = t?.day ?? {};
        const prev = t?.prevDay ?? {};

        const symbol = normalizeSymbol(String(t?.ticker ?? ""));

        const price = typeof day.c === "number" ? day.c : null;
        const prevClose = typeof prev.c === "number" ? prev.c : null;

        const changePct =
          typeof t.todaysChangePerc === "number"
            ? t.todaysChangePerc / 100
            : null;

        const rangePct =
          typeof day.h === "number" &&
          typeof day.l === "number" &&
          typeof prevClose === "number" &&
          prevClose > 0
            ? (day.h - day.l) / prevClose
            : null;

        return {
          symbol,
          price,
          changePct,
          rangePct,
          dayVolTag: pctTag(rangePct),
          structuralRiskTag: structuralTag(changePct, rangePct),
        };
      })
      .filter(r => r.symbol); // final safety

    rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));

    return NextResponse.json({
      ok: true,
      rows: rows.slice(0, limit),
      source: "massive",
      universe: "sp500",
    });

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}