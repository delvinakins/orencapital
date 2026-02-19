"use client";

import * as React from "react";

type AnyTrade = Record<string, any>;

type Props = {
  trade: AnyTrade;
  /** Called with the updated row returned by /api/journal/update */
  onUpdated?: (trade: AnyTrade) => void;
  /** Called after successful delete */
  onDeleted?: (id: string) => void;
  /** Optional: disable buttons (e.g., while parent loading) */
  disabled?: boolean;
};

/**
 * Calm, non-gamified Edit/Delete actions for a journal trade.
 * - Pine for "save" / healthy actions
 * - Amber for warnings/confirmations
 * - No raw server errors exposed
 */
export default function JournalTradeActions({
  trade,
  onUpdated,
  onDeleted,
  disabled,
}: Props) {
  const [openEdit, setOpenEdit] = React.useState(false);
  const [openDelete, setOpenDelete] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Only show fields that exist on the trade object.
  const fields = React.useMemo(() => {
    const candidates: Array<{
      key: string;
      label: string;
      type: "text" | "number" | "textarea" | "datetime";
      placeholder?: string;
      helper?: string;
    }> = [
      { key: "symbol", label: "Symbol", type: "text", placeholder: "e.g., AAPL" },
      { key: "ticker", label: "Symbol", type: "text", placeholder: "e.g., AAPL" },
      {
        key: "side",
        label: "Side",
        type: "text",
        placeholder: "long / short",
        helper: "Long = expecting up, Short = expecting down.",
      },
      { key: "entry", label: "Entry", type: "number" },
      { key: "exit", label: "Exit", type: "number" },
      { key: "stop", label: "Stop", type: "number", helper: "The price where you planned to be wrong." },
      { key: "size", label: "Size", type: "number" },
      {
        key: "r",
        label: "R",
        type: "number",
        helper: "R is your result relative to planned risk (1R = your initial risk).",
      },
      {
        key: "ev",
        label: "EV",
        type: "number",
        helper: "Expected value (optional). If you track it, keep it consistent.",
      },
      {
        key: "strategy",
        label: "Strategy",
        type: "text",
        placeholder: "e.g., Breakout, Mean Reversion",
        helper: "Small samples can be noisy. Use this as a label, not a verdict.",
      },
      {
        key: "trade_idea",
        label: "Trade idea",
        type: "textarea",
        placeholder: "What was the setup and plan?",
      },
      {
        key: "notes",
        label: "Notes",
        type: "textarea",
        placeholder: "What did you learn? What would you repeat or avoid?",
      },
      {
        key: "occurred_at",
        label: "Time",
        type: "datetime",
        helper: "When the trade happened (optional).",
      },
      {
        key: "opened_at",
        label: "Opened",
        type: "datetime",
      },
      {
        key: "closed_at",
        label: "Closed",
        type: "datetime",
      },
    ];

    const existing = new Map<string, { key: string; label: string; type: any; placeholder?: string; helper?: string }>();
    for (const f of candidates) {
      if (trade && Object.prototype.hasOwnProperty.call(trade, f.key)) {
        // de-dupe symbol/ticker label collisions, keep first encountered
        if (!existing.has(f.key)) existing.set(f.key, f);
      }
    }
    return Array.from(existing.values());
  }, [trade]);

  const [draft, setDraft] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    // Initialize draft from current trade each time edit opens
    if (openEdit) {
      const next: Record<string, any> = {};
      for (const f of fields) next[f.key] = trade?.[f.key] ?? "";
      // Always keep id around
      next.id = trade?.id;
      setDraft(next);
      setErrorMsg(null);
    }
  }, [openEdit, fields, trade]);

  function updateDraft(key: string, value: any) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function saveEdit() {
    setSaving(true);
    setErrorMsg(null);

    try {
      const id = trade?.id;
      if (!id) {
        setErrorMsg("Missing trade id.");
        return;
      }

      const updates: Record<string, any> = {};
      for (const f of fields) {
        const raw = draft[f.key];

        if (f.type === "number") {
          // allow blank -> null
          updates[f.key] = raw === "" || raw === null || raw === undefined ? null : Number(raw);
          if (updates[f.key] !== null && Number.isNaN(updates[f.key])) updates[f.key] = null;
        } else if (f.type === "datetime") {
          // keep empty as null; otherwise pass through string
          updates[f.key] = raw ? String(raw) : null;
        } else {
          updates[f.key] = raw === "" ? null : raw;
        }
      }

      const res = await fetch("/api/journal/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, updates }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // User-safe message only
        setErrorMsg(
          typeof json?.error === "string"
            ? json.error
            : "We couldn’t update that trade right now. Please try again."
        );
        return;
      }

      if (json?.trade) onUpdated?.(json.trade);
      setOpenEdit(false);
    } catch {
      setErrorMsg("We couldn’t update that trade right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setErrorMsg(null);

    try {
      const id = trade?.id;
      if (!id) {
        setErrorMsg("Missing trade id.");
        return;
      }

      const res = await fetch("/api/journal/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(
          typeof json?.error === "string"
            ? json.error
            : "We couldn’t delete that trade right now. Please try again."
        );
        return;
      }

      onDeleted?.(id);
      setOpenDelete(false);
    } catch {
      setErrorMsg("We couldn’t delete that trade right now. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpenEdit(true)}
        className="px-3 py-1.5 rounded-lg text-sm border border-white/10 bg-white/5 hover:bg-white/8 transition disabled:opacity-50"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setErrorMsg(null);
          setOpenDelete(true);
        }}
        className="px-3 py-1.5 rounded-lg text-sm border border-amber-400/25 bg-amber-400/10 hover:bg-amber-400/15 text-amber-200 transition disabled:opacity-50"
      >
        Delete
      </button>

      {/* Edit modal */}
      {openEdit && (
        <Modal
          title="Edit trade"
          subtitle="Calm defaults. No automation without review."
          onClose={() => setOpenEdit(false)}
        >
          <div className="space-y-4">
            {fields.length === 0 ? (
              <div className="text-sm text-white/70">
                No editable fields found on this trade object.
              </div>
            ) : (
              <div className="grid gap-3">
                {fields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    value={draft[f.key] ?? ""}
                    onChange={(v) => updateDraft(f.key, v)}
                  />
                ))}
              </div>
            )}

            {errorMsg && (
              <div className="text-sm rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-100 px-3 py-2">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenEdit(false)}
                className="px-3 py-2 rounded-lg text-sm border border-white/10 bg-white/5 hover:bg-white/8 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || fields.length === 0}
                onClick={saveEdit}
                className="px-3 py-2 rounded-lg text-sm border border-white/10 bg-[rgba(28,79,61,0.35)] hover:bg-[rgba(28,79,61,0.5)] transition disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete modal */}
      {openDelete && (
        <Modal
          title="Delete trade?"
          subtitle="This can’t be undone. Small samples can be noisy—delete only if it’s truly a mistake."
          onClose={() => setOpenDelete(false)}
        >
          <div className="space-y-4">
            <div className="text-sm text-white/75">
              We’ll remove this trade from your journal. Strategy stats may change.
            </div>

            {errorMsg && (
              <div className="text-sm rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-100 px-3 py-2">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenDelete(false)}
                className="px-3 py-2 rounded-lg text-sm border border-white/10 bg-white/5 hover:bg-white/8 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-3 py-2 rounded-lg text-sm border border-amber-400/25 bg-amber-400/10 hover:bg-amber-400/15 text-amber-200 transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: {
    key: string;
    label: string;
    type: "text" | "number" | "textarea" | "datetime";
    placeholder?: string;
    helper?: string;
  };
  value: any;
  onChange: (v: any) => void;
}) {
  const id = `trade-edit-${field.key}`;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-white/85">
          {field.label}
        </label>
        {field.helper && (
          <div className="text-xs text-white/45">{field.helper}</div>
        )}
      </div>

      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[rgba(28,79,61,0.45)]"
        />
      ) : (
        <input
          id={id}
          type={field.type === "datetime" ? "datetime-local" : field.type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[rgba(28,79,61,0.45)]"
        />
      )}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl shadow-2xl">
          {/* header */}
          <div className="px-5 py-4 border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white/90">
                  {title}
                </div>
                {subtitle && (
                  <div className="text-sm text-white/55 mt-1">{subtitle}</div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-white/70 hover:text-white/90 hover:bg-white/5 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* body */}
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
