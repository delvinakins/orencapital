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
        Helps you spot games where the market has shifted more than usual for this point in the game.
      </div>
      <div className="text-foreground/70">
        It’s built for scanning—especially late 1Q and mid 2Q/3Q—so you can decide what deserves a closer look.
      </div>
      <div className="text-foreground/70">Not a bet signal. No recommendations—just a deviation watchlist.</div>
    </div>
  );
}

function OrenEdgeTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Oren edge</div>
      <div className="text-foreground/70">A private “prior” versus the consensus closing line.</div>
      <div className="text-foreground/70">
        Positive means the home team looks undervalued vs close. Negative means the home team looks overvalued vs close.
      </div>
      <div className="text-foreground/70">Not a bet signal—use as context alongside live market behavior.</div>
    </div>
  );
}

function CurrentLineTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Current line</div>
      <div className="text-foreground/70">
        The latest market spread right now. Before tip, it’s a pregame line. During games, it’s the live line.
      </div>
    </div>
  );
}

type ViewMode = "slate" | "heatmap";

type Row = {
  key: string;

  abs: number;
  moveGapPts: number;

  observedMove: number;
  expectedMove: number;

  awayTeam: string;
  homeTeam: string;

  awayScore: number | null;
  homeScore: number | null;

  matchup: string;
  clock: string;

  current: string;
  close: string;

  scoreText: string;
  tone: "accent" | "warn" | "neutral";
  absZ: number;

  phase: "pregame" | "live" | "final" | "unknown";
  isLive: boolean;

  orenEdgePts: number | null;
  orenEdgeText: string;
};

function toneFromAbsZ(absZ: number): Row["tone"] {
  if (absZ >= 1.5) return "accent";
  if (absZ >= 1.0) return "warn";
  return "neutral";
}

function textToneClass(tone: Row["tone"]) {
  if (tone === "accent") return "text-[color:var(--accent)]";
  if (tone === "warn") return "text-amber-200";
  return "text-foreground/80";
}

function formatClockFromGame(g: any): { clock: string; phase: Row["phase"]; isLive: boolean } {
  const phase = String(g?.phase ?? "unknown") as Row["phase"];
  const isLive = phase === "live";

  if (phase === "final") return { clock: "Final", phase, isLive: false };
  if (phase === "pregame") return { clock: "Pregame", phase, isLive: false };

  const period = safeInt(g?.period);
  const secondsRemaining = safeInt(g?.secondsRemaining);

  if (period == null || period === 0) return { clock: "Pregame", phase, isLive: false };
  if (secondsRemaining == null) return { clock: `P${period} • —`, phase, isLive };

  const mm = Math.floor(secondsRemaining / 60);
  const ss = String(secondsRemaining % 60).padStart(2, "0");
  return { clock: `P${period} • ${mm}:${ss}`, phase, isLive };
}

/**
 * Logos via ESPN CDN.
 */
const NBA_ABBR: Record<string, string> = {
  "atlanta hawks": "ATL",
  "boston celtics": "BOS",
  "brooklyn nets": "BKN",
  "charlotte hornets": "CHA",
  "chicago bulls": "CHI",
  "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL",
  "denver nuggets": "DEN",
  "detroit pistons": "DET",
  "golden state warriors": "GSW",
  "houston rockets": "HOU",
  "indiana pacers": "IND",
  "los angeles clippers": "LAC",
  "los angeles lakers": "LAL",
  "memphis grizzlies": "MEM",
  "miami heat": "MIA",
  "milwaukee bucks": "MIL",
  "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP",
  "new york knicks": "NYK",
  "oklahoma city thunder": "OKC",
  "orlando magic": "ORL",
  "philadelphia 76ers": "PHI",
  "phoenix suns": "PHX",
  "portland trail blazers": "POR",
  "sacramento kings": "SAC",
  "san antonio spurs": "SAS",
  "toronto raptors": "TOR",
  "utah jazz": "UTA",
  "washington wizards": "WAS",
};

