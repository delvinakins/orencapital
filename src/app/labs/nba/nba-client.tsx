// src/app/labs/nba/nba-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;

type LiveMeta = { stale?: boolean; updatedAt?: string; window?: "active" | "offhours" } | undefined;

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

function roundToHalf(x: any): number | null {
  if (x == null) return null;
  const v = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 2) / 2;
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

function safeInt(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function getLiveScore(g: any): { away: number | null; home: number | null } {
  const away =
    safeInt(g?.awayScore) ??
    safeInt(g?.away_score) ??
    safeInt(g?.score?.away) ??
    safeInt(g?.away?.score) ??
    null;

  const home =
    safeInt(g?.homeScore) ??
    safeInt(g?.home_score) ??
    safeInt(g?.score?.home) ??
    safeInt(g?.home?.score) ??
    null;

  return { away, home };
}

function formatSigned(x: number, digits = 1) {
  const v = Number.isFinite(x) ? x : 0;
  const s = Math.abs(v).toFixed(digits);
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return `0.${"0".repeat(Math.max(0, digits))}`;
}

function formatUpdatedAtPT(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatTodayPT(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(now);
}

function isAfter2pmPT(now: Date): boolean {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  }).format(now);

  const h = Number(hourStr);
  return Number.isFinite(h) ? h >= 14 : false;
}

function MoveGapTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Move gap</div>
      <div className="text-foreground/70">
        Compares the current live-vs-close move to what typically happens in similar game states.
      </div>
      <div className="text-foreground/70">
        Larger gaps may require review. It’s a watchlist signal — not a bet button.
      </div>
    </div>
  );
}

type ViewMode = "slate" | "heatmap";

type Row = {
  key: string;

  abs: number; // |moveGapPts|
  moveGapPts: number; // signed

  observedMove: number; // live - close
  expectedMove: number; // typical (model expected) live - close

  awayTeam: string;
  homeTeam: string;

  awayScore: number | null;
  homeScore: number | null;

  matchup: string;
  clock: string;

  live: string;
  close: string;

  scoreText: string;
  tone: "accent" | "warn" | "neutral";

  absZ: number;

  phase: "pregame" | "live" | "final" | "unknown";
  isLive: boolean;
};

/** -------- Treemap (squarify) layout (no deps) -------- */
type Rect = { x: number; y: number; w: number; h: number };

type TreeItem = {
  id: string;
  value: number;
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
      if (r.w <= 0 || r.h <= 0) break;
    }
  }

  if (row.length > 0 && r.w > 0 && r.h > 0) {
    const res = layoutRow(row, r);
    placed.push(...res.placed);
  }

  return placed;
}

function toneFromAbsZ(absZ: number): Row["tone"] {
  if (absZ >= 1.5) return "accent";
  if (absZ >= 1.0) return "warn";
  return "neutral";
}

function bgFromTone(tone: Row["tone"], intensity01: number) {
  const a = clamp(intensity01, 0, 1);
  if (tone === "accent") return `rgba(43, 203, 119, ${0.10 + 0.22 * a})`;
  if (tone === "warn") return `rgba(245, 158, 11, ${0.08 + 0.18 * a})`;
  return `rgba(255, 255, 255, ${0.03 + 0.06 * a})`;
}

function borderFromTone(tone: Row["tone"]) {
  if (tone === "accent") return "rgba(43, 203, 119, 0.22)";
  if (tone === "warn") return "rgba(245, 158, 11, 0.22)";
  return "rgba(255, 255, 255, 0.10)";
}

