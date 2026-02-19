import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import getOpenAI from "@/lib/openai/server";
import { isUserPro } from "@/lib/pro/isPro";

type InstrumentType = "stock" | "option" | "future" | "crypto" | "fx" | "other";
type TradeSide = "long" | "short";

type ParsedTrade = {
  symbol: string | null;
  instrument: InstrumentType | null;
  side: TradeSide | null;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  strategy: string | null;
  notes: string | null;
};

function normalizeSymbol(sym: unknown): string | null {
  if (typeof sym !== "string") return null;
  const s = sym.trim().toUpperCase();
  if (!s) return null;
  if (s.length > 20) return null;
  return s;
}

function normalizeInstrument(x: unknown): InstrumentType | null {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  const allowed: InstrumentType[] = ["stock", "option", "future", "crypto", "fx", "other"];
  return (allowed as string[]).includes(v) ? (v as InstrumentType) : null;
}

function normalizeSide(x: unknown): TradeSide | null {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return v === "long" || v === "short" ? (v as TradeSide) : null;
}

function normalizeNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return null;
  return n;
}

function reqId() {
  return Math.random().toString(36).slice(2, 10);
}

function classifyOpenAIError(err: any): { code: string; status: number; message: string } {
  const status = Number(err?.status ?? err?.response?.status ?? 500);

  if (status === 401) {
    return {
      code: "OPENAI_AUTH",
      status: 500,
      message: "AI service configuration error. Please try again later.",
    };
  }

  if (status === 429) {
    return {
      code: "OPENAI_LIMIT",
      status: 503,
      message: "AI parsing is temporarily unavailable. Please try again in a few minutes.",
    };
  }

  if (status >= 500) {
    return {
      code: "OPENAI_UPSTREAM",
      status: 503,
      message: "AI service is temporarily unavailable. Please try again shortly.",
    };
  }

  return {
    code: "OPENAI_ERROR",
    status: 500,
    message: "AI parsing failed. Please try again.",
  };
}

const RL_WINDOW_SECONDS = 60 * 60; // 1 hour
const RL_FREE_LIMIT = 30; // /hour
const RL_PRO_LIMIT = 300; // /hour

