// FILE: src/app/api/journal/list/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUserPro } from "@/lib/pro/isPro";

type TradeSide = "long" | "short" | null;

type JournalTradeRow = {
  id: string;
  user_id: string;
  symbol: string | null;
  instrument: string | null;
  side: TradeSide;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  result_r: number | null;
  strategy: string | null;
  notes: string | null;
  created_at: string | null;
  closed_at: string | null;
};

function n(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return Number.isFinite(v as number) ? (v as number) : null;
}

function cleanStrategy(s: any): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > 80 ? t.slice(0, 80) : t;
}

function computeResultR(
  row: Pick<JournalTradeRow, "result_r" | "entry_price" | "stop_price" | "exit_price" | "side">
): number | null {
  const rr = n(row.result_r);
  if (rr !== null) return rr;

  const entry = n(row.entry_price);
  const stop = n(row.stop_price);
  const exit = n(row.exit_price);
  const side = row.side;

  if (entry === null || stop === null || exit === null) return null;
  if (side !== "long" && side !== "short") return null;

  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const pnl = side === "long" ? exit - entry : entry - exit;
  const r = pnl / risk;
  return Number.isFinite(r) ? r : null;
}

type StrategyStat = {
  strategy: string;
  trades: number; // total trades with this strategy (all)
  tracked: number; // trades included in R stats (has result_r or computable)
  winRate: number | null; // tracked only
  avgR: number | null; // tracked only
  totalR: number | null; // tracked only
  expectancy: number | null; // tracked only (same as avgR)
  largestLoss: number | null; // tracked only (min R)
};

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // server-truth Pro check
  let isPro = false;
  try {
    const pro = await isUserPro(user.id);
    isPro = !!pro?.isPro;
  } catch {
    isPro = false;
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") || 200);
  const limit = Math.min(Math.max(rawLimit, 1), 1000);

  const { data, error } = await supabase
    .from("journal_trades")
    .select(
      [
        "id",
        "user_id",
        "symbol",
        "instrument",
        "side",
        "entry_price",
        "stop_price",
        "exit_price",
        "result_r",
        "strategy",
        "notes",
        "created_at",
        "closed_at",
      ].join(",")
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit)
    // ✅ Fix TS union issue by asserting the row type at the query level
    .returns<JournalTradeRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to list trades" }, { status: 500 });
  }

  const trades = data ?? [];

  // Strategy stats (Pro only)
  let strategyStats: StrategyStat[] | null = null;

  if (isPro) {
    const map = new Map<
      string,
      {
        trades: number;
        tracked: number;
        sumR: number;
        wins: number;
        minR: number | null;
      }
    >();

    for (const t of trades) {
      const strategy = cleanStrategy(t.strategy);
      if (!strategy) continue;

      const cur = map.get(strategy) ?? { trades: 0, tracked: 0, sumR: 0, wins: 0, minR: null };
      const next = { ...cur };
      next.trades += 1;

      const r = computeResultR(t);
      if (r !== null) {
        next.tracked += 1;
        next.sumR += r;
        if (r > 0) next.wins += 1;
        next.minR = next.minR === null ? r : Math.min(next.minR, r);
      }

      map.set(strategy, next);
    }

    strategyStats = Array.from(map.entries()).map(([strategy, v]) => {
      const avg = v.tracked > 0 ? v.sumR / v.tracked : null;
      const winRate = v.tracked > 0 ? v.wins / v.tracked : null;
      const totalR = v.tracked > 0 ? v.sumR : null;

      return {
        strategy,
        trades: v.trades,
        tracked: v.tracked,
        winRate,
        avgR: avg,
        totalR,
        expectancy: avg,
        largestLoss: v.minR,
      };
    });

    // Sort: highest Total R first, then by trades
    strategyStats.sort((a, b) => {
      const at = a.totalR ?? -Infinity;
      const bt = b.totalR ?? -Infinity;
      if (bt !== at) return bt - at;
      return (b.trades ?? 0) - (a.trades ?? 0);
    });
  }

  return NextResponse.json({
    items: trades,
    pro: { isPro },
    strategyStats, // null for free
  });
}