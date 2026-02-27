"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;

// ✅ include dateKeyPT in meta type (your live-games route returns it)
type LiveMeta =
  | {
      stale?: boolean;
      updatedAt?: string;
      window?: "active" | "offhours";
      dateKeyPT?: string;
    }
  | undefined;

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

function safeNum(x: any): number | null {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
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

function dateKeyPTNow(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
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
        Live-only. Flags games where the market has moved more than usual for this moment in the game.
      </div>
      <div className="text-foreground/70">
        Best for scanning late 1Q and mid 2Q/3Q—so you can quickly decide what deserves a closer look.
      </div>
      <div className="text-foreground/70">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function OrenEdgeTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Oren edge</div>
      <div className="text-foreground/70">A private pregame lean versus the consensus closing line.</div>
      <div className="text-foreground/70">
        Right (green) suggests the home side looks undervalued vs close. Left (amber) suggests it looks overvalued vs
        close.
      </div>
      <div className="text-foreground/70">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function ConfluenceTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Confluence</div>
      <div className="text-foreground/70">
        Live-only. Measures when your pregame edge and the live market deviation point the same direction.
      </div>
      <div className="text-foreground/70">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function ConfirmedTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Confirmed</div>
      <div className="text-foreground/70">
        A stricter filter: only lights up in late 1Q or mid 2Q/3Q, using the <span className="font-medium">model</span>{" "}
        move gap (not raw).
      </div>
      <div className="text-foreground/70">
        Requires the deviation to <span className="font-medium">persist</span> across two refreshes and still leave some
        “room” versus your pregame edge.
      </div>
      <div className="text-foreground/70">Still not a bet signal—just a higher-confidence watchlist alert.</div>
    </div>
  );
}

function CurrentLineTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Current line</div>
      <div className="text-foreground/70">
        The latest spread right now. Before tip, it’s a pregame number. During games, it’s the live line.
      </div>
    </div>
  );
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

  const base = orenStrength * moveStrength;
  return Math.round(base * 100);
}

function confluenceTone(score: number | null): "neutral" | "low" | "mid" | "high" {
  if (score == null) return "neutral";
  if (score >= 55) return "high";
  if (score >= 25) return "mid";
  if (score >= 10) return "low";
  return "neutral";
}

function ConfluenceBadge({ score }: { score: number | null }) {
  const tone = confluenceTone(score);

  const cls =
    tone === "high"
      ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
      : tone === "mid"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "low"
      ? "border-white/10 bg-white/5 text-foreground/80"
      : "border-white/10 bg-black/20 text-foreground/70";

  const label = score == null ? "—" : score >= 55 ? "HIGH" : score >= 25 ? "WATCH" : score >= 10 ? "LOW" : "—";

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs", cls)}>
      <span className="tabular-nums font-semibold">{score == null ? "—" : score}</span>
      <span className="text-[10px] tracking-wide">{label}</span>
    </div>
  );
}

function ConfirmedBadge({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
        on
          ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
          : "border-white/10 bg-black/20 text-foreground/70"
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", on ? "bg-[color:var(--accent)]" : "bg-white/25")} />
      <span className="text-[10px] tracking-wide">{on ? "CONFIRMED" : "—"}</span>
    </div>
  );
}

