// FILE: src/app/api/journal/save/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TradeSide = "long" | "short";
type InstrumentType = "stock" | "option" | "future" | "crypto" | "fx" | "other";

type SaveTradeBody = {
  // Optional: allow update semantics if you ever use it, but we DO NOT upsert.
  id?: string;

  symbol: string;
  side: TradeSide;
  instrument?: InstrumentType | string | null;

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

const SAFE_USER_ERROR = "We couldn’t save that trade right now. Please try again in a moment.";

function n(x: unknown): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  return Number.isFinite(v as number) ? (v as number) : null;
}

function normalizeInstrument(x: unknown): InstrumentType {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  const allowed: InstrumentType[] = ["stock", "option", "future", "crypto", "fx", "other"];
  return (allowed as string[]).includes(v) ? (v as InstrumentType) : "stock";
}

function cleanStrategy(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > 80 ? t.slice(0, 80) : t;
}

function cleanNotes(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  // keep it sane; you can raise this later
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

function computeResultR(body: Pick<SaveTradeBody, "entry_price" | "exit_price" | "stop_price" | "side">): number | null {
  const entry = n(body.entry_price);
  const stop = n(body.stop_price);
  const exit = n(body.exit_price);
  const side = body.side;

  if (entry === null || stop === null || exit === null) return null;
  if (side !== "long" && side !== "short") return null;

  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const pnl = side === "long" ? exit - entry : entry - exit;
  const r = pnl / risk;
  return Number.isFinite(r) ? r : null;
}

export async function POST(req: Request) {
  try {
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
      body = (await req.json()) as SaveTradeBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const symbolRaw = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const side = body?.side;

    if (!symbolRaw || (side !== "long" && side !== "short")) {
      return NextResponse.json({ error: "symbol and side are required" }, { status: 400 });
    }

    const symbol = symbolRaw.toUpperCase().slice(0, 20);
    const instrument = normalizeInstrument(body.instrument);

    const entry_price = n(body.entry_price);
    const stop_price = n(body.stop_price);
    const exit_price = n(body.exit_price);

    // Prefer manual result_r if provided; else compute from prices
    const manualR = n(body.result_r);
    const computedR = computeResultR({ entry_price, stop_price, exit_price, side });
    const result_r = manualR !== null ? manualR : computedR;

    // Consider trade "closed" if exit_price exists OR result_r exists
    const hasExit = exit_price !== null;
    const isClosed = result_r !== null || hasExit;

    const payload = {
      user_id: user.id,
      symbol,
      side,
      instrument,

      entry_price,
      stop_price,
      exit_price,

      risk_r: n(body.risk_r),
      result_r,
      pnl_dollars: n(body.pnl_dollars),

      strategy: cleanStrategy(body.strategy),
      notes: cleanNotes(body.notes),

      closed_at: isClosed ? (typeof body.closed_at === "string" ? body.closed_at : new Date().toISOString()) : null,
    };

    // IMPORTANT:
    // - No blind upsert.
    // - If id is provided, only update rows belonging to this user.
    if (typeof body.id === "string" && body.id.trim()) {
      const id = body.id.trim();

      const { data, error } = await supabase
        .from("journal_trades")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .single();

      if (error) {
        console.error("[journal/save:update] supabase error:", { code: error.code, message: error.message });
        return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
      }

      return NextResponse.json({ trade: data }, { status: 200 });
    }

    // Insert new trade
    const { data, error } = await supabase
      .from("journal_trades")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("[journal/save:insert] supabase error:", { code: error.code, message: error.message });
      return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
    }

    return NextResponse.json({ trade: data }, { status: 200 });
  } catch (e) {
    console.error("[journal/save] unexpected error:", e);
    return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
  }
}