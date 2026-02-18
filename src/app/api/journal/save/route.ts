import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TradeSide = "long" | "short";
type InstrumentType = "stock" | "option" | "future" | "crypto" | "fx" | "other";

type SaveTradeBody = {
  id?: string;

  symbol: string;
  side: TradeSide;
  instrument?: InstrumentType;

  entry_price?: number | null;
  exit_price?: number | null;
  stop_price?: number | null;

  risk_r?: number | null;
  result_r?: number | null;
  pnl_dollars?: number | null;

  strategy?: string | null;
  notes?: string | null;

  closed_at?: string | null;
};

function computeResultR(body: SaveTradeBody): number | null {
  const { entry_price, exit_price, stop_price, side } = body;
  if (entry_price == null || exit_price == null || stop_price == null) return null;

  const risk = side === "long" ? entry_price - stop_price : stop_price - entry_price;
  if (!risk || risk === 0) return null;

  const reward = side === "long" ? exit_price - entry_price : entry_price - exit_price;
  return reward / risk;
}

function normalizeInstrument(x: unknown): InstrumentType {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  const allowed: InstrumentType[] = ["stock", "option", "future", "crypto", "fx", "other"];
  return (allowed as string[]).includes(v) ? (v as InstrumentType) : "stock";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveTradeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.symbol || !body?.side) {
    return NextResponse.json({ error: "symbol and side are required" }, { status: 400 });
  }

  const instrument = normalizeInstrument(body.instrument);

  // Prefer manual result_r if provided (future advanced override)
  const computedR = computeResultR(body);
  const resultR = typeof body.result_r === "number" ? body.result_r : computedR;

  // Consider trade "closed" if exit_price exists OR resultR exists
  const hasExit = typeof body.exit_price === "number";
  const isClosed = typeof resultR === "number" || hasExit;

  const payload = {
    ...(body.id ? { id: body.id } : {}),
    user_id: user.id,

    symbol: body.symbol.trim().toUpperCase(),
    side: body.side,
    instrument,

    entry_price: body.entry_price ?? null,
    exit_price: body.exit_price ?? null,
    stop_price: body.stop_price ?? null,

    risk_r: body.risk_r ?? null,
    result_r: resultR ?? null,
    pnl_dollars: body.pnl_dollars ?? null,

    strategy: body.strategy ?? null,
    notes: body.notes ?? null,

    closed_at: isClosed ? body.closed_at ?? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("journal_trades")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ trade: data });
}
