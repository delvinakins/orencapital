"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function Tooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex items-center gap-2">
      <span className="text-sm font-medium text-foreground/90">{label}</span>

      <span
        className="
          inline-flex h-5 w-5 items-center justify-center
          rounded-full
          border border-[color:var(--border)]
          bg-[color:var(--card)]
          text-[11px] text-foreground/70
          transition-colors
          group-hover:border-[color:var(--accent)]
          group-hover:text-[color:var(--accent)]
        "
      >
        i
      </span>

      <span
        className="
          pointer-events-none absolute left-0 top-7 hidden w-80
          rounded-xl border border-[color:var(--border)]
          bg-[color:var(--background)]
          p-3 text-xs text-foreground/90
          shadow-2xl shadow-black/40
          group-hover:block
        "
      >
        {text}
        <div className="mt-2 text-[11px] text-foreground/60">Hover off to close</div>
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

export default function JournalPanel({ snapshot, isPro }: { snapshot: any | null; isPro: boolean }) {
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

      if (!snapshot) {
        setMsg("No snapshot available to save yet. Create one in the Risk Engine or Simulator first.");
        setBusy(null);
        return;
      }

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
    <section className="space-y-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Trade Journal</h2>

        {isPro ? (
          <button onClick={refresh} disabled={busy === "loading"} className="oc-btn oc-btn-secondary disabled:opacity-60">
            {busy === "loading" ? "Loading..." : "Refresh"}
          </button>
        ) : (
          <Link href="/pricing" className="oc-btn oc-btn-primary">
            Upgrade to Pro
          </Link>
        )}
      </div>

      {!isPro && (
        <div className="rounded-lg border border-[color:var(--border)] bg-black/20 p-4 text-sm text-foreground">
          <div className="font-medium">Pro feature 🔒</div>
          <div className="mt-1 text-foreground/70">
            Save snapshots (positions + sizing + notes) so you can review decisions later and build a repeatable playbook.
          </div>
        </div>
      )}

      {!!msg && (
        <div className="rounded-lg border border-[color:var(--border)] bg-black/20 p-3 text-sm text-foreground">
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
            className="h-12 w-full rounded-lg border border-[color:var(--border)] bg-black/20 px-4 text-foreground outline-none placeholder:text-foreground/30 disabled:opacity-60"
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
            className="h-12 w-full rounded-lg border border-[color:var(--border)] bg-black/20 px-4 text-foreground outline-none placeholder:text-foreground/30 disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={!isPro || busy === "saving"} className="oc-btn oc-btn-primary disabled:opacity-60">
          {busy === "saving" ? "Saving..." : "Save snapshot"}
        </button>

        <div className="text-xs text-foreground/60">Snapshot includes account size, sizing mode, positions, and totals.</div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground">Recent snapshots</div>

        {!isPro ? (
          <div className="text-sm text-foreground/60">Upgrade to Pro to view saved snapshots.</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-foreground/60">No snapshots yet. Save one to start building your playbook.</div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-[color:var(--border)] bg-black/20 p-4">
                <div className="text-sm font-medium text-foreground">
                  {it.tag || "Untagged"}{" "}
                  <span className="text-xs text-foreground/60">• {new Date(it.created_at).toLocaleString()}</span>
                </div>

                {it.note && <div className="mt-2 text-sm text-foreground/75">{it.note}</div>}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-foreground/60 hover:text-foreground">
                    View snapshot details
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-[11px] text-foreground/90">
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
