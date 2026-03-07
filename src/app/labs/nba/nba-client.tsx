"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;

type LiveMeta =
  | {
      stale?: boolean;
      updatedAt?: string;
      window?: "active" | "offhours";
      dateKeyPT?: string;
    }
  | undefined;

// ─── Portal tooltip (unchanged logic) ────────────────────────────────────────
function InfoTip({ content }: { content: React.ReactNode }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({ top: 0, left: 0, placement: "top" });

  useEffect(() => setMounted(true), []);
  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  function computePosition() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const TIP_W = 288;
    const TIP_H_EST = 120;
    const spaceTop = r.top;
    const spaceBottom = vh - r.bottom;
    const placement: "top" | "bottom" = spaceTop >= TIP_H_EST + 12 ? "top" : spaceBottom >= TIP_H_EST + 12 ? "bottom" : "top";
    const rawLeft = r.left + r.width / 2 - TIP_W / 2;
    const left = Math.max(12, Math.min(vw - TIP_W - 12, rawLeft));
    const top = placement === "top" ? Math.max(12, r.top - 10) : Math.min(vh - 12, r.bottom + 10);
    setPos({ top, left, placement });
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (tipRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown as any);
    };
  }, [open]);

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-foreground/50 hover:border-white/40 hover:text-foreground/80 transition-colors"
        aria-label="More info"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        onTouchStart={(e) => { e.stopPropagation(); toggle(); }}
      >
        i
      </button>
      {mounted && open
        ? createPortal(
            <div
              ref={tipRef}
              className="fixed z-[9999] w-72 rounded-xl border border-white/15 bg-[#111] p-3 text-xs text-foreground/75 shadow-xl"
              style={{ left: pos.left, top: pos.top, transform: pos.placement === "top" ? "translateY(-100%)" : "translateY(0)" }}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

// ─── Tip content ──────────────────────────────────────────────────────────────
function MoveGapTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Move gap</div>
      <div>Live-only. Flags games where the market has moved more than usual for this moment in the game.</div>
      <div>Best for scanning late 1Q and mid 2Q/3Q.</div>
      <div className="text-foreground/50">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function OrenEdgeTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Oren edge</div>
      <div>Pregame lean versus the consensus closing line. Based on exponential rank-to-rating model.</div>
      <div>Arrow points toward the leaned team. Larger pt value = stronger lean.</div>
      <div className="text-foreground/50">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function ConfluenceTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Confluence</div>
      <div>Live-only. Measures when pregame edge and live market deviation point the same direction.</div>
      <div className="text-foreground/50">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function ConfirmedTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Confirmed</div>
      <div>Stricter filter: late 1Q or mid 2Q/3Q, model move gap only.</div>
      <div>Requires deviation to persist across two refreshes.</div>
      <div className="text-foreground/50">Higher-confidence watchlist alert. Still not a bet signal.</div>
    </div>
  );
}

function CurrentLineTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Current line</div>
      <div>Latest spread right now. Pregame number before tip; live line during games.</div>
    </div>
  );
}

