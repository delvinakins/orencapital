"use client";

import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;

function makeStubIndex() {
  const samples = Array.from({ length: 1200 }).map((_, i) => {
    const spread = [-8, -6, -4, -2, 0, 2, 4, 6][i % 8];
    return {
      gameId: `stub-${i}`,
      state: {
        period: (i % 4) + 1,
        secondsRemainingInPeriod: (i * 37) % 720,
        scoreDiff: ((i * 13) % 20) - 10,
      },
      market: {
        closingHomeSpread: spread,
        liveHomeSpread: spread + (((i * 17) % 10) - 5) * 0.2,
      },
    };
  });

  return buildDistributionIndex(samples);
}

const spreadIndex = makeStubIndex();

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtNum(x: any, digits = 1) {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function formatSpread(x: any, digits = 1) {
  if (x == null) return "—";
  const v = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  if (v > 0) return `+${s}`;
  if (v < 0) return s;
  return "0";
}

function DeviationTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Deviation</div>
      <div className="text-foreground/70">
        Measures how far live performance has moved from market expectation.
      </div>
      <div className="text-foreground/70">Higher values indicate a more unusual move.</div>
    </div>
  );
}

type ViewMode = "table" | "treemap";

type Row = {
  key: string;
  abs: number;
  deviation: number;
  matchup: string;
  clock: string;
  live: string;
  close: string;
  deviationText: string;
  toneText: string;
  directionLabel: string;
  tone: "accent" | "warn" | "neutral";
};

/** -------- Treemap (squarify) layout (no deps) -------- */
type Rect = { x: number; y: number; w: number; h: number };

type TreeItem = {
  id: string;
  value: number; // area weight
  row: Row;
};

type Placed = { item: TreeItem; rect: Rect };

function sum(items: TreeItem[]) {
  return items.reduce((a, b) => a + b.value, 0);
}

function worstAspect(row: TreeItem[], side: number) {
  if (row.length === 0) return Infinity;
  const s = sum(row);
  if (s <= 0) return Infinity;

  let minV = Infinity;
  let maxV = 0;
  for (const it of row) {
    minV = Math.min(minV, it.value);
    maxV = Math.max(maxV, it.value);
  }
  if (!Number.isFinite(minV) || minV <= 0) return Infinity;

  const s2 = s * s;
  const side2 = side * side;
  return Math.max((side2 * maxV) / s2, s2 / (side2 * minV));
}

function layoutRow(row: TreeItem[], rect: Rect): { placed: Placed[]; remaining: Rect } {
  const placed: Placed[] = [];
  const s = sum(row);

  if (row.length === 0 || s <= 0 || rect.w <= 0 || rect.h <= 0) {
    return { placed, remaining: rect };
  }

  const horizontal = rect.w >= rect.h;

  if (horizontal) {
    // Row: constant height
    const h = s / rect.w;
    let x = rect.x;

    for (const it of row) {
      const w = it.value / h;
      placed.push({ item: it, rect: { x, y: rect.y, w, h } });
      x += w;
    }

    return {
      placed,
      remaining: { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h },
    };
  } else {
    // Column: constant width
    const w = s / rect.h;
    let y = rect.y;

    for (const it of row) {
      const h = it.value / w;
      placed.push({ item: it, rect: { x: rect.x, y, w, h } });
      y += h;
    }

    return {
      placed,
      remaining: { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h },
    };
  }
}

