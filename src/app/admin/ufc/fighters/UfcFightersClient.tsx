"use client";

import { useEffect, useState } from "react";

const WEIGHT_CLASSES = [
  "Heavyweight",
  "Light Heavyweight",
  "Middleweight",
  "Welterweight",
  "Lightweight",
  "Featherweight",
  "Bantamweight",
  "Flyweight",
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
];

type FighterStyle = "ko_artist" | "grappler" | "balanced";

type FighterRow = {
  name: string;
  elo: number;
  fights: number;
  style: FighterStyle;
  dob: string;
  tdAccuracy: string;      // string for input binding, parsed on save
  groundCtrlPct: string;
  weightClass: string;
};

const border = "border-[color:var(--border)]";
const card   = "bg-[color:var(--card)]";
const subtle = "bg-black/10";

const STYLE_LABELS: Record<FighterStyle, string> = {
  ko_artist: "KO Artist",
  grappler:  "Grappler",
  balanced:  "Balanced",
};

function num(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : fallback;
}

export default function UfcFightersClient() {
  const [weightClass, setWeightClass] = useState("Lightweight");
  const [fighters, setFighters] = useState<FighterRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");
  const [source, setSource]     = useState<"db" | "defaults">("defaults");

  async function load(wc: string) {
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/ufc/fighters/get?weightClass=${encodeURIComponent(wc)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Load failed.");

      setSource(json.source ?? "db");
      setFighters(
        (json.fighters as any[]).map((f) => ({
          name:          f.name,
          elo:           num(f.elo, 1500),
          fights:        f.fights ?? 0,
          style:         f.style ?? "balanced",
          dob:           f.dob ?? "",
          tdAccuracy:    f.tdAccuracy != null ? String(f.tdAccuracy) : "",
          groundCtrlPct: f.groundCtrlPct != null ? String(f.groundCtrlPct) : "",
          weightClass:   f.weightClass ?? wc,
        }))
      );
    } catch (e: any) {
      setMsg(e?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(weightClass); }, [weightClass]);

  function update(idx: number, field: keyof FighterRow, value: any) {
    setFighters((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  function addFighter() {
    setFighters((prev) => [...prev, {
      name: "", elo: 1500, fights: 0, style: "balanced",
      dob: "", tdAccuracy: "", groundCtrlPct: "", weightClass,
    }]);
  }

  function removeFighter(idx: number) {
    setFighters((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setMsg("");
    setSaving(true);
    try {
      const payload = {
        weightClass,
        fighters: fighters
          .filter((f) => f.name.trim())
          .map((f) => ({
            name:          f.name.trim(),
            elo:           num(f.elo, 1500),
            style:         f.style,
            dob:           f.dob.trim() || null,
            tdAccuracy:    f.tdAccuracy.trim() ? num(f.tdAccuracy, 0) : null,
            groundCtrlPct: f.groundCtrlPct.trim() ? num(f.groundCtrlPct, 0) : null,
          })),
      };

      const res = await fetch("/api/admin/ufc/fighters/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed.");

      setMsg(`Saved ${json.count} fighters ✅`);
      await load(weightClass);
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* Weight class selector */}
      <section className={`rounded-2xl border ${border} ${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium mb-1.5">Weight class</div>
            <select
              value={weightClass}
              onChange={(e) => setWeightClass(e.target.value)}
              className={`rounded-xl border ${border} bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
            >
              {WEIGHT_CLASSES.map((wc) => (
                <option key={wc} value={wc}>{wc}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {source === "defaults" && (
              <span className="text-xs text-amber-300/70 border border-amber-400/20 rounded-full px-2.5 py-1">
                Showing defaults — save to seed DB
              </span>
            )}
            <button
              type="button"
              onClick={() => load(weightClass)}
              disabled={loading}
              className={`rounded-xl border ${border} bg-white/5 px-4 py-2 text-sm`}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading || fighters.filter((f) => f.name.trim()).length === 0}
              className={`rounded-xl border ${border} bg-[color:var(--accent)]/15 px-4 py-2 text-sm font-semibold`}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {msg && (
          <div className={`rounded-xl border ${border} ${subtle} px-3.5 py-2.5 text-sm`}>
            {msg}
          </div>
        )}
      </section>

      {/* Fighter list */}
      <section className={`rounded-2xl border ${border} ${card} p-5 space-y-3`}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium">{weightClass} — {fighters.length} fighters</div>
          <div className="grid grid-cols-5 gap-2 text-[10px] text-foreground/40 uppercase tracking-wide pr-10 hidden sm:grid"
            style={{ width: "72%" }}>
            <span>Fighter</span>
            <span>Style</span>
            <span>OCR Elo</span>
            <span className="col-span-2">Optional stats (DOB · TD% · Ctrl%)</span>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-foreground/55">Loading…</div>
        ) : (
          <div className="space-y-2">
            {fighters.map((f, idx) => (
              <div
                key={idx}
                className={`rounded-xl border ${border} ${subtle} px-3.5 py-3 flex flex-wrap items-center gap-3`}
              >
                {/* Name */}
                <input
                  type="text"
                  value={f.name}
                  onChange={(e) => update(idx, "name", e.target.value)}
                  placeholder="Fighter name"
                  className={`rounded-lg border ${border} bg-white/5 px-3 py-1.5 text-sm text-foreground min-w-[160px] flex-1 focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                />

                {/* Style dropdown — the on-the-fly control */}
                <select
                  value={f.style}
                  onChange={(e) => update(idx, "style", e.target.value as FighterStyle)}
                  className={`rounded-lg border ${border} bg-white/5 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                >
                  {(Object.entries(STYLE_LABELS) as [FighterStyle, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>

                {/* Elo */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-foreground/40">OCR</span>
                  <input
                    type="number"
                    value={f.elo}
                    onChange={(e) => update(idx, "elo", num(e.target.value, 1500))}
                    min={500} max={3000} step={10}
                    className={`rounded-lg border ${border} bg-white/5 px-2.5 py-1.5 text-sm text-foreground w-20 tabular-nums focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                  />
                </div>

                {/* Optional fields */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    value={f.dob}
                    onChange={(e) => update(idx, "dob", e.target.value)}
                    placeholder="DOB (YYYY-MM-DD)"
                    className={`rounded-lg border ${border} bg-white/5 px-2.5 py-1.5 text-xs text-foreground w-36 focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                  />
                  <input
                    type="text"
                    value={f.tdAccuracy}
                    onChange={(e) => update(idx, "tdAccuracy", e.target.value)}
                    placeholder="TD% (0–1)"
                    className={`rounded-lg border ${border} bg-white/5 px-2.5 py-1.5 text-xs text-foreground w-24 tabular-nums focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                  />
                  <input
                    type="text"
                    value={f.groundCtrlPct}
                    onChange={(e) => update(idx, "groundCtrlPct", e.target.value)}
                    placeholder="Ctrl% (0–1)"
                    className={`rounded-lg border ${border} bg-white/5 px-2.5 py-1.5 text-xs text-foreground w-24 tabular-nums focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]`}
                  />
                </div>

                {/* Fight count (read-only) */}
                {f.fights > 0 && (
                  <span className="text-[10px] text-foreground/30 tabular-nums">{f.fights}F</span>
                )}

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeFighter(idx)}
                  className="ml-auto rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground/50 hover:text-rose-300 hover:border-rose-400/30 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add fighter */}
        <button
          type="button"
          onClick={addFighter}
          className={`w-full rounded-xl border border-dashed ${border} px-4 py-3 text-sm text-foreground/40 hover:text-foreground/70 hover:border-[color:var(--accent)]/40 transition-colors`}
        >
          + Add fighter
        </button>
      </section>

      {/* OCR reference */}
      <section className={`rounded-2xl border ${border} ${card} px-5 py-4`}>
        <div className="text-xs text-foreground/40 space-y-1">
          <div className="font-medium text-foreground/60 mb-2">OCR style rules (reference)</div>
          <div><span className="text-rose-300/80">KO Artist</span> — KO/TKO rate ≥ 50%. Gets +30 effective Elo edge at matchup time.</div>
          <div><span className="text-blue-300/80">Grappler</span> — TD% ≥ 45% + Ctrl% ≥ 35%, or sub rate ≥ 40%. Gets +50 Elo edge vs non-KO artists.</div>
          <div><span className="text-foreground/60">Balanced</span> — No matchup bonus.</div>
          <div className="pt-1">Elo seeded from UFC ranking: Champ = 1720, #1 = 1680, scales down ~11 pts/rank.</div>
        </div>
      </section>

    </div>
  );
}
