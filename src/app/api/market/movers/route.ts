import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Row = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  rangePct: number | null;
  dayVolTag: "Normal" | "High" | "Extreme";
  structuralRiskTag: "Green" | "Amber" | "Red";
};

function getKey() {
  return process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";
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

  const text = await res.text();
  const lines = text.split("\n").slice(1);

  const set = new Set<string>();
  for (const line of lines) {
    const sym = line.split(",")[0]?.trim();
    if (sym) set.add(sym.toUpperCase());
  }

  spCache = { ts: now, set };
  return set;
}

async function fetchSnapshots(key: string) {
  const url =
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false&apiKey=${key}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Massive snapshot fetch failed (${res.status}): ${text}`);
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
    const snapshot = await fetchSnapshots(key);

    const rows: Row[] = (snapshot.tickers ?? [])
      .filter((t: any) => sp500.has(t.ticker))
      .map((t: any) => {
        const day = t.day ?? {};

        const open = day.o;
        const close = day.c;
        const high = day.h;
        const low = day.l;

        const changePct =
          open && close ? (close - open) / open : null;

        const rangePct =
          open && high && low ? (high - low) / open : null;

        return {
          symbol: t.ticker,
          price: close ?? null,
          changePct,
          rangePct,
          dayVolTag: pctTag(rangePct),
          structuralRiskTag: structuralTag(changePct, rangePct),
        };
      });

    rows.sort(
      (a, b) =>
        Math.abs(b.changePct ?? 0) -
        Math.abs(a.changePct ?? 0)
    );

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