function OrenEdgeBar({ v }: { v: number | null }) {
  if (v == null || !Number.isFinite(v)) return <div className="h-2 w-full rounded-full bg-white/10" />;
  const x = clamp(v, -3, 3);
  const pct = ((x + 3) / 6) * 100;
  const leftPct = Math.min(pct, 50);
  const rightPct = Math.max(pct, 50);

  return (
    <div className="relative h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
      {x >= 0 ? (
        <div
          className="absolute inset-y-0 bg-[color:var(--accent)]/65"
          style={{ left: "50%", width: `${rightPct - 50}%` }}
        />
      ) : (
        <div
          className="absolute inset-y-0 bg-amber-400/60"
          style={{ left: `${leftPct}%`, width: `${50 - leftPct}%` }}
        />
      )}
    </div>
  );
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

function derivePhaseAndLive(g: any): { phase: "pregame" | "live" | "final" | "unknown"; isLive: boolean } {
  const raw = String(g?.phase ?? "").toLowerCase().trim();
  const period = safeInt(g?.period);

  const isFinal = raw === "final" || raw === "ended" || raw === "complete";
  const isPregame = raw === "pregame" || raw === "pre" || raw === "not_started" || raw === "scheduled";

  const phaseLiveWords = new Set(["live", "inprogress", "in_progress", "in-game", "ingame", "playing"]);
  const looksLive = phaseLiveWords.has(raw) || ((period ?? 0) > 0 && !isFinal);

  const phase: "pregame" | "live" | "final" | "unknown" = isFinal
    ? "final"
    : isPregame
    ? "pregame"
    : looksLive
    ? "live"
    : raw
    ? "unknown"
    : "unknown";

  const isLive = phase === "live" && (period ?? 0) > 0;

  return { phase, isLive };
}

function inSignalWindow(period: number | null, secondsRemaining: number | null): boolean {
  if (period == null || secondsRemaining == null) return false;
  if (period === 1) return secondsRemaining <= 120;
  if (period === 2) return secondsRemaining <= 540 && secondsRemaining >= 240;
  if (period === 3) return secondsRemaining <= 540 && secondsRemaining >= 240;
  return false;
}

type ScoreMark = "hit" | "miss" | "push" | "na";

type Row = {
  key: string;
  gameId: string;

  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;

  matchup: string;
  clock: string;

  current: string;
  close: string;

  phase: "pregame" | "live" | "final" | "unknown";
  isLive: boolean;

  period: number | null;
  secondsRemaining: number | null;

  moveGapPts: number | null;
  moveGapText: string;
  moveGapMode: "model" | "raw" | "none";
  absZ: number | null;

  orenEdgePts: number | null;
  orenEdgeText: string;

  confluence: number | null;
  confirmed: boolean;

  scoreMark: ScoreMark;
};

type ScoreRecord = { gameId: string; dateKeyPT: string; mark: Exclude<ScoreMark, "na">; ts: number };
type ScoreboardState = { version: 1; records: Record<string, ScoreRecord> };

const SCOREBOARD_KEY = "oren:nba:scoreboard:v1";

// Strategy C: global scoreboard + local fallback.
// We'll throttle sync attempts with this key (per-device).
const SCOREBOARD_SYNC_LAST_KEY = "oren:nba:scoreboard:sync:last:v1";

type GlobalTotals = { hits: number; misses: number; push: number; hitRate: number | null };

function safeReadScoreboard(): ScoreboardState {
  try {
    if (typeof window === "undefined") return { version: 1, records: {} };
    const raw = window.localStorage.getItem(SCOREBOARD_KEY);
    if (!raw) return { version: 1, records: {} };
    const j = JSON.parse(raw);
    if (j?.version !== 1 || typeof j?.records !== "object" || !j.records) return { version: 1, records: {} };
    return { version: 1, records: j.records as Record<string, ScoreRecord> };
  } catch {
    return { version: 1, records: {} };
  }
}

function safeWriteScoreboard(s: ScoreboardState) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function formatPct(p: number | null) {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

function computeAtsMarginHome(finalHome: number, finalAway: number, closingHomeSpread: number) {
  return finalHome - finalAway + closingHomeSpread;
}

function computeOrenAtsScoreMark(args: {
  phase: Row["phase"];
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

  const predictedHome = sign(orenEdgePts) > 0;
  const actualHomeCovered = ats > 0;

  return predictedHome === actualHomeCovered ? "hit" : "miss";
}

function ScoreMarkBadge({ mark }: { mark: ScoreMark }) {
  const cls =
    mark === "hit"
      ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
      : mark === "miss"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : mark === "push"
      ? "border-white/10 bg-white/5 text-foreground/80"
      : "border-white/10 bg-black/20 text-foreground/60";

  const label = mark === "hit" ? "✓" : mark === "miss" ? "×" : mark === "push" ? "PUSH" : "—";

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs", cls)}>
      <span className="tabular-nums font-semibold">{label}</span>
      <span className="text-[10px] tracking-wide">SCORE</span>
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

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [scoreboard, setScoreboard] = useState<ScoreboardState>(() => ({ version: 1, records: {} }));

  // ✅ global scoreboard totals (strategy C)
  const [globalTotals, setGlobalTotals] = useState<GlobalTotals | null>(null);
  const [globalStatus, setGlobalStatus] = useState<"idle" | "loading" | "ok" | "missing">("idle");

  const readingsRef = useRef<Map<string, Array<{ t: number; moveGapPts: number; absZ: number }>>>(new Map());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // ✅ ensure local scoreboard loads on mobile as well
  useEffect(() => {
    setScoreboard(safeReadScoreboard());
  }, []);

  const after2pm = useMemo(() => isAfter2pmPT(new Date(nowTick)), [nowTick]);
  const headerDate = useMemo(() => formatTodayPT(), [nowTick]);

  // distributions: season -> seed -> stub
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

  // oren rankings
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
        setMeta(json.meta as LiveMeta);
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

  // ✅ global totals fetcher
  async function loadGlobalTotals() {
    try {
      setGlobalStatus((s) => (s === "ok" ? "ok" : "loading"));
      const res = await fetch(
        `/api/labs/nba/scoreboard/global?season=2025-2026&league=nba&sport=basketball&_t=${Date.now()}`,
        { cache: "no-store" }
      );
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        setGlobalStatus("missing");
        return;
      }
      const json = await res.json().catch(() => null);
      if (json?.ok && json?.totals) {
        setGlobalTotals(json.totals as GlobalTotals);
        setGlobalStatus("ok");
      } else {
        setGlobalStatus("missing");
      }
    } catch {
      setGlobalStatus("missing");
    }
  }

  // ✅ strategy C: sync endpoint (server-trusted grading + upsert)
  async function syncGlobalScoreboard() {
    try {
      // throttle: once per 6 hours per device
      if (typeof window !== "undefined") {
        const last = Number(window.localStorage.getItem(SCOREBOARD_SYNC_LAST_KEY) || "0");
        if (Number.isFinite(last) && Date.now() - last < 6 * 60 * 60 * 1000) return;
        window.localStorage.setItem(SCOREBOARD_SYNC_LAST_KEY, String(Date.now()));
      }

      await fetch(`/api/labs/nba/scoreboard/sync?season=2025-2026&league=nba&sport=basketball&_t=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
      }).catch(() => null);

      // refresh global totals after sync attempt
      await loadGlobalTotals();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 90 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load global totals on mount + periodically
  useEffect(() => {
    loadGlobalTotals();
    const t = setInterval(loadGlobalTotals, 3 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatedAtLabel = useMemo(() => formatUpdatedAtPT(meta?.updatedAt), [meta?.updatedAt]);
  const isStale = Boolean(meta?.stale);

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();

    const computed: Row[] = games.map((g: any) => {
      const { phase, isLive } = derivePhaseAndLive(g);

      const awayTeam = String(g?.awayTeam ?? "—");
      const homeTeam = String(g?.homeTeam ?? "—");
      const s = getLiveScore(g);

      const period = safeInt(g?.period);
      const secondsRemaining = safeInt(g?.secondsRemaining);

      const clock =
        phase === "final"
          ? "Final"
          : phase === "pregame"
          ? "Pregame"
          : period == null || period === 0
          ? "Pregame"
          : secondsRemaining == null
          ? `P${period} • —`
          : `P${period} • ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;

      const currentRounded = roundToHalf(g?.liveSpreadHome);
      const closeRounded = roundToHalf(g?.closingSpreadHome);

      const currentLabel = after2pm ? formatSpread(currentRounded, 1) : "—";
      const closeLabel = after2pm ? formatSpread(closeRounded, 1) : "—";

      const closeNum = typeof closeRounded === "number" ? closeRounded : null;

      let modelGap: number | null = null;
      let absZ: number | null = null;

      const liveNum = safeNum(g?.liveSpreadHome);
      const closeNum2 = safeNum(g?.closingSpreadHome);
      const rawMove = liveNum != null && closeNum2 != null ? liveNum - closeNum2 : null;

      let moveGapPts: number | null = null;
      let moveGapMode: Row["moveGapMode"] = "none";

      if (isLive) {
        const result = computeDeviation(g, { spreadIndex });
        modelGap = result && Number.isFinite(result.dislocationPts) ? result.dislocationPts : null;
        absZ = result && Number.isFinite(result.absZ) ? result.absZ : null;

        if (modelGap != null) {
          moveGapPts = modelGap;
          moveGapMode = "model";
        } else if (rawMove != null) {
          moveGapPts = rawMove;
          moveGapMode = "raw";
        }
      }

      const orenEdgePts = computeOrenEdgePts({
        homeTeam,
        awayTeam,
        closingSpreadHome: closeNum,
        rankMap: orenMap,
        params: orenParams,
      });

      const confluence = computeConfluenceScore({ orenEdgePts, moveGapPts, isLive });

      let confirmed = false;
      if (
        isLive &&
        moveGapMode === "model" &&
        moveGapPts != null &&
        absZ != null &&
        absZ >= 1.0 &&
        inSignalWindow(period, secondsRemaining) &&
        orenEdgePts != null &&
        Number.isFinite(orenEdgePts) &&
        rawMove != null
      ) {
        const so = sign(orenEdgePts);
        const sm = sign(moveGapPts);
        const sr = sign(rawMove);
        const aligned = so !== 0 && so === sm && so === sr;

        const stillRoom = Math.abs(rawMove) < Math.abs(orenEdgePts) * 1.2;

        const history = readingsRef.current.get(String(g.gameId ?? `${awayTeam}-${homeTeam}`)) ?? [];
        const prev = history.length > 0 ? history[history.length - 1] : null;

        const persists =
          !!prev && now - prev.t >= 60_000 && sign(prev.moveGapPts) === sign(moveGapPts) && prev.absZ >= 1.0;

        confirmed = aligned && stillRoom && persists;
      }

      const scoreMark = computeOrenAtsScoreMark({
        phase,
        awayScore: s.away,
        homeScore: s.home,
        closingHomeSpread: closeNum,
        orenEdgePts,
      });

      return {
        key: String(g.gameId ?? `${awayTeam}-${homeTeam}`),
        gameId: String(g.gameId ?? `${awayTeam}-${homeTeam}`),

        awayTeam,
        homeTeam,
        awayScore: s.away,
        homeScore: s.home,

        matchup: `${awayTeam} @ ${homeTeam}`,
        clock,

        current: currentLabel,
        close: closeLabel,

        phase,
        isLive,

        period,
        secondsRemaining,

        moveGapPts,
        moveGapText: moveGapPts == null ? "—" : formatSigned(moveGapPts, 1),
        moveGapMode,
        absZ,

        orenEdgePts,
        orenEdgeText: orenEdgePts == null ? "—" : formatSigned(orenEdgePts, 1),

        confluence,
        confirmed,

        scoreMark,
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
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      const ac = a.confluence ?? -1;
      const bc = b.confluence ?? -1;
      if (bc !== ac) return bc - ac;
      return a.matchup.localeCompare(b.matchup);
    });

    return computed;
  }, [games, after2pm, spreadIndex, orenMap, orenParams]);

  // persist finals into local scoreboard
  useEffect(() => {
    if (typeof window === "undefined") return;

    const dateKey = meta?.dateKeyPT ? String(meta.dateKeyPT) : dateKeyPTNow();

    setScoreboard((prev) => {
      const next: ScoreboardState = { version: 1, records: { ...(prev.records || {}) } };
      let changed = false;

      for (const r of rows) {
        if (r.phase !== "final") continue;
        if (r.scoreMark === "na") continue;

        if (!next.records[r.gameId]) {
          next.records[r.gameId] = { gameId: r.gameId, dateKeyPT: dateKey, mark: r.scoreMark, ts: Date.now() };
          changed = true;
        }
      }

      if (changed) safeWriteScoreboard(next);
      return next;
    });
  }, [rows, meta]);

  // ✅ after local save changes, attempt global sync (throttled) + refresh totals
  useEffect(() => {
    const recs = Object.values(scoreboard.records || {});
    if (recs.length === 0) return;
    syncGlobalScoreboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreboard]);

  // update persistence cache AFTER render
  useEffect(() => {
    const now = Date.now();
    for (const r of rows) {
      if (!r.isLive) continue;
      if (r.moveGapMode !== "model") continue;
      if (r.moveGapPts == null || r.absZ == null) continue;

      const key = r.key;
      const arr = readingsRef.current.get(key) ?? [];
      arr.push({ t: now, moveGapPts: r.moveGapPts, absZ: r.absZ });
      while (arr.length > 3) arr.shift();
      readingsRef.current.set(key, arr);
    }
  }, [rows]);

  const liveCount = useMemo(() => rows.filter((r) => r.isLive).length, [rows]);

  const orenBadge = useMemo(() => {
    if (orenStatus === "loading") return "Oren: Loading";
    if (orenStatus === "missing") return "Oren: Missing";
    return "Oren: Ready";
  }, [orenStatus]);

  const scoreSummary = useMemo(() => {
    const recs = Object.values(scoreboard.records || {});
    const hits = recs.filter((r) => r.mark === "hit").length;
    const misses = recs.filter((r) => r.mark === "miss").length;
    const pushes = recs.filter((r) => r.mark === "push").length;
    const graded = hits + misses;
    const p = graded > 0 ? hits / graded : null;

    const byDay = new Map<string, { hit: number; miss: number; push: number }>();
    for (const r of recs) {
      const k = r.dateKeyPT || "—";
      const cur = byDay.get(k) ?? { hit: 0, miss: 0, push: 0 };
      if (r.mark === "hit") cur.hit++;
      else if (r.mark === "miss") cur.miss++;
      else cur.push++;
      byDay.set(k, cur);
    }

    const days = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .reverse();

    return { hits, misses, pushes, graded, p, days };
  }, [scoreboard]);

  const globalSummary = useMemo(() => {
    if (!globalTotals) return null;
    return {
      hits: globalTotals.hits,
      misses: globalTotals.misses,
      pushes: globalTotals.push,
      p: globalTotals.hitRate,
    };
  }, [globalTotals]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
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
              Confluence = alignment. <span className="text-foreground/90">Confirmed</span> = alignment + right window +
              model move gap + persistence.
            </p>

            <div className="mt-2 text-xs text-foreground/55">{headerDate} • Watchlist only. Not a bet signal.</div>

            {/* Scoreboard */}
            <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">Oren Edge Scoreboard</div>
                  <div className="mt-1 text-xs text-foreground/55">
                    Finals only. Oren edge sign vs ATS result vs closing spread.
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{scoreSummary.hits}</span>
                    <span className="text-foreground/70">Hits</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{scoreSummary.misses}</span>
                    <span className="text-foreground/70">Misses</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{scoreSummary.pushes}</span>
                    <span className="text-foreground/70">Push</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{formatPct(scoreSummary.p)}</span>
                    <span className="text-foreground/70">Hit rate</span>
                  </Pill>
                </div>
              </div>

              {/* Global totals row */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-foreground/55">
                  Global (all devices){" "}
                  <span className="text-foreground/40">
                    • {globalStatus === "loading" ? "Loading…" : globalStatus === "missing" ? "Unavailable" : "Ready"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{globalSummary ? globalSummary.hits : "—"}</span>
                    <span className="text-foreground/70">Hits</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{globalSummary ? globalSummary.misses : "—"}</span>
                    <span className="text-foreground/70">Misses</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{globalSummary ? globalSummary.pushes : "—"}</span>
                    <span className="text-foreground/70">Push</span>
                  </Pill>
                  <Pill tone="neutral">
                    <span className="tabular-nums font-semibold">{formatPct(globalSummary ? globalSummary.p : null)}</span>
                    <span className="text-foreground/70">Hit rate</span>
                  </Pill>

                  <button
                    type="button"
                    onClick={() => {
                      syncGlobalScoreboard();
                    }}
                    className="rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Sync global
                  </button>
                </div>
              </div>

              {scoreSummary.days.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {scoreSummary.days.map(([day, v]) => {
                    const graded = v.hit + v.miss;
                    const p = graded > 0 ? v.hit / graded : null;
                    return (
                      <div key={day} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                        <div className="text-xs text-foreground/55">{day}</div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <div className="text-sm text-foreground/80">
                            <span className="tabular-nums font-semibold text-foreground">{v.hit}</span>
                            <span className="text-foreground/60">–</span>
                            <span className="tabular-nums font-semibold text-foreground">{v.miss}</span>
                            <span className="text-foreground/60"> (</span>
                            <span className="tabular-nums text-foreground/75">{v.push} push</span>
                            <span className="text-foreground/60">)</span>
                          </div>
                          <div className="tabular-nums text-sm font-semibold text-foreground">{formatPct(p)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-xs text-foreground/55">No graded finals saved yet on this device.</div>
              )}
            </div>
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
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/70">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Confirmed</span>
                  <Tooltip label="Confirmed">
                    <div className="cursor-help">
                      <ConfirmedTip />
                    </div>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Confluence</span>
                  <Tooltip label="Confluence">
                    <div className="cursor-help">
                      <ConfluenceTip />
                    </div>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Move gap</span>
                  <Tooltip label="Move gap">
                    <div className="cursor-help">
                      <MoveGapTip />
                    </div>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Current</span>
                  <Tooltip label="Current line">
                    <div className="cursor-help">
                      <CurrentLineTip />
                    </div>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60">Oren edge</span>
                  <Tooltip label="Oren edge">
                    <div className="cursor-help">
                      <OrenEdgeTip />
                    </div>
                  </Tooltip>
                </div>
              </div>

              <div className="grid gap-4">
                {rows.map((r) => {
                  const cTone = confluenceTone(r.confluence);
                  const ring =
                    r.confirmed
                      ? "ring-1 ring-[color:var(--accent)]/35"
                      : cTone === "high"
                      ? "ring-1 ring-[color:var(--accent)]/25"
                      : cTone === "mid"
                      ? "ring-1 ring-amber-400/20"
                      : "";

                  return (
                    <div
                      key={r.key}
                      className={cn(
                        "rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5",
                        r.isLive && "bg-[color:var(--accent)]/5",
                        ring
                      )}
                      style={r.isLive ? { boxShadow: "inset 0 0 0 1px rgba(43,203,119,0.10)" } : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-lg font-semibold text-foreground">{r.matchup}</div>
                            <Pill tone={r.phase === "live" ? "live" : r.phase === "final" ? "final" : "pregame"}>
                              {r.isLive ? (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                              ) : null}
                              {r.phase === "live" ? "LIVE" : r.phase === "final" ? "FINAL" : "PRE"}
                            </Pill>
                          </div>
                          <div className="mt-1 text-sm text-foreground/70">{r.clock}</div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <ScoreMarkBadge mark={r.scoreMark} />

                          <div className="flex items-center gap-2">
                            <Tooltip label="Confirmed">
                              <div className="cursor-help">
                                <ConfirmedTip />
                              </div>
                            </Tooltip>
                            <ConfirmedBadge on={r.confirmed} />
                          </div>

                          <div className="flex items-center gap-2">
                            <ConfluenceBadge score={r.confluence} />
                            <Tooltip label="Confluence">
                              <div className="cursor-help">
                                <ConfluenceTip />
                              </div>
                            </Tooltip>
                          </div>
                        </div>
                      </div>

                      <ScoreLine
                        awayTeam={r.awayTeam}
                        homeTeam={r.homeTeam}
                        awayScore={r.awayScore}
                        homeScore={r.homeScore}
                      />

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-foreground/55">Move gap</div>
                            <Tooltip label="Move gap">
                              <div className="cursor-help">
                                <MoveGapTip />
                              </div>
                            </Tooltip>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-3">
                            <div className="tabular-nums text-xl font-semibold text-foreground">{r.moveGapText}</div>
                            {r.isLive && r.moveGapMode !== "none" ? (
                              <span className="text-[10px] text-foreground/50">{r.moveGapMode}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <div className="text-xs text-foreground/55">Current (Home)</div>
                          <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.current}</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <div className="text-xs text-foreground/55">Close (Home)</div>
                          <div className="mt-1 tabular-nums text-xl font-semibold text-foreground">{r.close}</div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-foreground/55">Oren edge</div>
                            <Tooltip label="Oren edge">
                              <div className="cursor-help">
                                <OrenEdgeTip />
                              </div>
                            </Tooltip>
                          </div>
                          <div className="mt-2">
                            <OrenEdgeBar v={r.orenEdgePts} />
                          </div>
                          <div className="mt-2 text-xs tabular-nums text-foreground/60">{r.orenEdgeText}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-foreground/55">Watchlist only. Not a bet signal.</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}