function toIsoOrNull(x: any): string | null {
  try {
    if (!x) return null;
    const d = new Date(String(x));
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const requestId = reqId();

  // Auth gate
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pro tier check (server truth)
  let pro = { isPro: false as boolean, status: "inactive" as string };
  try {
    const res = await isUserPro(user.id);
    pro = { isPro: !!res.isPro, status: String(res.status ?? "inactive") };
  } catch (e: any) {
    console.error("[journal/parse] isUserPro error", { requestId, message: e?.message });
  }

  // Tiered rate limit key
  const rlKey = pro.isPro ? "journal_parse_v1_pro" : "journal_parse_v1_free";
  const rlLimit = pro.isPro ? RL_PRO_LIMIT : RL_FREE_LIMIT;

  // Rate limit (atomic, per-user)
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_key: rlKey,
      p_limit: rlLimit,
      p_window_seconds: RL_WINDOW_SECONDS,
    });

    if (error) {
      // If RL fails, do NOT block user; log and continue.
      console.error("[journal/parse] rate limit rpc error", { requestId, message: error.message });
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      const allowed = !!row?.allowed;
      const remaining = Number(row?.remaining ?? rlLimit);
      const resetAtIso = toIsoOrNull(row?.reset_at);

      const headers = new Headers();
      headers.set("X-RateLimit-Limit", String(rlLimit));
      headers.set("X-RateLimit-Remaining", String(remaining));
      headers.set("X-RateLimit-Tier", pro.isPro ? "pro" : "free");
      if (resetAtIso) headers.set("X-RateLimit-Reset", resetAtIso);

      if (!allowed) {
        if (resetAtIso) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((new Date(resetAtIso).getTime() - Date.now()) / 1000)
          );
          headers.set("Retry-After", String(retryAfterSeconds));
        }

        return new NextResponse(
          JSON.stringify({
            error: "You’ve hit the AI parsing limit. Please try again shortly.",
            code: "RATE_LIMITED",
            requestId,
            resetAt: resetAtIso,
            tier: pro.isPro ? "pro" : "free",
          }),
          { status: 429, headers }
        );
      }
    }
  } catch (e: any) {
    console.error("[journal/parse] rate limit unexpected error", { requestId, message: e?.message });
  }

  // Body parse
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const openai = getOpenAI();

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      symbol: { type: ["string", "null"], description: "Ticker/symbol, e.g., AAPL, ES, SPY." },
      instrument: {
        type: ["string", "null"],
        enum: ["stock", "option", "future", "crypto", "fx", "other", null],
        description: "Instrument type.",
      },
      side: {
        type: ["string", "null"],
        enum: ["long", "short", null],
        description: "Trade direction.",
      },
      entry_price: { type: ["number", "null"], description: "Entry price (if explicitly present)." },
      stop_price: { type: ["number", "null"], description: "Stop price (risk anchor) (if explicitly present)." },
      exit_price: { type: ["number", "null"], description: "Exit price (if explicitly present)." },
      strategy: { type: ["string", "null"], description: "Optional strategy label." },
      notes: { type: ["string", "null"], description: "Optional cleaned notes." },
    },
    required: ["symbol", "instrument", "side", "entry_price", "stop_price", "exit_price", "strategy", "notes"],
  } as const;

  try {
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      store: false,
      input: [
        {
          role: "system",
          content:
            "Extract structured trade fields from the user's note.\n" +
            "Rules:\n" +
            "- Be conservative: if a value is not explicitly present, return null.\n" +
            "- Do NOT guess prices.\n" +
            "- Symbol: the most likely symbol mentioned; if none, null.\n" +
            "- Instrument and side: only set if clearly stated; else null.\n" +
            "- notes: optional short cleaned version of the user's note; else null.\n" +
            "Return ONLY the JSON object matching the schema.",
        },
        { role: "user", content: text },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "journal_trade_parse_v1",
          strict: true,
          schema,
        },
      },
    });

    const raw = (resp.output_text ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Empty model response", code: "OPENAI_EMPTY", requestId },
        { status: 502 }
      );
    }

    let parsed: ParsedTrade;
    try {
      parsed = JSON.parse(raw) as ParsedTrade;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI output", code: "OPENAI_PARSE", requestId },
        { status: 502 }
      );
    }

    const out: ParsedTrade = {
      symbol: normalizeSymbol(parsed.symbol),
      instrument: normalizeInstrument(parsed.instrument),
      side: normalizeSide(parsed.side),
      entry_price: normalizeNumber(parsed.entry_price),
      stop_price: normalizeNumber(parsed.stop_price),
      exit_price: normalizeNumber(parsed.exit_price),
      strategy: typeof parsed.strategy === "string" && parsed.strategy.trim() ? parsed.strategy.trim() : null,
      notes: typeof parsed.notes === "string" && parsed.notes.trim() ? parsed.notes.trim() : null,
    };

    const warnings: string[] = [];
    if (!out.symbol) warnings.push("No symbol detected.");
    if (!out.side) warnings.push("No side detected (long/short).");
    if (out.entry_price == null) warnings.push("No entry price detected.");
    if (out.stop_price == null) warnings.push("No stop price detected.");

    return NextResponse.json({ trade: out, warnings, requestId, tier: pro.isPro ? "pro" : "free" });
  } catch (err: any) {
    console.error("[journal/parse] OpenAI error", {
      requestId,
      status: err?.status ?? err?.response?.status,
      code: err?.code,
      type: err?.type,
      message: err?.message,
    });

    const safe = classifyOpenAIError(err);
    return NextResponse.json(
      { error: safe.message, code: safe.code, requestId },
      { status: safe.status }
    );
  }
}
