// app/api/portfolio/summary/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type DisciplineStatus = "WITHIN" | "ELEVATED" | "OUTSIDE";

type JournalTrade = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  status: string | null;
  market: string | null;

  symbol: string | null;
  direction: string | null;

  entry: number | null;
  stop: number | null;
  position_size: number | null;

  risk_pct: number | null; // decimal: 0.01 = 1%
  strategy_tag: string | null;
  notes: string | null;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function pct1(n: number) {
  // decimal -> percent with 1 decimal (0.0234 -> 2.3)
  return Math.round(n * 1000) / 10;
}

function safeRisk(t: JournalTrade) {
  return typeof t.risk_pct === "number" && Number.isFinite(t.risk_pct) ? t.risk_pct : 0;
}

function computeDisciplineStatus(args: {
  openRiskPctTotal: number;
  aboveOneShare: number;
  heatScore: number;
}): DisciplineStatus {
  const { openRiskPctTotal, aboveOneShare, heatScore } = args;

  if (openRiskPctTotal > 0.04 || aboveOneShare > 0.25 || heatScore > 0.7) return "OUTSIDE";

  if (
    (openRiskPctTotal > 0.02 && openRiskPctTotal <= 0.04) ||
    (aboveOneShare > 0.1 && aboveOneShare <= 0.25) ||
    (heatScore >= 0.45 && heatScore <= 0.7)
  ) {
    return "ELEVATED";
  }

  return "WITHIN";
}

async function createSupabase() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // Route handlers typically don't need to set/remove cookies for read-only auth.
      set() {},
      remove() {},
    },
  });
}

export async function GET() {
  let supabase;
  try {
    supabase = await createSupabase();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Supabase env misconfigured", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("journal_trades")
    .select(
      "id,user_id,created_at,updated_at,status,market,symbol,direction,entry,stop,position_size,risk_pct,strategy_tag,notes"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const trades: JournalTrade[] = (data || []) as JournalTrade[];

  // Neutral state: no fake zeros
  if (trades.length === 0) {
    return NextResponse.json({
      ok: true,
      hasData: false,
      status: "WITHIN" as DisciplineStatus,
      message: "No data yet.",
      metrics: {
        openRiskPctTotal: null,
        largestPositionPct: null,
        correlatedStackingPct: null,
        aboveOnePctRuleShare: null,
        drawdownPct: null,
        heatScore: null,
      },
      rollups: {
        openTrades: 0,
        closedTrades: 0,
        markets: {},
        symbolsOpen: [],
      },
    });
  }

  const normStatus = (s: string | null) => (s || "OPEN").toUpperCase();

  const openTrades = trades.filter((t) => normStatus(t.status) === "OPEN");
  const closedTrades = trades.filter((t) => normStatus(t.status) === "CLOSED");

  const openRiskPctTotal = openTrades.reduce((sum, t) => sum + safeRisk(t), 0);

  // Largest position % (MVP proxy): risk share of biggest open trade
  const openRisks = openTrades.map((t) => safeRisk(t)).filter((r) => r > 0);
  const largestPositionPct =
    openRisks.length > 0 && openRiskPctTotal > 0 ? Math.max(...openRisks) / openRiskPctTotal : 0;

  // % above 1% rule (across all trades with risk_pct present)
  const totalWithRisk = trades.filter(
    (t) => typeof t.risk_pct === "number" && Number.isFinite(t.risk_pct)
  );
  const aboveOne =
    totalWithRisk.length > 0
      ? totalWithRisk.filter((t) => (t.risk_pct as number) > 0.01).length
      : 0;
  const aboveOneShare = totalWithRisk.length > 0 ? aboveOne / totalWithRisk.length : 0;

  // Heat score (MVP): risk pressure + mild stacking pressure
  const riskPressure = clamp01(openRiskPctTotal / 0.04);
  const tradeCountPressure = clamp01(openTrades.length / 12);
  const heatScore = clamp01(0.7 * riskPressure + 0.3 * tradeCountPressure);

  const status = computeDisciplineStatus({
    openRiskPctTotal,
    aboveOneShare,
    heatScore,
  });

  // Markets rollup
  const markets: Record<string, number> = {};
  for (const t of trades) {
    const m = (t.market || "STOCKS").toUpperCase();
    markets[m] = (markets[m] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    hasData: true,
    status,
    message:
      status === "WITHIN"
        ? "Within discipline."
        : status === "ELEVATED"
        ? "Discipline elevated."
        : "Outside discipline.",
    metrics: {
      openRiskPctTotal: pct1(openRiskPctTotal),
      largestPositionPct: pct1(largestPositionPct),
      correlatedStackingPct: null, // Heat 2.0
      aboveOnePctRuleShare: pct1(aboveOneShare),
      drawdownPct: null, // Variance Simulator integration later
      heatScore: Math.round(heatScore * 1000) / 1000,
    },
    rollups: {
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      markets,
    },
  });
}