// ─── Stub index ──────────────────────────────────────────────────────────────
function makeStubIndex() {
  const samples = Array.from({ length: 1200 }).map((_, i) => {
    const spread = [-8, -6, -4, -2, 0, 2, 4, 6][i % 8];
    return {
      gameId: `stub-${i}`,
      state: { period: (i % 4) + 1, secondsRemainingInPeriod: (i * 37) % 720, scoreDiff: ((i * 13) % 20) - 10 },
      market: { closingHomeSpread: spread, liveHomeSpread: spread + (((i * 17) % 10) - 5) * 0.2 },
    };
  });
  return buildDistributionIndex(samples);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
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

function safeNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function getLiveScore(g: any): { away: number | null; home: number | null } {
  const away = safeInt(g?.awayScore) ?? safeInt(g?.away_score) ?? safeInt(g?.score?.away) ?? safeInt(g?.away?.score) ?? null;
  const home = safeInt(g?.homeScore) ?? safeInt(g?.home_score) ?? safeInt(g?.score?.home) ?? safeInt(g?.home?.score) ?? null;
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
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(new Date());
}

function dateKeyPTNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function sign(x: number) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function computeConfluenceScore(args: { orenEdgePts: number | null; moveGapPts: number | null; isLive: boolean }) {
  const { orenEdgePts, moveGapPts, isLive } = args;
  if (!isLive) return null;
  if (orenEdgePts == null || !Number.isFinite(orenEdgePts)) return null;
  if (moveGapPts == null || !Number.isFinite(moveGapPts)) return null;
  const so = sign(orenEdgePts);
  const sm = sign(moveGapPts);
  if (so === 0 || sm === 0) return 0;
  if (so !== sm) return 0;
  const orenStrength = clamp(Math.abs(orenEdgePts) / 3, 0, 1);
  const moveStrength = clamp(Math.abs(moveGapPts) / 3, 0, 1);
  return Math.round(orenStrength * moveStrength * 100);
}

function confluenceTone(score: number | null): "neutral" | "low" | "mid" | "high" {
  if (score == null) return "neutral";
  if (score >= 55) return "high";
  if (score >= 25) return "mid";
  if (score >= 10) return "low";
  return "neutral";
}

// ─── Team helpers ─────────────────────────────────────────────────────────────
const NBA_ABBR: Record<string, string> = {
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
  "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
  "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "los angeles clippers": "LAC", "los angeles lakers": "LAL", "memphis grizzlies": "MEM",
  "miami heat": "MIA", "milwaukee bucks": "MIL", "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP", "new york knicks": "NYK", "oklahoma city thunder": "OKC",
  "orlando magic": "ORL", "philadelphia 76ers": "PHI", "phoenix suns": "PHX",
  "portland trail blazers": "POR", "sacramento kings": "SAC", "san antonio spurs": "SAS",
  "toronto raptors": "TOR", "utah jazz": "UTA", "washington wizards": "WAS",
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

function teamDisplayName(name: string): string {
  const k = String(name ?? "").toLowerCase().trim();
  return k.replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ─── Badges & UI components ───────────────────────────────────────────────────
function ConfluenceBadge({ score }: { score: number | null }) {
  const tone = confluenceTone(score);
  const cls =
    tone === "high" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
    tone === "mid"  ? "border-amber-400/30 bg-amber-500/10 text-amber-200" :
    tone === "low"  ? "border-white/10 bg-white/5 text-foreground/70" :
                     "border-white/10 bg-black/20 text-foreground/35";
  const label = score == null ? "—" : score >= 55 ? "HIGH" : score >= 25 ? "WATCH" : score >= 10 ? "LOW" : "—";
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", cls)}>
      <span className="tabular-nums font-semibold">{score == null ? "—" : score}</span>
      <span className="text-[10px] tracking-wide opacity-75">{label}</span>
    </div>
  );
}

function ConfirmedBadge({ on }: { on: boolean }) {
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
      on ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-black/20 text-foreground/35"
    )}>
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", on ? "bg-emerald-400" : "bg-white/20")} />
      <span className="text-[10px] tracking-wide">{on ? "CONFIRMED" : "—"}</span>
    </div>
  );
}

/**
 * Directional lean indicator — replaces the bar.
 * Shows which team the model leans toward + magnitude in pts.
 * Color: emerald ≥3pt, amber 1.5–3pt, muted <1.5pt
 */
function OrenEdgeLean({
  v,
  homeTeam,
  awayTeam,
}: {
  v: number | null;
  homeTeam: string;
  awayTeam: string;
}) {
  if (v == null || !Number.isFinite(v) || v === 0) {
    return <span className="text-sm text-white/30 tabular-nums">—</span>;
  }

  const abs = Math.abs(v);
  const leansHome = v > 0;
  const leanedAbbr = leansHome ? teamAbbr(homeTeam) : teamAbbr(awayTeam);

  const color =
    abs >= 3.0 ? "text-emerald-300" :
    abs >= 1.5 ? "text-amber-300" :
                 "text-white/50";

  const ptsLabel = `${abs.toFixed(1)}pt`;

  return (
    <div className={cn("flex items-center gap-1 font-semibold text-sm tabular-nums", color)}>
      {!leansHome && <span className="opacity-70">←</span>}
      <span>{leanedAbbr}</span>
      {leansHome && <span className="opacity-70">→</span>}
      <span className={cn("text-[11px] font-normal ml-0.5", color, "opacity-60")}>{ptsLabel}</span>
    </div>
  );
}

type ScoreMark = "hit" | "miss" | "push" | "na";