function squarify(items: TreeItem[], rect: Rect): Placed[] {
  const placed: Placed[] = [];
  const remaining = [...items]
    .filter((it) => Number.isFinite(it.value) && it.value > 0)
    .sort((a, b) => b.value - a.value);

  let r: Rect = { ...rect };
  let row: TreeItem[] = [];

  while (remaining.length > 0) {
    const next = remaining[0];
    const side = Math.min(r.w, r.h);

    if (row.length === 0) {
      row.push(next);
      remaining.shift();
      continue;
    }

    const currentWorst = worstAspect(row, side);
    const nextWorst = worstAspect([...row, next], side);

    if (nextWorst <= currentWorst) {
      row.push(next);
      remaining.shift();
    } else {
      const res = layoutRow(row, r);
      placed.push(...res.placed);
      r = res.remaining;
      row = [];
      // If the remaining rect is degenerate, stop
      if (r.w <= 0 || r.h <= 0) break;
    }
  }

  if (row.length > 0 && r.w > 0 && r.h > 0) {
    const res = layoutRow(row, r);
    placed.push(...res.placed);
  }

  return placed;
}

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("table");

  async function load() {
    setLoadError(null);

    try {
      const res = await fetch("/api/labs/nba/mock-games", { cache: "no-store" });

      if (res.status === 404) {
        setGames([]);
        setLoadError("Feed endpoint not found.");
        setLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setGames([]);
        setLoadError("Unable to load games right now.");
        setLoading(false);
        return;
      }

      const json = await res.json().catch(() => null);

      if (!json?.ok || !Array.isArray(json.items)) {
        setGames([]);
        setLoadError("Unable to load games right now.");
        setLoading(false);
        return;
      }

      setGames(json.items);
      setLoading(false);
    } catch {
      setGames([]);
      setLoadError("Unable to load games right now.");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 90 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<Row[]>(() => {
    const computed = games.map((g: any) => {
      const result = computeDeviation(g, { spreadIndex });

      const deviation = Number.isFinite(result.zSpread) ? result.zSpread : 0;
      const abs = Math.abs(deviation);

      const tone: Row["tone"] = abs >= 1.5 ? "accent" : abs >= 1.0 ? "warn" : "neutral";
      const toneText =
        tone === "accent"
          ? "text-[color:var(--accent)]"
          : tone === "warn"
            ? "text-amber-200"
            : "text-foreground/80";

      const mm = Math.floor((Number(g.secondsRemaining) || 0) / 60);
      const ss = String((Number(g.secondsRemaining) || 0) % 60).padStart(2, "0");

      const directionLabel =
        deviation >= 0.35 ? "above expectation" : deviation <= -0.35 ? "below expectation" : "near expectation";

      return {
        key: String(g.gameId ?? `${g.awayTeam}-${g.homeTeam}`),
        abs,
        deviation,
        matchup: `${g.awayTeam ?? "—"} @ ${g.homeTeam ?? "—"}`,
        clock: `P${g.period ?? "—"} • ${mm}:${ss}`,
        live: formatSpread(g.liveSpreadHome, 1),
        close: formatSpread(g.closingSpreadHome, 1),
        deviationText: fmtNum(deviation, 2),
        toneText,
        directionLabel,
        tone,
      };
    });

    computed.sort((a, b) => b.abs - a.abs);
    return computed;
  }, [games]);

  const treemap = useMemo(() => {
    const W = 1000;
    const H = 520;

    const baseArea = W * H;

    const items: TreeItem[] = rows.map((r) => {
      const capped = clamp(r.abs, 0, 2.2);
      const weight = 1 + capped * 3.0;
      return { id: r.key, value: weight, row: r };
    });

    const total = items.reduce((a, b) => a + b.value, 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    const scaled: TreeItem[] = items.map((it) => ({
      ...it,
      value: (it.value / total) * baseArea,
    }));

    const placed = squarify(scaled, { x: 0, y: 0, w: W, h: H });

    return placed.map(({ item, rect }) => {
      const left = (rect.x / W) * 100;
      const top = (rect.y / H) * 100;
      const width = (rect.w / W) * 100;
      const height = (rect.h / H) * 100;
      return { item, left, top, width, height };
    });
  }, [rows]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
              Labs • NBA
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Live Deviation Heat Map</h1>

            <p className="mt-4 max-w-3xl text-lg text-foreground/75">
              Highlights games performing materially above or below market expectation.
            </p>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "table" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setView("treemap")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "treemap" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Treemap
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          {loading ? (
            <div className="text-foreground/70">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-foreground/70">{loadError ?? "No games available."}</div>
          ) : view === "table" ? (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">Matchup</th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                    <th className="px-4 py-3 font-medium">Live Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">Closing Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Deviation">
                        <DeviationTip />
                      </Tooltip>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-[color:var(--border)]">
                      <td className="px-4 py-3 font-medium text-foreground">{r.matchup}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.clock}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.live}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.close}</td>
                      <td className={cn("px-4 py-3 font-medium", r.toneText)}>{r.deviationText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 text-sm text-foreground/55">Lab preview. All signals require review.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]/80" />
                  <span>unusual move</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                  <span>worth watching</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/30" />
                  <span>typical range</span>
                </div>
              </div>

              <div className="relative w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20">
                <div className="relative h-[520px]">
                  {treemap.map((t) => {
                    const r = t.item.row;

                    const tileClass =
                      r.tone === "accent"
                        ? "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 shadow-[0_0_0_1px_rgba(43,203,119,0.08)]"
                        : r.tone === "warn"
                          ? "border-amber-800/50 bg-amber-900/10"
                          : "border-white/10 bg-white/5";

                    const showDetails = t.width >= 14 && t.height >= 14;

                    return (
                      <div
                        key={t.item.id}
                        className={cn("absolute rounded-xl border p-3 transition-[filter] duration-200 hover:brightness-110")}
                        style={{
                          left: `${t.left}%`,
                          top: `${t.top}%`,
                          width: `${t.width}%`,
                          height: `${t.height}%`,
                        }}
                        title={`${r.matchup} • ${r.clock} • ${r.directionLabel}`}
                      >
                        <div className={cn("h-full w-full rounded-xl", tileClass)}>
                          <div className="h-full w-full p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-foreground">{r.matchup}</div>
                                <div className="mt-1 text-xs text-foreground/65">{r.clock}</div>
                              </div>

                              <div className={cn("text-xs font-semibold", r.toneText)}>{r.directionLabel}</div>
                            </div>

                            {showDetails ? (
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-1.5">
                                  <div className="text-foreground/60">Live</div>
                                  <div className="mt-0.5 font-semibold text-foreground">{r.live}</div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-black/10 px-2 py-1.5">
                                  <div className="text-foreground/60">Close</div>
                                  <div className="mt-0.5 font-semibold text-foreground">{r.close}</div>
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-3 flex items-center justify-between text-xs">
                              <div className="text-foreground/60">
                                <Tooltip label="Deviation">
                                  <DeviationTip />
                                </Tooltip>
                              </div>
                              <div className={cn("font-semibold", r.toneText)}>{r.deviationText}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-sm text-foreground/55">Lab preview. All signals require review.</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}