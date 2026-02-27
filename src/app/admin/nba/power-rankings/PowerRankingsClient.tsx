// src/app/admin/nba/power-rankings/PowerRankingsClient.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Params = { A: number; k: number; S: number };
type Item = { team: string; rank: number };

const DEFAULT_SEASON = "2025-2026";

const border = "border-[color:var(--border)]";
const card = "bg-[color:var(--card)]";
const subtle = "bg-black/10";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function num(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : fallback;
}

function SortRow({ id, rank, team }: { id: string; rank: number; team: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border ${border} ${subtle} px-3.5 py-3 flex items-center justify-between gap-3`}
    >
      <div className="min-w-0 flex items-center gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={`h-8 w-8 rounded-lg border ${border} bg-white/5 text-foreground/70 hover:bg-white/10 active:scale-[0.98] transition-colors`}
          aria-label="Drag handle"
          title="Drag"
        >
          ≡
        </button>

        <div className="min-w-0">
          <div className="text-xs text-foreground/45 uppercase tracking-wide">Rank</div>
          <div className="text-base font-semibold tabular-nums">{rank}</div>
        </div>

        <div className="min-w-0">
          <div className="text-xs text-foreground/45 uppercase tracking-wide">Team</div>
          <div className="text-base font-semibold truncate">{team}</div>
        </div>
      </div>
    </div>
  );
}

export default function PowerRankingsClient() {
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [items, setItems] = useState<Item[]>([]);
  const [params, setParams] = useState<Params>({ A: 10, k: 0.12, S: 1.0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function load() {
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/nba/power-rankings/get?season=${encodeURIComponent(season)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Load failed.");

      setItems(Array.isArray(json.items) ? json.items : []);
      setParams({
        A: num(json.params?.A, 10),
        k: num(json.params?.k, 0.12),
        S: num(json.params?.S, 1.0),
      });

      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setMsg(e?.message || "Load failed.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  const ids = useMemo(() => items.map((x) => x.team), [items]);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = items.findIndex((x) => x.team === active.id);
    const newIndex = items.findIndex((x) => x.team === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex).map((x, i) => ({
      ...x,
      rank: i + 1,
    }));
    setItems(next);
  }

  async function save() {
    setMsg("");
    setSaving(true);
    try {
      const payload = {
        season,
        params: {
          A: clamp(num(params.A, 10), 0.1, 200),
          k: clamp(num(params.k, 0.12), 0.001, 2.0),
          S: clamp(num(params.S, 1.0), 0.01, 20),
        },
        orderedTeams: items.map((x) => x.team),
      };

      const res = await fetch("/api/admin/nba/power-rankings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed.");

      setMsg("Saved ✅");
      setSaving(false);
      await load();
    } catch (e: any) {
      setSaving(false);
      setMsg(e?.message || "Save failed.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className={`rounded-2xl border ${border} ${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Settings</div>
            <div className="text-xs text-foreground/45 mt-0.5">Season + Oren Edge params. Rankings are 1..30.</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className={`rounded-xl border ${border} bg-white/5 px-4 py-2 text-sm text-foreground hover:bg-white/10 disabled:opacity-60 transition-colors`}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving || loading || items.length === 0}
              className={`rounded-xl border ${border} bg-[color:var(--accent)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)]/20 disabled:opacity-60 transition-colors`}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {!!msg && (
          <div className={`rounded-xl border ${border} ${subtle} px-3.5 py-3 text-sm text-foreground/80`}>{msg}</div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1.5 md:col-span-1">
            <span className="text-[11px] uppercase tracking-wide text-foreground/45">Season</span>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className={`h-11 rounded-xl border ${border} bg-black/10 px-3 text-sm outline-none`}
              placeholder="2025-2026"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-foreground/45">A</span>
            <input
              value={String(params.A)}
              onChange={(e) => setParams((p) => ({ ...p, A: Number(e.target.value) }))}
              inputMode="decimal"
              className={`h-11 rounded-xl border ${border} bg-black/10 px-3 text-sm outline-none`}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-foreground/45">k</span>
            <input
              value={String(params.k)}
              onChange={(e) => setParams((p) => ({ ...p, k: Number(e.target.value) }))}
              inputMode="decimal"
              className={`h-11 rounded-xl border ${border} bg-black/10 px-3 text-sm outline-none`}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-foreground/45">S</span>
            <input
              value={String(params.S)}
              onChange={(e) => setParams((p) => ({ ...p, S: Number(e.target.value) }))}
              inputMode="decimal"
              className={`h-11 rounded-xl border ${border} bg-black/10 px-3 text-sm outline-none`}
            />
          </label>
        </div>
      </section>

      {/* Drag list */}
      <section className={`rounded-2xl border ${border} ${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Power Rankings</div>
            <div className="text-xs text-foreground/45 mt-0.5">Drag handle to reorder.</div>
          </div>
          <div className="text-xs text-foreground/45 tabular-nums">{items.length} teams</div>
        </div>

        {loading ? (
          <div className="text-sm text-foreground/55">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-foreground/60">
            No rankings found for this season yet. Hit <span className="font-semibold">Save changes</span> to seed.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((x) => (
                  <SortRow key={x.team} id={x.team} rank={x.rank} team={x.team} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="text-[11px] text-foreground/35">Tip: keep changes small and track performance in the watchlist scoreboard.</div>
      </section>
    </div>
  );
}