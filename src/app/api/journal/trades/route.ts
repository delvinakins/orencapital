// app/api/journal/trades/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type Market = "STOCKS" | "OPTIONS" | "FUTURES" | "SPORTS";
type Direction = "LONG" | "SHORT";
type Status = "OPEN" | "CLOSED";

type TradeRow = {
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

  // decimal: 0.01 = 1%
  risk_pct: number | null;

  strategy_tag: string | null;
  notes: string | null;

  // Optional outcomes (if your table doesn’t have these yet, PATCH will still work without them)
  exit: number | null;
  r_multiple: number | null;
  closed_at: string | null;
};

type TradeCreateInput = {
  symbol: string;
  direction: Direction;
  market?: Market;
  status?: Status;

  entry?: number | null;
  stop?: number | null;
  position_size?: number | null;
  risk_pct?: number | null;

  strategy_tag?: string | null;
  notes?: string | null;
};

type TradePatchInput = {
  id: string;

  // You can close a trade by setting status: "CLOSED"
  status?: Status;

  // Editable fields
  symbol?: string;
  direction?: Direction;
  market?: Market;

  entry?: number | null;
  stop?: number | null;
  position_size?: number | null;
  risk_pct?: number | null;

  strategy_tag?: string | null;
  notes?: string | null;

  // Outcomes (optional)
  exit?: number | null;
  r_multiple?: number | null;
};

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
      set() {},
      remove() {},
    },
  });
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function toUpperTrim(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function toNullableNumber(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function validateSymbol(symbol: string) {
  if (!symbol) return "Symbol is required.";
  if (symbol.length > 20) return "Symbol is too long.";
  return null;
}

function validateEnum<T extends string>(value: string, allowed: readonly T[], msg: string) {
  if (!allowed.includes(value as T)) return msg;
  return null;
}

function computeRMultiple(args: {
  direction: Direction;
  entry: number;
  stop: number;
  exit: number;
}) {
  const { direction, entry, stop, exit } = args;

  const riskPerUnit =
    direction === "LONG" ? entry - stop : stop - entry;

  if (riskPerUnit <= 0) return null;

  const pnlPerUnit =
    direction === "LONG" ? exit - entry : entry - exit;

  return pnlPerUnit / riskPerUnit;
}

export async function GET() {
  let supabase;
  try {
    supabase = await createSupabase();
  } catch (e: any) {
    return json(500, { ok: false, error: "Supabase env misconfigured", detail: e?.message ?? String(e) });
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json(401, { ok: false, error: "Unauthorized" });

  const { data, error } = await supabase
    .from("journal_trades")
    .select(
      "id,created_at,updated_at,status,market,symbol,direction,entry,stop,position_size,risk_pct,strategy_tag,notes,exit,r_multiple,closed_at"
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return json(500, { ok: false, error: "Failed to load trades", detail: error.message });

  return json(200, { ok: true, trades: (data || []) as TradeRow[] });
}

export async function POST(req: Request) {
  let supabase;
  try {
    supabase = await createSupabase();
  } catch (e: any) {
    return json(500, { ok: false, error: "Supabase env misconfigured", detail: e?.message ?? String(e) });
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json(401, { ok: false, error: "Unauthorized" });

  let body: TradeCreateInput;
  try {
    body = (await req.json()) as TradeCreateInput;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const symbol = toUpperTrim(body.symbol);
  const direction = toUpperTrim(body.direction);
  const market = toUpperTrim(body.market || "STOCKS");
  const status = toUpperTrim(body.status || "OPEN");

  const entry = toNullableNumber(body.entry);
  const stop = toNullableNumber(body.stop);
  const position_size = toNullableNumber(body.position_size);
  const risk_pct = toNullableNumber(body.risk_pct);

  const strategy_tag = body.strategy_tag ?? null;
  const notes = body.notes ?? null;

  const fields: Record<string, string> = {};

  const symErr = validateSymbol(symbol);
  if (symErr) fields.symbol = symErr;

  const dirErr = validateEnum(direction, ["LONG", "SHORT"] as const, "Direction must be LONG or SHORT.");
  if (dirErr) fields.direction = dirErr;

  const mktErr = validateEnum(
    market,
    ["STOCKS", "OPTIONS", "FUTURES", "SPORTS"] as const,
    "Market must be STOCKS, OPTIONS, FUTURES, or SPORTS."
  );
  if (mktErr) fields.market = mktErr;

  const statusErr = validateEnum(status, ["OPEN", "CLOSED"] as const, "Status must be OPEN or CLOSED.");
  if (statusErr) fields.status = statusErr;

  if (risk_pct !== null && (risk_pct < 0 || risk_pct > 1)) {
    fields.risk_pct = "Risk % must be a decimal between 0 and 1 (e.g., 0.01 = 1%).";
  }
  if (entry !== null && entry < 0) fields.entry = "Entry must be ≥ 0.";
  if (stop !== null && stop < 0) fields.stop = "Stop must be ≥ 0.";
  if (position_size !== null && position_size < 0) fields.position_size = "Position size must be ≥ 0.";

  if (entry !== null && stop !== null && entry === stop) {
    fields.stop = "Stop cannot equal entry.";
  }

  if (Object.keys(fields).length) {
    return json(400, { ok: false, error: "Validation failed", fields });
  }

  const insertRow = {
    user_id: auth.user.id,
    symbol,
    direction,
    market,
    status,
    entry,
    stop,
    position_size,
    risk_pct,
    strategy_tag,
    notes,
  };

  const { data, error } = await supabase
    .from("journal_trades")
    .insert(insertRow)
    .select(
      "id,created_at,updated_at,status,market,symbol,direction,entry,stop,position_size,risk_pct,strategy_tag,notes,exit,r_multiple,closed_at"
    )
    .single();

  if (error) return json(500, { ok: false, error: "Insert failed", detail: error.message });

  return json(200, { ok: true, trade: data as TradeRow });
}

export async function PATCH(req: Request) {
  let supabase;
  try {
    supabase = await createSupabase();
  } catch (e: any) {
    return json(500, { ok: false, error: "Supabase env misconfigured", detail: e?.message ?? String(e) });
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json(401, { ok: false, error: "Unauthorized" });

  let body: TradePatchInput;
  try {
    body = (await req.json()) as TradePatchInput;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const id = String(body.id || "").trim();
  if (!id) return json(400, { ok: false, error: "Trade id is required" });

  // Load existing row (RLS ensures only own row is visible)
  const { data: existing, error: loadErr } = await supabase
    .from("journal_trades")
    .select(
      "id,user_id,status,market,symbol,direction,entry,stop,position_size,risk_pct,strategy_tag,notes,exit,r_multiple,closed_at"
    )
    .eq("id", id)
    .single();

  if (loadErr || !existing) {
    return json(404, { ok: false, error: "Trade not found" });
  }

  // Build patch
  const patch: Record<string, any> = {};

  if (body.symbol !== undefined) patch.symbol = toUpperTrim(body.symbol);
  if (body.direction !== undefined) patch.direction = toUpperTrim(body.direction);
  if (body.market !== undefined) patch.market = toUpperTrim(body.market);
  if (body.status !== undefined) patch.status = toUpperTrim(body.status);

  if (body.entry !== undefined) patch.entry = toNullableNumber(body.entry);
  if (body.stop !== undefined) patch.stop = toNullableNumber(body.stop);
  if (body.position_size !== undefined) patch.position_size = toNullableNumber(body.position_size);
  if (body.risk_pct !== undefined) patch.risk_pct = toNullableNumber(body.risk_pct);

  if (body.strategy_tag !== undefined) patch.strategy_tag = body.strategy_tag ?? null;
  if (body.notes !== undefined) patch.notes = body.notes ?? null;

  // Outcomes
  if (body.exit !== undefined) patch.exit = toNullableNumber(body.exit);
  if (body.r_multiple !== undefined) patch.r_multiple = toNullableNumber(body.r_multiple);

  // Validation (only for fields being changed)
  const fields: Record<string, string> = {};

  if (patch.symbol !== undefined) {
    const symErr = validateSymbol(patch.symbol);
    if (symErr) fields.symbol = symErr;
  }

  if (patch.direction !== undefined) {
    const dirErr = validateEnum(patch.direction, ["LONG", "SHORT"] as const, "Direction must be LONG or SHORT.");
    if (dirErr) fields.direction = dirErr;
  }

  if (patch.market !== undefined) {
    const mktErr = validateEnum(
      patch.market,
      ["STOCKS", "OPTIONS", "FUTURES", "SPORTS"] as const,
      "Market must be STOCKS, OPTIONS, FUTURES, or SPORTS."
    );
    if (mktErr) fields.market = mktErr;
  }

  if (patch.status !== undefined) {
    const statusErr = validateEnum(patch.status, ["OPEN", "CLOSED"] as const, "Status must be OPEN or CLOSED.");
    if (statusErr) fields.status = statusErr;
  }

  if (patch.risk_pct !== undefined && patch.risk_pct !== null) {
    if (patch.risk_pct < 0 || patch.risk_pct > 1) {
      fields.risk_pct = "Risk % must be a decimal between 0 and 1 (e.g., 0.01 = 1%).";
    }
  }

  for (const k of ["entry", "stop", "position_size", "exit", "r_multiple"] as const) {
    if (patch[k] !== undefined && patch[k] !== null && patch[k] < 0) {
      fields[k] = `${k} must be ≥ 0.`;
    }
  }

  // If closing, set closed_at and (optionally) compute r_multiple if we have entry/stop/exit
  const nextStatus: Status = (patch.status ?? existing.status ?? "OPEN").toUpperCase() as Status;
  const nextDirection: Direction = (patch.direction ?? existing.direction ?? "LONG").toUpperCase() as Direction;

  const nextEntry = patch.entry !== undefined ? patch.entry : existing.entry;
  const nextStop = patch.stop !== undefined ? patch.stop : existing.stop;
  const nextExit = patch.exit !== undefined ? patch.exit : existing.exit;

  if (nextEntry !== null && nextStop !== null && nextEntry === nextStop) {
    fields.stop = "Stop cannot equal entry.";
  }

  const isClosing = nextStatus === "CLOSED" && (existing.status || "OPEN").toUpperCase() !== "CLOSED";
  if (isClosing) {
    patch.closed_at = new Date().toISOString();
  }

  // Compute r_multiple if closing and r_multiple isn’t explicitly set
  const willHaveOutcomeInputs =
    nextEntry !== null && nextStop !== null && nextExit !== null;

  if ((isClosing || nextStatus === "CLOSED") && patch.r_multiple === undefined && willHaveOutcomeInputs) {
    const r = computeRMultiple({
      direction: nextDirection,
      entry: nextEntry as number,
      stop: nextStop as number,
      exit: nextExit as number,
    });
    if (r !== null && Number.isFinite(r)) {
      patch.r_multiple = r;
    }
  }

  if (Object.keys(fields).length) {
    return json(400, { ok: false, error: "Validation failed", fields });
  }

  if (Object.keys(patch).length === 0) {
    return json(400, { ok: false, error: "No fields to update" });
  }

  const { data: updated, error: updErr } = await supabase
    .from("journal_trades")
    .update(patch)
    .eq("id", id)
    .select(
      "id,created_at,updated_at,status,market,symbol,direction,entry,stop,position_size,risk_pct,strategy_tag,notes,exit,r_multiple,closed_at"
    )
    .single();

  if (updErr || !updated) {
    return json(500, { ok: false, error: "Update failed", detail: updErr?.message ?? "Unknown error" });
  }

  return json(200, { ok: true, trade: updated as TradeRow });
}