function textToneClass(tone: Row["tone"]) {
  if (tone === "accent") return "text-[color:var(--accent)]";
  if (tone === "warn") return "text-amber-200";
  return "text-foreground/80";
}

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LiveMeta>(undefined);

  const [view, setView] = useState<ViewMode>("slate");

  // Ticking clock so the "after 2pm PT" gating flips without a reload.
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const after2pm = useMemo(() => isAfter2pmPT(new Date(nowTick)), [nowTick]);
  const headerDate = useMemo(() => formatTodayPT(), [nowTick]);

  async function load() {
    setLoadError(null);

    try {
      const res = await fetch("/api/labs/nba/live-games", { cache: "no-store" });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setGames([]);
        setMeta(undefined);
        setLoadError("Unable to load games right now.");
        setLoading(false);
        return;
      }

      const json = await res.json().catch(() => null);

      if (json?.ok && Array.isArray(json.items)) {
        setGames(json.items);
        setMeta(json.meta);
        setLoading(false);
        return;
      }

      setMeta(undefined);
      setLoadError("Live feed is offline right now.");
      setLoading(false);
    } catch {
      setMeta(undefined);
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

  const updatedAtLabel = useMemo(() => formatUpdatedAtPT(meta?.updatedAt), [meta?.updatedAt]);
  const isStale = Boolean(meta?.stale);

  const rows = useMemo<Row[]>(() => {
    const computed = games.map((g: any) => {
      const phase = String(g?.phase ?? "unknown") as Row["phase"];
      const isLive = phase === "live";

      // Only compute “signal” after 2pm PT (spreads are hidden before then).
      const result = after2pm ? computeDeviation(g, { spreadIndex }) : null;

      const abs = after2pm && result && Number.isFinite(result.absDislocationPts) ? result.absDislocationPts : 0;
      const moveGapPts = after2pm && result && Number.isFinite(result.dislocationPts) ? result.dislocationPts : 0;

      const observedMove = after2pm && result && Number.isFinite(result.observedMove) ? result.observedMove : 0;
      const expectedMove = after2pm && result && Number.isFinite(result.expectedMove) ? result.expectedMove : 0;

      const absZ = after2pm && result && Number.isFinite(result.absZ) ? result.absZ : 0;
      const tone = after2pm ? toneFromAbsZ(absZ) : "neutral";

      const awayTeam = String(g?.awayTeam ?? "—");
      const homeTeam = String(g?.homeTeam ?? "—");

      const s = getLiveScore(g);

      // Clock (calm): when we truly don't have secondsRemaining, avoid fake 0:00
      const period = safeInt(g?.period);
      const secondsRemaining = safeInt(g?.secondsRemaining);
      const mm = secondsRemaining != null ? Math.floor(secondsRemaining / 60) : null;
      const ss = secondsRemaining != null ? String(secondsRemaining % 60).padStart(2, "0") : null;

      const clock =
        period == null || period === 0
          ? "Pregame"
          : mm == null || ss == null
          ? `P${period} • —`
          : `P${period} • ${mm}:${ss}`;

      // Round spreads to nearest 0.5 for display
      const liveRounded = roundToHalf(g?.liveSpreadHome);
      const closeRounded = roundToHalf(g?.closingSpreadHome);

      return {
        key: String(g.gameId ?? `${awayTeam}-${homeTeam}`),

        abs,
        moveGapPts,

        observedMove,
        expectedMove,

        awayTeam,
        homeTeam,
        awayScore: s.away,
        homeScore: s.home,

        matchup: `${awayTeam} @ ${homeTeam}`,
        clock,

        live: after2pm ? formatSpread(liveRounded, 1) : "—",
        close: after2pm ? formatSpread(closeRounded, 1) : "—",

        scoreText: after2pm ? formatSigned(moveGapPts, 1) : "—",
        tone,
        absZ,

        phase,
        isLive,
      };
    });

    // Before 2pm, keep stable ordering by matchup; after 2pm, rank by abs move-gap.
    // Always float live games to the top within the chosen ordering.
    if (after2pm) computed.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0) || b.abs - a.abs);
    else computed.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0) || a.matchup.localeCompare(b.matchup));

    return computed;
  }, [games, after2pm]);

  // Heat map filtering:
  // - After 2pm: hide low signal
  // - Before 2pm: show all games (neutral tiles, equal weights)
  const heatRows = useMemo(() => {
    if (!after2pm) return rows;
    return rows.filter((r) => r.abs >= 0.6 || r.isLive); // keep live games visible even if abs is small
  }, [rows, after2pm]);

  const treemap = useMemo(() => {
    const W = 1000;
    const H = 720;
    const area = W * H;

    const items: TreeItem[] = heatRows.map((r) => {
      if (!after2pm) {
        // Pre-2pm: equal weights; no implied “signal”
        return { id: r.key, value: 1, row: r };
      }

      const capped = clamp(r.abs, 0, 4.0);
      // Slight bump for live games so they’re easier to spot, without feeling “gamified”
      const liveBump = r.isLive ? 0.35 : 0;
      const weight = 1 + (capped + liveBump) * 3.0;
      return { id: r.key, value: weight, row: r };
    });

    const total = items.reduce((a, b) => a + b.value, 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    const scaled: TreeItem[] = items.map((it) => ({ ...it, value: (it.value / total) * area }));
    const placed = squarify(scaled, { x: 0, y: 0, w: W, h: H });

    const gutterPx = 12;

    return placed.map(({ item, rect }) => {
      const leftPct = (rect.x / W) * 100;
      const topPct = (rect.y / H) * 100;
      const widthPct = (rect.w / W) * 100;
      const heightPct = (rect.h / H) * 100;

      return {
        item,
        left: `calc(${leftPct}% + ${gutterPx / 2}px)`,
        top: `calc(${topPct}% + ${gutterPx / 2}px)`,
        width: `calc(${widthPct}% - ${gutterPx}px)`,
        height: `calc(${heightPct}% - ${gutterPx}px)`,
        widthPct,
        heightPct,
      };
    });
  }, [heatRows, after2pm]);

  const liveCount = useMemo(() => rows.filter((r) => r.isLive).length, [rows]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
                Labs • NBA
              </div>

              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground/70">
                {isStale ? "Snapshot" : "Live"}
              </div>

              {updatedAtLabel ? <div className="text-xs text-foreground/55">Last updated {updatedAtLabel} PT</div> : null}

              {liveCount > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-3 py-1 text-xs text-[color:var(--accent)]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                  {liveCount} live
                </div>
              ) : null}

              {!after2pm ? (
                <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground/70">
                  Spreads unlock at 5pm EST
                </div>
              ) : null}
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Live Deviation Heat Map</h1>

            <p className="mt-4 max-w-3xl text-lg text-foreground/75">
              Highlights games where the live market move differs from what’s typical for similar game states.
            </p>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setView("slate")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "slate" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Slate
            </button>
            <button
              type="button"
              onClick={() => setView("heatmap")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                view === "heatmap" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Heat Map
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          {loading ? (
            <div className="text-foreground/70">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="space-y-2 text-foreground/70">
              <div>{loadError ?? "Live feed is offline right now."}</div>
              <div className="text-sm text-foreground/55">
                If you checked after hours, the last available snapshot will appear once it exists.
              </div>
            </div>
          ) : view === "slate" ? (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">
                      Matchup <span className="text-foreground/40">({headerDate})</span>
                    </th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                    <th className="px-4 py-3 font-medium">Live Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">Closing Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Move gap">
                        <MoveGapTip />
                      </Tooltip>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => {
                    const hasScore = typeof r.awayScore === "number" && typeof r.homeScore === "number";
                    const scoreClass = textToneClass(r.tone);

                    return (
                      <tr
                        key={r.key}
                        className={cn(
                          "border-t border-[color:var(--border)]",
                          r.isLive && "bg-[color:var(--accent)]/5"
                        )}
                        style={r.isLive ? { boxShadow: "inset 0 0 0 1px rgba(43,203,119,0.18)" } : undefined}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-foreground">{r.matchup}</div>
                            {r.isLive ? (
                              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2.5 py-0.5 text-xs text-[color:var(--accent)]">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                                LIVE
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 text-sm text-foreground/70">
                            {hasScore ? (
                              <span>
                                <span className="text-foreground/65">{r.awayTeam}</span>{" "}
                                <span className="font-semibold text-foreground">{r.awayScore}</span>
                                <span className="text-foreground/55"> — </span>
                                <span className="font-semibold text-foreground">{r.homeScore}</span>{" "}
                                <span className="text-foreground/65">{r.homeTeam}</span>
                              </span>
                            ) : (
                              <span className="text-foreground/55">Score unavailable</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {r.isLive ? (
                            <div className="inline-flex items-center rounded-lg border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2.5 py-1 text-sm text-foreground">
                              <span className="text-foreground/80">{r.clock}</span>
                            </div>
                          ) : (
                            <div className="text-foreground/80">{r.clock}</div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-foreground/80">{r.live}</td>
                        <td className="px-4 py-3 text-foreground/80">{r.close}</td>
                        <td className={cn("px-4 py-3 font-medium tabular-nums", scoreClass)}>{r.scoreText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 text-sm text-foreground/55">Lab preview. All signals require review.</div>

              {!after2pm ? (
                <div className="mt-2 text-sm text-foreground/55">Spread-based signals are hidden before 5pm EST.</div>
              ) : null}

              <div className="mt-2 text-xs text-foreground/55">
                Spreads are rounded to the nearest 0.5 for readability.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]/80" />
                    <span>{after2pm ? "larger move gap" : "games"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                    <span>{after2pm ? "worth watching" : "labels unlock at 5pm EST"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/30" />
                    <span>typical range</span>
                  </div>
                </div>

                <div className="text-sm text-foreground/60">
                  <Tooltip label="Move gap">
                    <MoveGapTip />
                  </Tooltip>
                </div>
              </div>

              <div className="relative w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20">
                <div className="relative h-[720px]">
                  {treemap.map((t) => {
                    const r = t.item.row;

                    const isLarge = t.widthPct >= 24 && t.heightPct >= 24;
                    const isMedium = t.widthPct >= 16 && t.heightPct >= 16;

                    const intensity01 = after2pm ? clamp(r.abs / 3.0, 0, 1) : 0;
                    const tone: Row["tone"] = after2pm ? r.tone : "neutral";

                    const bg = bgFromTone(tone, intensity01);
                    const border = borderFromTone(tone);
                    const numClass = textToneClass(tone);

                    const showClock = isMedium;

                    // Only show spread-derived details after 2pm PT
                    const showLiveClose = after2pm && isLarge;

                    const hasScore = typeof r.awayScore === "number" && typeof r.homeScore === "number";
                    const showScoreLine = isLarge && hasScore;

                    const showMoveNormal = after2pm && isLarge;

                    const showMoveGapNumber = after2pm;

                    const liveOutline = r.isLive ? "rgba(43, 203, 119, 0.32)" : border;

                    return (
                      <div
                        key={t.item.id}
                        className={cn(
                          "absolute overflow-hidden rounded-lg",
                          "transition-[filter,transform] duration-200 hover:brightness-110"
                        )}
                        style={{
                          left: t.left,
                          top: t.top,
                          width: t.width,
                          height: t.height,
                          background: bg,
                          border: `1px solid ${liveOutline}`,
                          boxShadow: r.isLive ? "0 0 0 1px rgba(43,203,119,0.10) inset" : undefined,
                        }}
                        title={`${r.matchup} • ${r.clock}`}
                      >
                        <div className={cn("h-full w-full", isLarge ? "p-4" : isMedium ? "p-3" : "p-2")}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "truncate font-semibold text-foreground",
                                    isLarge ? "text-base" : "text-sm"
                                  )}
                                >
                                  {r.matchup}
                                </div>

                                {r.isLive ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                                    LIVE
                                  </span>
                                ) : null}
                              </div>

                              {showScoreLine ? (
                                <div className="mt-1 text-xs text-foreground/70 tabular-nums">
                                  <span className="text-foreground/65">{r.awayTeam}</span>{" "}
                                  <span className="font-semibold text-foreground">{r.awayScore}</span>
                                  <span className="text-foreground/55"> — </span>
                                  <span className="font-semibold text-foreground">{r.homeScore}</span>{" "}
                                  <span className="text-foreground/65">{r.homeTeam}</span>
                                </div>
                              ) : null}

                              {showClock ? (
                                r.isLive ? (
                                  <div className="mt-1 inline-flex items-center rounded-md border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-2 py-0.5 text-xs text-foreground/80">
                                    {r.clock}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs text-foreground/65">{r.clock}</div>
                                )
                              ) : null}
                            </div>
                          </div>

                          <div className={cn("mt-3", isLarge ? "text-2xl" : isMedium ? "text-xl" : "text-lg")}>
                            <div className={cn("font-semibold tabular-nums", numClass)}>
                              {showMoveGapNumber ? r.scoreText : "—"}
                            </div>
                          </div>

                          {showMoveNormal ? (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1 tabular-nums">
                                <span className="text-foreground/60">Move</span>{" "}
                                <span className="font-semibold text-foreground">{formatSigned(r.observedMove, 1)}</span>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1 tabular-nums">
                                <span className="text-foreground/60">Normal</span>{" "}
                                <span className="font-semibold text-foreground">{formatSigned(r.expectedMove, 1)}</span>
                              </div>
                            </div>
                          ) : null}

                          {showLiveClose ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1.5">
                                <div className="text-foreground/60">Live</div>
                                <div className="mt-0.5 font-semibold text-foreground tabular-nums">{r.live}</div>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/10 px-2 py-1.5">
                                <div className="text-foreground/60">Close</div>
                                <div className="mt-0.5 font-semibold text-foreground tabular-nums">{r.close}</div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-sm text-foreground/55">Lab preview. All signals require review.</div>

              {after2pm && rows.length !== heatRows.length ? (
                <div className="text-sm text-foreground/55">
                  Showing {heatRows.length} games on the heat map (low-signal games are hidden).
                </div>
              ) : null}

              {!after2pm ? (
                <div className="text-sm text-foreground/55">Spread-based tiles and rankings start at 5pm EST.</div>
              ) : null}

              <div className="text-xs text-foreground/55">Spreads are rounded to the nearest 0.5 for readability.</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}