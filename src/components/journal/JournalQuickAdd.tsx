"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@/components/Tooltip";

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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function fmt(n: number | null | undefined, digits = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function labelInstrument(x: InstrumentType | null) {
  if (!x) return "—";
  switch (x) {
    case "stock":
      return "Stock";
    case "option":
      return "Option";
    case "future":
      return "Future";
    case "crypto":
      return "Crypto";
    case "fx":
      return "FX";
    default:
      return "Other";
  }
}

function buildJournalPrefillUrl(trade: ParsedTrade) {
  const params = new URLSearchParams();
  if (trade.symbol) params.set("symbol", trade.symbol);
  if (trade.instrument) params.set("instrument", trade.instrument);
  if (trade.side) params.set("side", trade.side);
  if (typeof trade.entry_price === "number") params.set("entry", String(trade.entry_price));
  if (typeof trade.stop_price === "number") params.set("stop", String(trade.stop_price));
  if (typeof trade.exit_price === "number") params.set("exit", String(trade.exit_price));
  if (trade.strategy) params.set("strategy", trade.strategy);
  if (trade.notes) params.set("notes", trade.notes);

  const qs = params.toString();
  return qs ? `/journal?${qs}` : "/journal";
}

function StopTipBody() {
  return (
    <div className="space-y-2 max-w-xs">
      <div>
        <span className="font-semibold">Stop</span>: the price level that invalidates your trade idea.
      </div>
      <div className="text-foreground/70">
        It defines where you are wrong and prevents small losses from becoming large ones.
      </div>
      <div className="text-foreground/70">
        It also defines <span className="font-semibold">1R</span> (your risk per trade), so Oren can measure expectancy and
        consistency.
      </div>
    </div>
  );
}

type ApiErrorPayload = {
  error?: string;
  code?: string;
  requestId?: string;
};

export default function JournalQuickAdd() {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [trade, setTrade] = useState<ParsedTrade | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // NEW: user-safe reference id from server
  const [refId, setRefId] = useState<string | null>(null);

  const prefillUrl = useMemo(() => (trade ? buildJournalPrefillUrl(trade) : "/journal"), [trade]);

  async function onParse() {
    setError(null);
    setSavedMsg(null);
    setRefId(null);

    setParsing(true);
    setWarnings([]);
    setTrade(null);

    try {
      const res = await fetch("/api/journal/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const j = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const payload = (j ?? {}) as ApiErrorPayload;

        // Prefer server-safe message; fallback only if needed.
        setError(payload.error ?? "AI parsing failed. Please try again.");

        if (payload.requestId) setRefId(payload.requestId);

        setParsing(false);
        return;
      }

      setTrade(j?.trade ?? null);
      setWarnings(Array.isArray(j?.warnings) ? j.warnings : []);
      if (j?.requestId) setRefId(String(j.requestId));

      setParsing(false);
    } catch (e: any) {
      // Network-level / browser-level error — keep it calm.
      setError("Could not reach AI parsing service. Please try again.");
      setParsing(false);
    }
  }

  async function onSave() {
    if (!trade) return;

    setError(null);
    setSavedMsg(null);
    setRefId(null);
    setSaving(true);

    try {
      const res = await fetch("/api/journal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: trade.symbol ?? "",
          instrument: trade.instrument ?? "stock",
          side: trade.side ?? "long",
          entry_price: trade.entry_price,
          stop_price: trade.stop_price,
          exit_price: trade.exit_price,
          strategy: trade.strategy,
          notes: trade.notes,
        }),
      });

      const j = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const payload = (j ?? {}) as ApiErrorPayload;
        setError(payload.error ?? "Save failed");
        if (payload.requestId) setRefId(payload.requestId);
        setSaving(false);
        return;
      }

      setSavedMsg("Saved to Journal.");
      setSaving(false);
    } catch {
      setError("Save failed. Please try again.");
      setSaving(false);
    }
  }

  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold tracking-tight">Trade Journal (Natural Language)</div>
          <div className="text-sm text-foreground/70">
            Describe the trade in plain language. Oren extracts the structured fields for your Journal.
          </div>
        </div>

        <div className="text-xs text-foreground/60">
          <Tooltip label="Parsing rules">
            <div className="space-y-2 max-w-sm">
              <div className="font-semibold">Conservative parsing</div>
              <div className="text-foreground/70">If a value isn’t explicitly stated, it will be left blank. No guessing.</div>
              <div className="text-foreground/70">Tip: include symbol, side, entry, stop, and optionally exit.</div>
            </div>
          </Tooltip>
        </div>
      </div>

      <div className="oc-glass rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Example: "Long AAPL stock. Entry 189.20, stop 187.80. Took profit at 192.10. Notes: trend day."'
          className="min-h-[120px] w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-foreground outline-none placeholder:text-foreground/30"
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onParse}
              disabled={parsing || !text.trim()}
              className={cn("oc-btn oc-btn-primary", (parsing || !text.trim()) && "opacity-60")}
            >
              {parsing ? "Parsing…" : "Parse"}
            </button>

            {trade && (
              <Link href={prefillUrl} className="oc-btn oc-btn-secondary">
                Apply to Journal
              </Link>
            )}

            {trade && (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className={cn("oc-btn oc-btn-secondary", saving && "opacity-60")}
              >
                {saving ? "Saving…" : "Save Trade"}
              </button>
            )}
          </div>

          <div className="text-xs text-foreground/60">
            <span className="text-foreground/80">No automation without review.</span> Parse → preview → apply/save.
          </div>
        </div>

        {(error || savedMsg) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {error && (
              <div className="rounded-lg border border-amber-800/60 bg-[color:var(--card)] px-4 py-3 text-sm text-amber-200">
                <div>{error}</div>
                {refId && <div className="mt-1 text-[11px] text-foreground/60">Ref: {refId}</div>}
              </div>
            )}

            {savedMsg && (
              <div className="rounded-lg border border-[color:var(--accent)]/45 bg-[color:var(--card)] px-4 py-3 text-sm text-[color:var(--accent)]">
                <div>{savedMsg}</div>
                {refId && <div className="mt-1 text-[11px] text-foreground/60">Ref: {refId}</div>}
              </div>
            )}
          </div>
        )}

        {trade && (
          <div className="mt-5 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-tight text-foreground/80">Preview</div>
              <div className="text-xs text-foreground/60">
                <Tooltip label="Stop">
                  <StopTipBody />
                </Tooltip>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-800/60 bg-[color:var(--card)] px-4 py-3 text-sm text-foreground/80">
                <div className="text-xs font-semibold text-amber-200">Missing fields</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-foreground/60">Symbol</div>
                <div className="mt-1 text-sm font-semibold">{trade.symbol ?? "—"}</div>
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-foreground/60">Instrument</div>
                <div className="mt-1 text-sm font-semibold">{labelInstrument(trade.instrument)}</div>
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-foreground/60">Side</div>
                <div className="mt-1 text-sm font-semibold">{trade.side ?? "—"}</div>
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-foreground/60">Entry</div>
                <div className="mt-1 text-sm font-semibold">{fmt(trade.entry_price)}</div>
              </div>

              <div className="rounded-lg border border-[color:var(--accent)]/35 bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-[color:var(--accent)]">Stop</div>
                <div className="mt-1 text-sm font-semibold text-[color:var(--accent)]">{fmt(trade.stop_price)}</div>
              </div>

              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                <div className="text-[11px] text-foreground/60">Exit</div>
                <div className="mt-1 text-sm font-semibold">{fmt(trade.exit_price)}</div>
              </div>
            </div>

            {(trade.strategy || trade.notes) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                  <div className="text-[11px] text-foreground/60">Strategy</div>
                  <div className="mt-1 text-sm">{trade.strategy ?? "—"}</div>
                </div>

                <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-3">
                  <div className="text-[11px] text-foreground/60">Notes</div>
                  <div className="mt-1 text-sm">{trade.notes ?? "—"}</div>
                </div>
              </div>
            )}

            {refId && <div className="mt-3 text-[11px] text-foreground/50">Ref: {refId}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