function teamAbbr(name: string): string {
  const k = String(name ?? "").toLowerCase().trim();
  return NBA_ABBR[k] ?? name.slice(0, 3).toUpperCase();
}

function teamLogoUrl(name: string): string | null {
  const abbr = teamAbbr(name).toLowerCase();
  if (!abbr || abbr.length < 2) return null;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;
}

function normalizeTeam(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function orenRating(rank: number, A: number, k: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return A * Math.exp(-k * (rank - 1));
}

function computeOrenEdgePts(args: {
  homeTeam: string;
  awayTeam: string;
  closingSpreadHome: number | null;
  rankMap: Record<string, number> | null;
  params: { A: number; k: number; S: number } | null;
}): number | null {
  const { homeTeam, awayTeam, closingSpreadHome, rankMap, params } = args;
  if (!rankMap || !params) return null;
  if (!Number.isFinite(closingSpreadHome as any)) return null;

  const homeRank = rankMap[normalizeTeam(homeTeam)];
  const awayRank = rankMap[normalizeTeam(awayTeam)];
  if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) return null;

  const homeRating = orenRating(homeRank, params.A, params.k);
  const awayRating = orenRating(awayRank, params.A, params.k);

  const impliedSpreadHome = params.S * (homeRating - awayRating);
  return impliedSpreadHome - (closingSpreadHome as number);
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live" | "pregame" | "final";
}) {
  const cls =
    tone === "live"
      ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
      : tone === "final"
      ? "border-white/10 bg-white/5 text-foreground/75"
      : tone === "pregame"
      ? "border-white/10 bg-black/20 text-foreground/70"
      : "border-white/10 bg-black/20 text-foreground/70";

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs", cls)}>
      {children}
    </span>
  );
}

