// src/app/labs/nba/nba-client.tsx
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

function fmtNum(x: any, digits = 2) {
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

function UnusualMoveTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Unusual move</div>
      <div className="text-foreground/70">
        A calm indicator of how “out of pattern” the live game looks compared to expectation.
      </div>
      <div className="text-foreground/70">
        Higher values are more unusual. It’s a watchlist signal — not a bet button.
      </div>
    </div>
  );
}

type ViewMode = "slate" | "heatmap";

type Row = {
  key: string;
  abs: number;
  score: number;

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

function toneFromAbs(abs: number): Row["tone"] {
  if (abs >= 1.5) return "accent";
  if (abs >= 1.0) return "warn";
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

  const [view, setView] = useState<ViewMode>("slate");

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

      const spreadScore = Number.isFinite(result.zSpread) ? result.zSpread : 0;
      const totalScore = Number.isFinite(result.zTotal) ? result.zTotal : 0;

      const score = Math.abs(spreadScore) >= Math.abs(totalScore) ? spreadScore : totalScore;
      const abs = Math.abs(score);

      const tone = toneFromAbs(abs);

      const mm = Math.floor((Number(g.secondsRemaining) || 0) / 60);
      const ss = String((Number(g.secondsRemaining) || 0) % 60).padStart(2, "0");

      const awayTeam = String(g?.awayTeam ?? "—");
      const homeTeam = String(g?.homeTeam ?? "—");

      const s = getLiveScore(g);

      return {
        key: String(g.gameId ?? `${awayTeam}-${homeTeam}`),
        abs,
        score,

        awayTeam,
        homeTeam,
        awayScore: s.away,
        homeScore: s.home,

        matchup: `${awayTeam} @ ${homeTeam}`,
        clock: `P${g.period ?? "—"} • ${mm}:${ss}`,

        live: formatSpread(g.liveSpreadHome, 1),
        close: formatSpread(g.closingSpreadHome, 1),

        scoreText: fmtNum(score, 2),
        tone,
      };
    });

    computed.sort((a, b) => b.abs - a.abs);
    return computed;
  }, [games]);

  // Keep heat map focused: hide low-signal games for readability
  const heatRows = useMemo(() => rows.filter((r) => r.abs >= 0.35), [rows]);

  const treemap = useMemo(() => {
    const W = 1000;
    const H = 720;
    const area = W * H;

    const items: TreeItem[] = heatRows.map((r) => {
      const capped = clamp(r.abs, 0, 2.2);
      const weight = 1 + capped * 3.0; // grows gently with “unusual move”
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
  }, [heatRows]);

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
            <div className="text-foreground/70">{loadError ?? "No games available."}</div>
          ) : view === "slate" ? (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">Matchup</th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                    <th className="px-4 py-3 font-medium">Live Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">Closing Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Unusual move">
                        <UnusualMoveTip />
                      </Tooltip>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => {
                    const hasScore = typeof r.awayScore === "number" && typeof r.homeScore === "number";
                    const scoreClass = textToneClass(r.tone);

                    return (
                      <tr key={r.key} className="border-t border-[color:var(--border)]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{r.matchup}</div>
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

                        <td className="px-4 py-3 text-foreground/80">{r.clock}</td>
                        <td className="px-4 py-3 text-foreground/80">{r.live}</td>
                        <td className="px-4 py-3 text-foreground/80">{r.close}</td>
                        <td className={cn("px-4 py-3 font-medium", scoreClass)}>{r.scoreText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 text-sm text-foreground/55">Lab preview. All signals require review.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
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

                <div className="text-sm text-foreground/60">
                  <Tooltip label="Unusual move">
                    <UnusualMoveTip />
                  </Tooltip>
                </div>
              </div>

              <div className="relative w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-black/20">
                <div className="relative h-[720px]">
                  {treemap.map((t) => {
                    const r = t.item.row;

                    const isLarge = t.widthPct >= 24 && t.heightPct >= 24;
                    const isMedium = t.widthPct >= 16 && t.heightPct >= 16;

                    const intensity01 = clamp(r.abs / 2.0, 0, 1);

                    const bg = bgFromTone(r.tone, intensity01);
                    const border = borderFromTone(r.tone);

                    const numClass = textToneClass(r.tone);

                    const showClock = isMedium;
                    const showLiveClose = isLarge;

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
                          border: `1px solid ${border}`,
                        }}
                        title={`${r.matchup} • ${r.clock}`}
                      >
                        <div className={cn("h-full w-full", isLarge ? "p-4" : isMedium ? "p-3" : "p-2")}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div
                                className={cn(
                                  "truncate font-semibold text-foreground",
                                  isLarge ? "text-base" : "text-sm"
                                )}
                              >
                                {r.matchup}
                              </div>
                              {showClock ? <div className="mt-1 text-xs text-foreground/65">{r.clock}</div> : null}
                            </div>
                          </div>

                          <div className={cn("mt-3", isLarge ? "text-2xl" : isMedium ? "text-xl" : "text-lg")}>
                            <div className={cn("font-semibold tabular-nums", numClass)}>{r.scoreText}</div>
                          </div>

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

              {rows.length !== heatRows.length ? (
                <div className="text-sm text-foreground/55">
                  Showing {heatRows.length} games on the heat map (low-signal games are hidden).
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}