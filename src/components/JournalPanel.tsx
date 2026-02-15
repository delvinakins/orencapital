"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function Tooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex items-center gap-2">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950/40 text-[11px] text-slate-300">
        i
      </span>
      <span className="pointer-events-none absolute left-0 top-7 hidden w-80 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

type JournalItem = {
  id: string;
  tag: string | null;
  note: string | null;
  created_at: string;
  snapshot: any;
};

export default function JournalPanel({
  snapshot,
  isPro,
}: {
  snapshot: any;
  isPro: boolean;
}) {
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<JournalItem[]>([]);
  const [busy, setBusy] = useState<null | "saving" | "loading">(null);
  const [msg, setMsg] = useState<string>("");

  async function refresh() {
    try {
      setMsg("");
      setBusy("loading");
      const res = await fetch("/api/journal/list");
      const json = await res.json().catch(() => ({}));

      if (res.status === 402) {
        // No redirect — just show locked state.
        setMsg("Pro required for Journal. Upgrade to unlock.");
        setBusy(null);
        return;
      }

      if (!res.ok) {
        setMsg(json?.error || "Could not load journal.");
        setBusy(null);
        return;
      }

      setItems((json?.items ?? []) as JournalItem[]);
      setBusy(null);
    } catch (e: any) {
      setBusy(null);
      setMsg(e?.message || "Could not load journal.");
    }
  }

  async function save() {
    try {
      setMsg("");
      setBusy("saving");

      const res = await fetch("/api/journal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: tag.trim(),
          note: note.trim(),
          snapshot: {
            ...snapshot,
            savedAt: new Date().toISOString(),
          },
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 402) {
        setMsg("Pro required for Journal. Upgrade to unlock.");
        setBusy(null);
        return;
      }

      if (!res.ok) {
        setMsg(json?.error || "Save failed.");
        setBusy(null);
        return;
      }

      setMsg("Snapshot saved ✅");
      setBusy(null);
      await refresh();
    } catch (e: any) {
      setBusy(null);
      setMsg(e?.message || "Save failed.");
    }
  }

  // Only auto-load if Pro (prevents “snap back” behavior)
  useEffect(() => {
    if (isPro) refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/30 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Trade Journal</h2>

        {isPro ? (
          <button
            onClick={refresh}
            disabled={busy === "loading"}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/30 px-4 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-60"
          >
            {busy === "loading" ? "Loading..." : "Refresh"}
          </button>
        ) : (
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>

      {!isPro && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="font-medium">Pro feature 🔒</div>
          <div className="mt-1 text-slate-300">
            Save snapshots (positions + sizing + notes) so you can review decisions later and build a repeatable playbook.
          </div>
        </div>
      )}

      {!!msg && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
          {msg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Tooltip
            label="Tag"
            text='Short label for filtering later. Examples: "NVDA", "Earnings", "Breakout", "Mean reversion".'
          />
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="NVDA"
            disabled={!isPro}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-slate-600 disabled:opacity-60"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Tooltip
            label="Snapshot note"
            text="Write why you're taking the trade, what invalidates it, and what would make you NOT take it."
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Clean pullback entry. Risk controlled. No revenge sizing."
            disabled={!isPro}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-slate-600 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={!isPro || busy === "saving"}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white disabled:opacity-60"
        >
          {busy === "saving" ? "Saving..." : "Save snapshot"}
        </button>

        <div className="text-xs text-slate-500">
          Snapshot includes account size, sizing mode, positions, and totals.
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Recent snapshots</div>

        {!isPro ? (
          <div className="text-sm text-slate-400">Upgrade to Pro to view saved snapshots.</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400">
            No snapshots yet. Save one to start building your playbook.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-sm font-medium text-slate-200">
                  {(it.tag || "Untagged")}{" "}
                  <span className="text-xs text-slate-500">
                    • {new Date(it.created_at).toLocaleString()}
                  </span>
                </div>

                {it.note && <div className="mt-2 text-sm text-slate-300">{it.note}</div>}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                    View snapshot details
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-200">
{JSON.stringify(it.snapshot, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