function ScoreLine({
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
}: {
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
}) {
  const hasScore = typeof awayScore === "number" && typeof homeScore === "number";
  if (!hasScore) return <span className="text-foreground/55">Score unavailable</span>;

  const awayWin = (awayScore ?? 0) > (homeScore ?? 0);
  const homeWin = (homeScore ?? 0) > (awayScore ?? 0);

  const rowClass = (isWinner: boolean) =>
    cn("flex items-center justify-between gap-3", isWinner ? "text-foreground" : "text-foreground/70");

  const scoreClass = (isWinner: boolean) =>
    cn("tabular-nums font-semibold", isWinner ? "text-foreground" : "text-foreground/75");

  const logoClass = "h-4 w-4 rounded-sm bg-white/5 ring-1 ring-white/10 object-contain flex-none";

  const TeamLeft = ({ name }: { name: string }) => {
    const abbr = teamAbbr(name);
    const logo = teamLogoUrl(name);
    return (
      <div className="flex min-w-0 items-center gap-2">
        {logo ? <img src={logo} alt={`${name} logo`} className={logoClass} loading="lazy" /> : null}
        <div className="min-w-0 truncate text-sm">
          <span className="font-medium tracking-wide">{abbr}</span>
          <span className="ml-2 hidden sm:inline text-xs text-foreground/50">{name}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2 inline-flex w-full max-w-[560px] flex-col rounded-xl border border-white/10 bg-black/10 px-3 py-2">
      <div className={rowClass(awayWin)}>
        <TeamLeft name={awayTeam} />
        <div className={scoreClass(awayWin)}>{awayScore}</div>
      </div>

      <div className="my-1 h-px w-full bg-white/10" />

      <div className={rowClass(homeWin)}>
        <TeamLeft name={homeTeam} />
        <div className={scoreClass(homeWin)}>{homeScore}</div>
      </div>
    </div>
  );
}

/** -------- Treemap (squarify) layout (no deps) -------- */
type Rect = { x: number; y: number; w: number; h: number };
type TreeItem = { id: string; value: number; row: Row };
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

    return { placed, remaining: { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h } };
  } else {
    const w = s / rect.h;
    let y = rect.y;

    for (const it of row) {
      const h = it.value / w;
      placed.push({ item: it, rect: { x: rect.x, y, w, h } });
      y += h;
    }

    return { placed, remaining: { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h } };
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

function tileIntensity(absZ: number) {
  return clamp(absZ / 2.2, 0, 1);
}

function tileBg(tone: Row["tone"], intensity01: number) {
  const a = clamp(intensity01, 0, 1);
  // Robinhood-ish: subtle, glassy, low-saturation
  if (tone === "accent") return `rgba(43, 203, 119, ${0.08 + 0.20 * a})`;
  if (tone === "warn") return `rgba(245, 158, 11, ${0.06 + 0.18 * a})`;
  return `rgba(255, 255, 255, ${0.02 + 0.06 * a})`;
}

function tileBorder(tone: Row["tone"], intensity01: number) {
  const a = clamp(intensity01, 0, 1);
  if (tone === "accent") return `rgba(43,203,119, ${0.12 + 0.22 * a})`;
  if (tone === "warn") return `rgba(245,158,11, ${0.10 + 0.22 * a})`;
  return `rgba(255,255,255, ${0.08 + 0.12 * a})`;
}

function Tile({
  r,
  onClick,
  compact = false,
}: {
  r: Row;
  onClick: () => void;
  compact?: boolean;
}) {
  const intensity = tileIntensity(r.absZ);
  const bg = tileBg(r.tone, intensity);
  const bd = tileBorder(r.tone, intensity);

  const ore = r.orenEdgePts;
  const oreClass =
    ore == null
      ? "text-foreground/55"
      : ore >= 1.5
      ? "text-[color:var(--accent)]"
      : ore <= -1.5
      ? "text-amber-200"
      : "text-foreground/80";

  const moveClass = textToneClass(r.tone);

  const phaseTone = r.phase === "live" ? "live" : r.phase === "final" ? "final" : "pregame";
  const phaseLabel = r.phase === "live" ? "LIVE" : r.phase === "final" ? "FINAL" : "PRE";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border text-left transition",
        "hover:brightness-[1.02] active:brightness-[0.98]"
      )}
      style={{
        background: bg,
        borderColor: bd,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="absolute -inset-10 rounded-full bg-white/5 blur-2xl" />
      </div>

      <div className={cn("relative p-3", !compact && "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("truncate font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
              {r.matchup}
            </div>
            <div className={cn("mt-1 flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
              <Pill tone={phaseTone}>
                {r.isLive ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" /> : null}
                {phaseLabel}
              </Pill>
              <span className="text-foreground/70">{r.clock}</span>
            </div>
          </div>

          <div className={cn("tabular-nums font-semibold", moveClass, compact ? "text-sm" : "text-base")}>{r.scoreText}</div>
        </div>

        <div className={cn("mt-3 grid grid-cols-3 gap-2", compact && "mt-2")}>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-foreground/55">Current</div>
            <div className={cn("mt-0.5 tabular-nums font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
              {r.current}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-foreground/55">Close</div>
            <div className={cn("mt-0.5 tabular-nums font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
              {r.close}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] text-foreground/55">Oren</div>
            <div className={cn("mt-0.5 tabular-nums font-semibold", oreClass, compact ? "text-sm" : "text-base")}>
              {r.orenEdgeText}
            </div>
          </div>
        </div>

        <div className={cn("mt-2 text-[11px] text-foreground/45", compact && "hidden")}>
          Watchlist only — not a bet signal.
        </div>
      </div>
    </button>
  );
}

function DetailDrawer({
  open,
  onClose,
  r,
}: {
  open: boolean;
  onClose: () => void;
  r: Row | null;
}) {
  if (!open || !r) return null;

  const moveClass = textToneClass(r.tone);
  const ore = r.orenEdgePts;
  const oreClass =
    ore == null
      ? "text-foreground/55"
      : ore >= 1.5
      ? "text-[color:var(--accent)]"
      : ore <= -1.5
      ? "text-amber-200"
      : "text-foreground/80";

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-2xl rounded-t-3xl border border-white/10 bg-[color:var(--card)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-foreground">{r.matchup}</div>
            <div className="mt-1 text-sm text-foreground/70">{r.clock}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground/80 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="text-xs text-foreground/55">Current (Home)</div>
            <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.current}</div>
            <div className="mt-1 text-[11px] text-foreground/45">{r.isLive ? "live line" : "pregame line"}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="text-xs text-foreground/55">Close (Home)</div>
            <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.close}</div>
            <div className="mt-1 text-[11px] text-foreground/45">consensus close</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="text-xs text-foreground/55">Move gap</div>
            <div className={cn("mt-1 tabular-nums text-xl font-semibold", moveClass)}>{r.scoreText}</div>
            <div className="mt-1 text-[11px] text-foreground/45">unusual move vs typical game states</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="text-xs text-foreground/55">Oren edge</div>
            <div className={cn("mt-1 tabular-nums text-xl font-semibold", oreClass)}>{r.orenEdgeText}</div>
            <div className="mt-1 text-[11px] text-foreground/45">private prior vs close</div>
          </div>
        </div>

        <div className="mt-4 text-sm text-foreground/60">
          This is a watchlist. It does not recommend a wager or predict outcomes.
        </div>
      </div>
    </div>
  );
}

function DesktopCard({ r }: { r: Row }) {
  const moveClass = textToneClass(r.tone);
  const ore = r.orenEdgePts;
  const oreClass =
    ore == null
      ? "text-foreground/55"
      : ore >= 1.5
      ? "text-[color:var(--accent)]"
      : ore <= -1.5
      ? "text-amber-200"
      : "text-foreground/80";

  const phaseTone = r.phase === "live" ? "live" : r.phase === "final" ? "final" : "pregame";
  const phaseLabel = r.phase === "live" ? "LIVE" : r.phase === "final" ? "FINAL" : "PRE";

  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5",
        r.isLive && "bg-[color:var(--accent)]/5"
      )}
      style={r.isLive ? { boxShadow: "inset 0 0 0 1px rgba(43,203,119,0.18)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-lg font-semibold text-foreground">{r.matchup}</div>
            <Pill tone={phaseTone}>
              {r.isLive ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" /> : null}
              {phaseLabel}
            </Pill>
          </div>
          <div className="mt-1 text-sm text-foreground/70">{r.clock}</div>
        </div>

        <div className={cn("tabular-nums text-lg font-semibold", moveClass)}>{r.scoreText}</div>
      </div>

      <ScoreLine awayTeam={r.awayTeam} homeTeam={r.homeTeam} awayScore={r.awayScore} homeScore={r.homeScore} />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="text-xs text-foreground/55">Current (Home)</div>
          <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.current}</div>
          <div className="mt-1 text-[11px] text-foreground/45">{r.isLive ? "live line" : "pregame line"}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="text-xs text-foreground/55">Close (Home)</div>
          <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.close}</div>
          <div className="mt-1 text-[11px] text-foreground/45">consensus close</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="text-xs text-foreground/55">Oren edge</div>
          <div className={cn("mt-1 tabular-nums text-xl font-semibold", oreClass)}>{r.orenEdgeText}</div>
          <div className="mt-1 text-[11px] text-foreground/45">private prior vs close</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-foreground/55">Lab preview. Review required. Not a bet signal.</div>
    </div>
  );
}

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LiveMeta>(undefined);

  const [spreadIndex, setSpreadIndex] = useState<any>(() => makeStubIndex());
  const [indexSource, setIndexSource] = useState<"stub" | "remote">("stub");

  const [orenMap, setOrenMap] = useState<Record<string, number> | null>(null);
  const [orenParams, setOrenParams] = useState<{ A: number; k: number; S: number } | null>(null);
  const [orenStatus, setOrenStatus] = useState<"loading" | "ok" | "missing">("loading");

  const [view, setView] = useState<ViewMode>("slate");
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // display gate only
  const after2pm = useMemo(() => isAfter2pmPT(new Date(nowTick)), [nowTick]);
  const headerDate = useMemo(() => formatTodayPT(), [nowTick]);

  // Load distributions: season -> seed -> stub
  useEffect(() => {
    (async () => {
      try {
        const seasonRes = await fetch("/api/labs/nba/distributions?season=2025-2026", { cache: "no-store" });
        const ct1 = seasonRes.headers.get("content-type") || "";
        if (ct1.includes("application/json")) {
          const j1 = await seasonRes.json().catch(() => null);
          if (j1?.ok && Array.isArray(j1.items) && j1.items.length > 0) {
            setSpreadIndex(buildDistributionIndex(j1.items));
            setIndexSource("remote");
            return;
          }
        }

        const seedRes = await fetch("/api/labs/nba/distributions?season=seed", { cache: "no-store" });
        const ct2 = seedRes.headers.get("content-type") || "";
        if (ct2.includes("application/json")) {
          const j2 = await seedRes.json().catch(() => null);
          if (j2?.ok && Array.isArray(j2.items) && j2.items.length > 0) {
            setSpreadIndex(buildDistributionIndex(j2.items));
            setIndexSource("remote");
            return;
          }
        }
      } catch {
        // keep stub
      }
    })();
  }, []);

  // Load Oren rankings (params still come from endpoint)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/labs/nba/oren-score?season=2025-2026", { cache: "no-store" });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          setOrenStatus("missing");
          return;
        }
        const json = await res.json().catch(() => null);
        if (json?.ok && json?.map && typeof json.map === "object") {
          setOrenMap(json.map);
          if (json?.params && typeof json.params === "object") {
            const A = Number(json.params.A ?? 10);
            const k = Number(json.params.k ?? 0.12);
            const S = Number(json.params.S ?? 1.0);
            if (Number.isFinite(A) && Number.isFinite(k) && Number.isFinite(S)) setOrenParams({ A, k, S });
          }
          setOrenStatus("ok");
        } else {
          setOrenStatus("missing");
        }
      } catch {
        setOrenStatus("missing");
      }
    })();
  }, []);

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
      const { clock, phase, isLive } = formatClockFromGame(g);

      const result = computeDeviation(g, { spreadIndex });

      const abs = result && Number.isFinite(result.absDislocationPts) ? result.absDislocationPts : 0;
      const moveGapPts = result && Number.isFinite(result.dislocationPts) ? result.dislocationPts : 0;

      const observedMove = result && Number.isFinite(result.observedMove) ? result.observedMove : 0;
      const expectedMove = result && Number.isFinite(result.expectedMove) ? result.expectedMove : 0;

      const absZ = result && Number.isFinite(result.absZ) ? result.absZ : 0;
      const tone = toneFromAbsZ(absZ);

      const awayTeam = String(g?.awayTeam ?? "—");
      const homeTeam = String(g?.homeTeam ?? "—");

      const s = getLiveScore(g);

      const currentRounded = roundToHalf(g?.liveSpreadHome);
      const closeRounded = roundToHalf(g?.closingSpreadHome);

      const currentLabel = after2pm ? formatSpread(currentRounded, 1) : "—";
      const closeLabel = after2pm ? formatSpread(closeRounded, 1) : "—";

      const closeNum = typeof closeRounded === "number" ? closeRounded : null;

      const ore = computeOrenEdgePts({
        homeTeam,
        awayTeam,
        closingSpreadHome: closeNum,
        rankMap: orenMap,
        params: orenParams,
      });

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

        current: currentLabel,
        close: closeLabel,

        scoreText: formatSigned(moveGapPts, 1),
        tone,
        absZ,

        phase,
        isLive,

        orenEdgePts: ore,
        orenEdgeText: ore == null ? "—" : formatSigned(ore, 1),
      };
    });

    const phaseRank = (r: Row) => {
      if (r.phase === "live") return 0;
      if (r.phase === "pregame") return 1;
      if (r.phase === "unknown") return 2;
      if (r.phase === "final") return 3;
      return 2;
    };

    computed.sort((a, b) => {
      const ra = phaseRank(a);
      const rb = phaseRank(b);
      if (ra !== rb) return ra - rb;

      // prioritize high absZ (strongest anomalies)
      if (Math.abs(b.absZ) !== Math.abs(a.absZ)) return Math.abs(b.absZ) - Math.abs(a.absZ);

      // then biggest abs dislocation
      if (b.abs !== a.abs) return b.abs - a.abs;

      return a.matchup.localeCompare(b.matchup);
    });

    return computed;
  }, [games, spreadIndex, after2pm, orenMap, orenParams]);

  const liveCount = useMemo(() => rows.filter((r) => r.isLive).length, [rows]);

  const orenBadge = useMemo(() => {
    if (orenStatus === "loading") return "Oren: Loading";
    if (orenStatus === "missing") return "Oren: Missing";
    return "Oren: Ready";
  }, [orenStatus]);

  const selectedRow = useMemo(() => rows.find((r) => r.key === selectedKey) ?? null, [rows, selectedKey]);

  // Heat map rows: always include live, plus meaningful absZ
  const heatRows = useMemo(() => rows.filter((r) => r.isLive || Math.abs(r.absZ) >= 0.75), [rows]);

  // Desktop treemap placement
  const treemap = useMemo(() => {
    const W = 1100;
    const H = 640;
    const area = W * H;

    const items = heatRows.map<TreeItem>((r) => {
      const z = clamp(Math.abs(r.absZ), 0, 3.0);
      const liveBump = r.isLive ? 0.7 : 0;
      // Weight emphasizes outliers; keep everyone visible
      const weight = 1 + (z + liveBump) * 5.0;
      return { id: r.key, value: weight, row: r };
    });

    const total = items.reduce((a, b) => a + b.value, 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    const scaled = items.map((it) => ({ ...it, value: (it.value / total) * area }));
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
                Labs • NBA
              </div>

              <Pill tone="neutral">{isStale ? "Snapshot" : "Live feed"}</Pill>

              {updatedAtLabel ? <div className="text-xs text-foreground/55">Updated {updatedAtLabel} PT</div> : null}

              {liveCount > 0 ? (
                <Pill tone="live">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                  {liveCount} live
                </Pill>
              ) : (
                <Pill tone="pregame">0 live</Pill>
              )}

              {!after2pm ? <Pill tone="pregame">Spreads unlock at 2pm PT</Pill> : null}

              <Pill tone="neutral">Index: {indexSource === "remote" ? "Market" : "Stub"}</Pill>
              <Pill tone="neutral">{orenBadge}</Pill>
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">NBA Deviation Watchlist</h1>

            <p className="mt-4 max-w-3xl text-lg text-foreground/75">
              Scan games where the market is moving unusually for similar game states. Current line is shown pregame and live.
            </p>
          </div>

          <div className="inline-flex w-full sm:w-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setView("slate")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-xl transition",
                view === "slate" ? "bg-white text-slate-950" : "text-foreground/80 hover:bg-white/5"
              )}
            >
              Slate
            </button>
            <button
              type="button"
              onClick={() => setView("heatmap")}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2 text-sm rounded-xl transition",
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
            <div className="space-y-5">
              {/* Mobile: card list */}
              <div className="grid gap-4 sm:hidden">
                {rows.map((r) => (
                  <div key={r.key}>
                    {/* reuse heatmap tile style for consistency? keep mobile card? */}
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-base font-semibold text-foreground">{r.matchup}</div>
                            <Pill tone={r.phase === "live" ? "live" : r.phase === "final" ? "final" : "pregame"}>
                              {r.isLive ? (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                              ) : null}
                              {r.phase === "live" ? "LIVE" : r.phase === "final" ? "FINAL" : "PRE"}
                            </Pill>
                          </div>
                          <div className="mt-1 text-sm text-foreground/70">{r.clock}</div>
                        </div>
                        <div className={cn("tabular-nums text-sm font-semibold", textToneClass(r.tone))}>{r.scoreText}</div>
                      </div>

                      <ScoreLine awayTeam={r.awayTeam} homeTeam={r.homeTeam} awayScore={r.awayScore} homeScore={r.homeScore} />

                      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                          <div className="text-xs text-foreground/55">Current</div>
                          <div className="mt-1 tabular-nums font-semibold text-foreground">{r.current}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                          <div className="text-xs text-foreground/55">Close</div>
                          <div className="mt-1 tabular-nums font-semibold text-foreground">{r.close}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                          <div className="text-xs text-foreground/55">Oren</div>
                          <div className={cn("mt-1 tabular-nums font-semibold", r.orenEdgePts == null ? "text-foreground/55" : r.orenEdgePts >= 1.5 ? "text-[color:var(--accent)]" : r.orenEdgePts <= -1.5 ? "text-amber-200" : "text-foreground/80")}>
                            {r.orenEdgeText}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-foreground/55">Lab preview. Review required. Not a bet signal.</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: cards (no horizontal scroll) */}
              <div className="hidden sm:grid gap-4">
                {rows.map((r) => (
                  <DesktopCard key={r.key} r={r} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm text-foreground/70">Tiles are sized by watchlist priority (stronger anomalies = larger tiles).</div>
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <Tooltip label="Move gap">
                    <MoveGapTip />
                  </Tooltip>
                  <span className="text-foreground/60">Move gap</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <Tooltip label="Current line">
                    <CurrentLineTip />
                  </Tooltip>
                  <span className="text-foreground/60">Current</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground/70">
                  <Tooltip label="Oren edge">
                    <OrenEdgeTip />
                  </Tooltip>
                  <span className="text-foreground/60">Oren edge</span>
                </div>
              </div>

              {heatRows.length === 0 ? (
                <div className="text-foreground/70">No notable deviations yet. Tiles appear once games are live or moves become unusual.</div>
              ) : (
                <>
                  {/* Mobile heat map: clean grid */}
                  <div className="grid grid-cols-2 gap-3 sm:hidden">
                    {heatRows.slice(0, 24).map((r) => (
                      <Tile key={r.key} r={r} compact onClick={() => setSelectedKey(r.key)} />
                    ))}
                  </div>

                  {/* Desktop heat map: treemap */}
                  <div className="relative hidden sm:block h-[720px] rounded-2xl border border-white/10 bg-black/10 overflow-hidden">
                    {treemap.map((p) => {
                      const r = p.item.row;
                      // hide micro tiles by switching to compact content automatically
                      const compact = (p.widthPct < 12 || p.heightPct < 12) || (p.widthPct < 18 && p.heightPct < 18);

                      return (
                        <div
                          key={p.item.id}
                          className="absolute"
                          style={{
                            left: p.left,
                            top: p.top,
                            width: p.width,
                            height: p.height,
                          }}
                        >
                          <div className="h-full">
                            <Tile r={r} compact={compact} onClick={() => setSelectedKey(r.key)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-foreground/55">
                    Watchlist only. Not a bet signal. Tap a tile to see details.
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <DetailDrawer open={Boolean(selectedKey)} onClose={() => setSelectedKey(null)} r={selectedRow} />
    </main>
  );
}