function ScoreMarkBadge({ mark }: { mark: ScoreMark }) {
  const cls =
    mark === "hit"  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
    mark === "miss" ? "border-rose-400/30 bg-rose-500/10 text-rose-200" :
    mark === "push" ? "border-white/10 bg-white/5 text-foreground/70" :
                     "border-white/10 bg-black/20 text-foreground/35";
  const label = mark === "hit" ? "✓" : mark === "miss" ? "✗" : mark === "push" ? "PUSH" : "—";
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", cls)}>
      <span className="font-semibold">{label}</span>
      <span className="text-[10px] tracking-wide opacity-75">SCORE</span>
    </div>
  );
}

// ─── Score line ────────────────────────────────────────────────────────────────
function ScoreLine({ awayTeam, homeTeam, awayScore, homeScore }: {
  awayTeam: string; homeTeam: string; awayScore: number | null; homeScore: number | null;
}) {
  const hasScore = typeof awayScore === "number" && typeof homeScore === "number";
  if (!hasScore) return <div className="mt-2 text-xs text-foreground/35">Score unavailable</div>;

  const awayWin = (awayScore ?? 0) > (homeScore ?? 0);
  const homeWin = (homeScore ?? 0) > (awayScore ?? 0);

  const TeamRow = ({ name, score, isWinner }: { name: string; score: number; isWinner: boolean }) => {
    const abbr = teamAbbr(name);
    const fullName = teamDisplayName(name);
    const logo = teamLogoUrl(name);
    return (
      <div className={cn("flex items-center justify-between gap-3", isWinner ? "text-foreground" : "text-foreground/55")}>
        <div className="flex min-w-0 items-center gap-2.5">
          {logo ? (
            <img src={logo} alt={`${abbr} logo`} className="h-5 w-5 flex-none rounded object-contain" loading="lazy" />
          ) : (
            <div className="h-5 w-5 flex-none rounded bg-white/5" />
          )}
          <span className="font-semibold tracking-wide text-sm">{abbr}</span>
          <span className="hidden sm:inline text-xs text-foreground/35 truncate">{fullName}</span>
        </div>
        <span className={cn("tabular-nums font-bold text-base", isWinner ? "text-foreground" : "text-foreground/55")}>{score}</span>
      </div>
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3.5 py-2.5 space-y-2">
      <TeamRow name={awayTeam} score={awayScore} isWinner={awayWin} />
      <div className="h-px bg-white/8" />
      <TeamRow name={homeTeam} score={homeScore} isWinner={homeWin} />
    </div>
  );
}

// ─── Phase helpers ─────────────────────────────────────────────────────────────
function derivePhaseAndLive(g: any): { phase: "pregame" | "live" | "final" | "unknown"; isLive: boolean } {
  const raw = String(g?.phase ?? "").toLowerCase().trim();
  const period = safeInt(g?.period);
  const isFinal = raw === "final" || raw === "ended" || raw === "complete";
  const isPregame = raw === "pregame" || raw === "pre" || raw === "not_started" || raw === "scheduled";
  const phaseLiveWords = new Set(["live", "inprogress", "in_progress", "in-game", "ingame", "playing"]);
  const looksLive = phaseLiveWords.has(raw) || ((period ?? 0) > 0 && !isFinal);
  const phase: "pregame" | "live" | "final" | "unknown" = isFinal ? "final" : isPregame ? "pregame" : looksLive ? "live" : "unknown";
  return { phase, isLive: phase === "live" && (period ?? 0) > 0 };
}

function inSignalWindow(period: number | null, secondsRemaining: number | null): boolean {
  if (period == null || secondsRemaining == null) return false;
  if (period === 1) return secondsRemaining <= 120;
  if (period === 2) return secondsRemaining <= 540 && secondsRemaining >= 240;
  if (period === 3) return secondsRemaining <= 540 && secondsRemaining >= 240;
  return false;
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────
type GlobalTotals = { hits: number; misses: number; push: number; hitRate: number | null };

function formatPct(p: number | null) {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

function computeAtsMarginHome(finalHome: number, finalAway: number, closingHomeSpread: number) {
  return finalHome - finalAway + closingHomeSpread;
}

function computeOrenAtsScoreMark(args: {
  phase: "pregame" | "live" | "final" | "unknown";
  awayScore: number | null;
  homeScore: number | null;
  closingHomeSpread: number | null;
  orenEdgePts: number | null;
}): ScoreMark {
  const { phase, awayScore, homeScore, closingHomeSpread, orenEdgePts } = args;
  if (phase !== "final") return "na";
  if (awayScore == null || homeScore == null) return "na";
  if (closingHomeSpread == null || !Number.isFinite(closingHomeSpread)) return "na";
  if (orenEdgePts == null || !Number.isFinite(orenEdgePts) || sign(orenEdgePts) === 0) return "na";
  const ats = computeAtsMarginHome(homeScore, awayScore, closingHomeSpread);
  if (!Number.isFinite(ats)) return "na";
  if (ats === 0) return "push";
  return sign(orenEdgePts) > 0 === ats > 0 ? "hit" : "miss";
}

function formatTipoff(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET";
  } catch {
    return iso;
  }
}

// ─── Row type ─────────────────────────────────────────────────────────────────
type Row = {
  key: string; gameId: string;
  awayTeam: string; homeTeam: string;
  awayScore: number | null; homeScore: number | null;
  matchup: string; clock: string; current: string; close: string;
  phase: "pregame" | "live" | "final" | "unknown"; isLive: boolean;
  period: number | null; secondsRemaining: number | null;
  moveGapPts: number | null; moveGapText: string; moveGapMode: "model" | "raw" | "none";
  absZ: number | null;
  orenEdgePts: number | null; orenEdgeText: string;
  confluence: number | null; confirmed: boolean; scoreMark: ScoreMark;
  tipoffIso: string | null;
};


// ─── StatusPill ────────────────────────────────────────────────────────────────
function StatusPill({ children, variant = "neutral" }: {
  children: React.ReactNode;
  variant?: "neutral" | "live" | "accent";
}) {
  const cls =
    variant === "live"   ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
    variant === "accent" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" :
                          "border-white/10 bg-white/5 text-white/60";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide", cls)}>
      {children}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
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

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [globalTotals, setGlobalTotals] = useState<GlobalTotals | null>(null);
  const [globalStatus, setGlobalStatus] = useState<"idle" | "loading" | "ok" | "missing">("idle");

  const readingsRef = useRef<Map<string, Array<{ t: number; moveGapPts: number; absZ: number }>>>(new Map());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);


  const headerDate = useMemo(() => formatTodayPT(), [nowTick]);

  useEffect(() => {
    (async () => {
      try {
        for (const season of ["2025-2026", "seed"]) {
          const res = await fetch(`/api/labs/nba/distributions?season=${season}`, { cache: "no-store" });
          if (res.headers.get("content-type")?.includes("application/json")) {
            const j = await res.json().catch(() => null);
            if (j?.ok && Array.isArray(j.items) && j.items.length > 0) {
              setSpreadIndex(buildDistributionIndex(j.items));
              setIndexSource("remote");
              return;
            }
          }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/labs/nba/oren-score?season=2025-2026", { cache: "no-store" });
        if (!res.headers.get("content-type")?.includes("application/json")) { setOrenStatus("missing"); return; }
        const json: any = await res.json().catch(() => null);
        if (json?.ok && json?.map) {
          setOrenMap(json.map as Record<string, number>);
          if (json?.params) {
            const { A = 10, k = 0.12, S = 1.0 } = json.params;
            if ([A, k, S].every(Number.isFinite)) setOrenParams({ A: Number(A), k: Number(k), S: Number(S) });
          }
          setOrenStatus("ok");
        } else {
          setOrenStatus("missing");
        }
      } catch { setOrenStatus("missing"); }
    })();
  }, []);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/labs/nba/live-games", { cache: "no-store" });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        setGames([]); setMeta(undefined); setLoadError("Unable to load games right now."); setLoading(false); return;
      }
      const json: any = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.items)) {
        setGames(json.items); setMeta(json.meta as LiveMeta); setLoading(false);
      } else {
        setMeta(undefined); setLoadError("Live feed is offline right now."); setLoading(false);
      }
    } catch { setMeta(undefined); setLoadError("Unable to load games right now."); setLoading(false); }
  }

  async function loadGlobalTotals() {
    try {
      setGlobalStatus((s) => (s === "ok" ? "ok" : "loading"));
      const res = await fetch(`/api/labs/nba/scoreboard/global?season=2025-2026&league=nba&sport=basketball&_t=${Date.now()}`, { cache: "no-store" });
      const json: any = res.headers.get("content-type")?.includes("application/json") ? await res.json().catch(() => null) : null;
      if (json?.ok && json?.totals) { setGlobalTotals(json.totals as GlobalTotals); setGlobalStatus("ok"); }
      else setGlobalStatus("missing");
    } catch { setGlobalStatus("missing"); }
  }



  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { loadGlobalTotals(); const t = setInterval(loadGlobalTotals, 3 * 60_000); return () => clearInterval(t); }, []);

  const updatedAtLabel = useMemo(() => formatUpdatedAtPT(meta?.updatedAt), [meta?.updatedAt]);
  const isStale = Boolean(meta?.stale);

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const computed: Row[] = (games as any[]).map((g: any) => {
      const { phase, isLive } = derivePhaseAndLive(g);
      const awayTeam = String(g?.awayTeam ?? "—");
      const homeTeam = String(g?.homeTeam ?? "—");
      const s = getLiveScore(g);
      const period = safeInt(g?.period);
      const secondsRemaining = safeInt(g?.secondsRemaining);

      const clock =
        phase === "final" ? "Final" :
        phase === "pregame" || period == null || period === 0 ? "Pregame" :
        secondsRemaining == null ? `P${period} • —` :
        `P${period} • ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;

      const currentRounded = roundToHalf(g?.liveSpreadHome);
      const closeRounded = roundToHalf(g?.closingSpreadHome);
      const closeNum = typeof closeRounded === "number" ? closeRounded : null;
      const liveNum = safeNum(g?.liveSpreadHome);
      const closeNum2 = safeNum(g?.closingSpreadHome);
      const rawMove = liveNum != null && closeNum2 != null ? liveNum - closeNum2 : null;

      let moveGapPts: number | null = null;
      let moveGapMode: Row["moveGapMode"] = "none";
      let absZ: number | null = null;

      if (isLive) {
        const result: any = computeDeviation(g, { spreadIndex });
        const modelGap = result && Number.isFinite(result.dislocationPts) ? (result.dislocationPts as number) : null;
        absZ = result && Number.isFinite(result.absZ) ? (result.absZ as number) : null;
        if (modelGap != null) { moveGapPts = modelGap; moveGapMode = "model"; }
        else if (rawMove != null) { moveGapPts = rawMove; moveGapMode = "raw"; }
      }

      const orenEdgePts = computeOrenEdgePts({ homeTeam, awayTeam, closingSpreadHome: closeNum, rankMap: orenMap, params: orenParams });
      const confluence = computeConfluenceScore({ orenEdgePts, moveGapPts, isLive });

      let confirmed = false;
      if (isLive && moveGapMode === "model" && moveGapPts != null && absZ != null && absZ >= 1.0 &&
          inSignalWindow(period, secondsRemaining) && orenEdgePts != null && Number.isFinite(orenEdgePts) && rawMove != null) {
        const so = sign(orenEdgePts);
        const sm = sign(moveGapPts);
        const sr = sign(rawMove);
        const aligned = so !== 0 && so === sm && so === sr;
        const stillRoom = Math.abs(rawMove) < Math.abs(orenEdgePts) * 1.2;
        const key = String(g.gameId ?? `${awayTeam}-${homeTeam}`);
        const history = readingsRef.current.get(key) ?? [];
        const prev = history.length > 0 ? history[history.length - 1] : null;
        const persists = !!prev && now - prev.t >= 60_000 && sign(prev.moveGapPts) === sign(moveGapPts) && prev.absZ >= 1.0;
        confirmed = aligned && stillRoom && persists;
      }

      return {
        key: String(g.gameId ?? `${awayTeam}-${homeTeam}`),
        gameId: String(g.gameId ?? `${awayTeam}-${homeTeam}`),
        awayTeam, homeTeam, awayScore: s.away, homeScore: s.home,
        matchup: `${awayTeam} @ ${homeTeam}`, clock,
        current: formatSpread(currentRounded, 1), close: formatSpread(closeRounded, 1),
        phase, isLive, period, secondsRemaining,
        moveGapPts, moveGapText: moveGapPts == null ? "—" : formatSigned(moveGapPts, 1), moveGapMode,
        absZ, orenEdgePts, orenEdgeText: orenEdgePts == null ? "—" : formatSigned(orenEdgePts, 1),
        tipoffIso: (g as any)?.tipoffIso ?? null,
        confluence, confirmed,
        scoreMark: computeOrenAtsScoreMark({ phase, awayScore: s.away, homeScore: s.home, closingHomeSpread: closeNum, orenEdgePts }),
      };
    });

    const phaseRank = (r: Row) => ({ live: 0, pregame: 1, unknown: 2, final: 3 }[r.phase] ?? 2);
    computed.sort((a, b) => {
      const rd = phaseRank(a) - phaseRank(b);
      if (rd !== 0) return rd;
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      const cd = (b.confluence ?? -1) - (a.confluence ?? -1);
      if (cd !== 0) return cd;
      return a.matchup.localeCompare(b.matchup);
    });
    return computed;
  }, [games, spreadIndex, orenMap, orenParams]);



  useEffect(() => {
    const now = Date.now();
    for (const r of rows) {
      if (!r.isLive || r.moveGapMode !== "model" || r.moveGapPts == null || r.absZ == null) continue;
      const arr = readingsRef.current.get(r.key) ?? [];
      arr.push({ t: now, moveGapPts: r.moveGapPts, absZ: r.absZ });
      while (arr.length > 3) arr.shift();
      readingsRef.current.set(r.key, arr);
    }
  }, [rows]);

  const liveCount = useMemo(() => rows.filter((r) => r.isLive).length, [rows]);



  const globalSummary = useMemo(() => {
    if (!globalTotals) return null;
    return { hits: globalTotals.hits, misses: globalTotals.misses, pushes: globalTotals.push, p: globalTotals.hitRate };
  }, [globalTotals]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16 space-y-6">

        {/* Header — matches movers/Kalshi pattern */}
        <header className="space-y-4">
          <div className="text-xs tracking-[0.22em] text-foreground/40">LABS · NBA</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">NBA Deviation Watchlist</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="text-sm text-foreground/55 max-w-xl">
            {headerDate} · Confluence = alignment · Confirmed = alignment + right window + model move + persistence
          </p>
        </header>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-2">
          {liveCount > 0 ? (
            <StatusPill variant="live">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {liveCount} live
            </StatusPill>
          ) : (
            <StatusPill>0 live</StatusPill>
          )}
          <StatusPill>{isStale ? "Snapshot" : "Live feed"}</StatusPill>
          <StatusPill>Index: {indexSource === "remote" ? "Market" : "Stub"}</StatusPill>
          <StatusPill>
            Oren: {orenStatus === "loading" ? "Loading" : orenStatus === "missing" ? "Missing" : "Ready"}
          </StatusPill>
          {updatedAtLabel && (
            <span className="text-xs text-foreground/35">refreshed {updatedAtLabel} PT</span>
          )}
        </div>

        {/* Scoreboard */}
        <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
          <div>
            <div className="text-xs tracking-[0.18em] text-foreground/40 mb-1">SCOREBOARD</div>
            <div className="text-sm font-medium text-foreground">Oren Edge</div>
            <div className="text-xs text-foreground/40 mt-0.5">Finals only · Edge sign vs ATS result · 2025–26 season</div>
          </div>

          <div className="border-t border-white/8 pt-3">
            {globalStatus === "loading" ? (
              <div className="text-xs text-foreground/35">Loading…</div>
            ) : globalStatus === "missing" || !globalSummary ? (
              <div className="text-xs text-foreground/35">Scoreboard unavailable</div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Hits", val: globalSummary.hits, cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" },
                  { label: "Miss", val: globalSummary.misses, cls: "border-rose-400/30 bg-rose-500/10 text-rose-200" },
                  { label: "Push", val: globalSummary.pushes, cls: "border-white/10 bg-white/5 text-white/60" },
                ].map(({ label, val, cls }) => (
                  <span key={label} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", cls)}>
                    <span className="tabular-nums font-semibold">{val}</span>
                    <span className="opacity-60">{label}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
                  <span className="tabular-nums font-semibold">{formatPct(globalSummary.p)}</span>
                  <span className="opacity-60">Hit rate</span>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Games */}
        <section>
          {loading ? (
            <div className="text-sm text-foreground/40 px-1">Loading games…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-1 text-sm text-foreground/50">
              <div>{loadError ?? "Live feed is offline right now."}</div>
              <div className="text-xs text-foreground/30">If you checked after hours, the last snapshot will appear once it exists.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-foreground/40 pb-2">
                {[
                  { label: "Confirmed", content: <ConfirmedTipContent /> },
                  { label: "Confluence", content: <ConfluenceTipContent /> },
                  { label: "Move gap", content: <MoveGapTipContent /> },
                  { label: "Current", content: <CurrentLineTipContent /> },
                  { label: "Oren edge", content: <OrenEdgeTipContent /> },
                ].map(({ label, content }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span>{label}</span>
                    <InfoTip content={content} />
                  </div>
                ))}
              </div>

              {/* Game cards */}
              {rows.map((r: Row) => {
                const cTone = confluenceTone(r.confluence);
                const leftBarColor =
                  r.confirmed ? "bg-emerald-400" :
                  r.isLive    ? "bg-emerald-400/60" :
                  r.phase === "final" ? "bg-white/15" :
                                "bg-white/8";

                return (
                  <div
                    key={r.key}
                    className={cn(
                      "flex gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 transition-colors hover:bg-white/[0.02]",
                      r.confirmed && "bg-emerald-500/[0.03]",
                      cTone === "high" && !r.confirmed && "bg-emerald-500/[0.02]",
                    )}
                  >
                    {/* Left color bar */}
                    <div className={cn("w-1 self-stretch rounded-full flex-none", leftBarColor)} />

                    {/* Card body */}
                    <div className="flex-1 min-w-0">
                      {/* Top row: matchup + badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold">
                              {teamAbbr(r.awayTeam)} @ {teamAbbr(r.homeTeam)}
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              r.phase === "live"  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" :
                              r.phase === "final" ? "border-white/10 bg-white/5 text-white/50" :
                                                   "border-white/10 bg-white/5 text-white/50"
                            )}>
                              {r.isLive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                              {r.phase === "live" ? "LIVE" : r.phase === "final" ? "FINAL" : "PRE"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-foreground/35">
                            {r.awayTeam} @ {r.homeTeam} · {r.phase === "pregame" && r.tipoffIso ? formatTipoff(r.tipoffIso) : r.clock}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 flex-none">
                          <ScoreMarkBadge mark={r.scoreMark} />
                          <div className="flex items-center gap-1.5">
                            <ConfirmedBadge on={r.confirmed} />
                            <InfoTip content={<ConfirmedTipContent />} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ConfluenceBadge score={r.confluence} />
                            <InfoTip content={<ConfluenceTipContent />} />
                          </div>
                        </div>
                      </div>

                      {/* Score line */}
                      <ScoreLine awayTeam={r.awayTeam} homeTeam={r.homeTeam} awayScore={r.awayScore} homeScore={r.homeScore} />

                      {/* Metric boxes */}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {/* Move gap */}
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[10px] text-foreground/40 uppercase tracking-wide">Move gap</span>
                            <InfoTip content={<MoveGapTipContent />} />
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="tabular-nums text-lg font-semibold">{r.moveGapText}</span>
                            {r.isLive && r.moveGapMode !== "none" && (
                              <span className="text-[10px] text-foreground/30">{r.moveGapMode}</span>
                            )}
                          </div>
                        </div>

                        {/* Current */}
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[10px] text-foreground/40 uppercase tracking-wide">Current</span>
                            <InfoTip content={<CurrentLineTipContent />} />
                          </div>
                          <span className="tabular-nums text-lg font-semibold">{r.current}</span>
                        </div>

                        {/* Close */}
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="mb-1.5">
                            <span className="text-[10px] text-foreground/40 uppercase tracking-wide">Close</span>
                          </div>
                          <span className="tabular-nums text-lg font-semibold">{r.close}</span>
                        </div>

                        {/* Oren edge — directional lean */}
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[10px] text-foreground/40 uppercase tracking-wide">Oren edge</span>
                            <InfoTip content={<OrenEdgeTipContent />} />
                          </div>
                          <OrenEdgeLean v={r.orenEdgePts} homeTeam={r.homeTeam} awayTeam={r.awayTeam} />
                        </div>
                      </div>

                      <div className="mt-2 text-[10px] text-foreground/25 tracking-wide">
                        Watchlist only · Not a bet signal
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}