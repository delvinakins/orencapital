// src/app/labs/nba/nba-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;
type LiveMeta = { stale?: boolean; updatedAt?: string; window?: "active" | "offhours" } | undefined;

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

function MoveGapExplainer() {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Move gap, explained</div>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/70">
            Move gap helps you spot games where the live spread has shifted{" "}
            <span className="font-medium">more than usual</span> for this point in the game. It’s designed for scanning a
            slate—especially late 1Q and mid 2Q/3Q—so you can quickly see where the market is behaving unusually and decide
            what deserves a closer look.
          </p>
        </div>

        <div className="sm:max-w-sm rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-foreground/65">
          This is <span className="font-medium text-foreground/80">not</span> a bet signal. It does not recommend a wager or
          predict outcomes—only highlights market deviations for review.
        </div>
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

  live: string;
  close: string;

  scoreText: string;
  tone: "accent" | "warn" | "neutral";

  absZ: number;

  phase: "pregame" | "live" | "final" | "unknown";
  isLive: boolean;
};

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
 * Flashscore-style logos via ESPN CDN.
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
    <div className="mt-2 inline-flex w-full max-w-[560px] flex-col rounded-lg border border-white/10 bg-black/10 px-3 py-2">
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

function SlateMobileCard({ r }: { r: Row }) {
  const scoreClass = textToneClass(r.tone);

  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4",
        r.isLive && "bg-[color:var(--accent)]/5"
      )}
      style={r.isLive ? { boxShadow: "inset 0 0 0 1px rgba(43,203,119,0.18)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium text-foreground">{r.matchup}</div>
            {r.isLive ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                LIVE
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-foreground/60">{r.clock}</div>
        </div>

        <div className={cn("text-right tabular-nums font-semibold", scoreClass)}>
          <div className="text-xs text-foreground/55">Move gap</div>
          <div className="text-base">{r.scoreText}</div>
        </div>
      </div>

      <ScoreLine awayTeam={r.awayTeam} homeTeam={r.homeTeam} awayScore={r.awayScore} homeScore={r.homeScore} />

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[11px] text-foreground/55">Live (Home)</div>
          <div className="mt-0.5 tabular-nums text-foreground">{r.live}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[11px] text-foreground/55">Close (Home)</div>
          <div className="mt-0.5 tabular-nums text-foreground">{r.close}</div>
        </div>
      </div>
    </div>
  );
}

/** -------- Heat map (treemap) layout (no deps) -------- */
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

  if (row.length === 0 || s <= 0 || rect.w <= 0 || rect.h <= 0) return { placed, remaining: rect };

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
  const remaining = [...items].filter((it) => Number.isFinite(it.value) && it.value > 0).sort((a, b) => b.value - a.value);

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

// Merge distribution ROWS (seed + market), market overrides seed by bucket key.
// This avoids trying to merge opaque index structures.
function mergeDistributionRows(seedRows: any[] | null, marketRows: any[] | null) {
  const out = new Map<string, any>();

  const keyOf = (r: any) => {
    const t =
      r?.time_bucket_id ??
      r?.timeBucketId ??
      r?.time_bucket ??
      `${r?.time_bucket_start ?? r?.timeBucketStart ?? ""}_${r?.time_bucket_end ?? r?.timeBucketEnd ?? ""}`;

    const s =
      r?.spread_bucket_id ??
      r?.spreadBucketId ??
      r?.spread_bucket ??
      `${r?.spread_bucket_start ?? r?.spreadBucketStart ?? ""}_${r?.spread_bucket_end ?? r?.spreadBucketEnd ?? ""}`;

    // include league/sport if present to be safe
    const league = r?.league ?? "";
    const sport = r?.sport ?? "";
    return `${sport}|${league}|${t}|${s}`;
  };

  for (const r of seedRows ?? []) out.set(keyOf(r), r);
  for (const r of marketRows ?? []) out.set(keyOf(r), r); // override

  return Array.from(out.values());
}

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LiveMeta>(undefined);

  const [spreadIndex, setSpreadIndex] = useState<any>(() => makeStubIndex());
  const [indexLabel, setIndexLabel] = useState<"Market+Seed" | "Seed" | "Stub">("Stub");

  const [view, setView] = useState<ViewMode>("slate");
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const after2pm = useMemo(() => isAfter2pmPT(new Date(nowTick)), [nowTick]);
  const headerDate = useMemo(() => formatTodayPT(), [nowTick]);

  // ✅ Build index by MERGING ROWS FIRST, then building once.
  useEffect(() => {
    let cancelled = false;

    async function fetchSeason(season: string) {
      const res = await fetch(`/api/labs/nba/distributions?season=${encodeURIComponent(season)}`, { cache: "no-store" });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.items) && json.items.length > 0) return json.items as any[];
      return null;
    }

    (async () => {
      try {
        const [seedRows, marketRows] = await Promise.all([fetchSeason("seed"), fetchSeason("2025-2026")]);
        const mergedRows = mergeDistributionRows(seedRows, marketRows);

        if (!cancelled && mergedRows.length > 0) {
          const idx = buildDistributionIndex(mergedRows);
          setSpreadIndex(idx);
          setIndexLabel(marketRows && marketRows.length > 0 ? "Market+Seed" : seedRows && seedRows.length > 0 ? "Seed" : "Stub");
          return;
        }
      } catch {
        // keep stub
      }
    })();

    return () => {
      cancelled = true;
    };
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

      const liveRounded = roundToHalf(g?.liveSpreadHome);
      const closeRounded = roundToHalf(g?.closingSpreadHome);

      const liveLabel = after2pm ? formatSpread(liveRounded, 1) : "—";
      const closeLabel = after2pm ? formatSpread(closeRounded, 1) : "—";

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

        live: liveLabel,
        close: closeLabel,

        scoreText: formatSigned(moveGapPts, 1),
        tone,
        absZ,

        phase,
        isLive,
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

      if (b.abs !== a.abs) return b.abs - a.abs;
      return a.matchup.localeCompare(b.matchup);
    });

    return computed;
  }, [games, spreadIndex, after2pm]);

  const heatRows = useMemo(() => rows.filter((r) => r.abs >= 0.6 || r.isLive), [rows]);
  const liveCount = useMemo(() => rows.filter((r) => r.isLive).length, [rows]);

  const treemap = useMemo(() => {
    const W = 1000;
    const H = 720;
    const area = W * H;

    const items: TreeItem[] = heatRows.map((r) => {
      const cappedAbs = clamp(r.abs, 0, 4.0);
      const liveBump = r.isLive ? 0.45 : 0;
      const weight = 1 + (cappedAbs + liveBump) * 3.2;
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
      };
    });
  }, [heatRows]);

  function HeatTile({ r, style }: { r: Row; style: React.CSSProperties }) {
    const away = teamAbbr(r.awayTeam);
    const home = teamAbbr(r.homeTeam);
    const awayLogo = teamLogoUrl(r.awayTeam);
    const homeLogo = teamLogoUrl(r.homeTeam);

    const intensity = clamp((r.absZ || 0) / 2.0, 0, 1);
    const bg = bgFromTone(r.tone, intensity);
    const border = borderFromTone(r.tone);

    const showMeta = r.isLive || r.phase === "pregame";

    return (
      <div
        className={cn(
          "absolute rounded-2xl border overflow-hidden",
          "backdrop-blur-[2px]",
          r.isLive && "ring-1 ring-[color:var(--accent)]/25"
        )}
        style={{
          ...style,
          background: bg,
          borderColor: border,
        }}
        title={`${r.matchup} • ${r.clock} • Move gap ${r.scoreText}`}
      >
        <div className="flex h-full flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {awayLogo ? (
                  <img
                    src={awayLogo}
                    alt={`${r.awayTeam} logo`}
                    className="h-4 w-4 rounded-sm bg-white/5 ring-1 ring-white/10 object-contain"
                    loading="lazy"
                  />
                ) : null}
                <div className="text-sm font-semibold text-foreground truncate">
                  {away} <span className="text-foreground/60">@</span> {home}
                </div>
                {homeLogo ? (
                  <img
                    src={homeLogo}
                    alt={`${r.homeTeam} logo`}
                    className="h-4 w-4 rounded-sm bg-white/5 ring-1 ring-white/10 object-contain"
                    loading="lazy"
                  />
                ) : null}
              </div>

              <div className="mt-1 text-xs text-foreground/60">{r.clock}</div>
            </div>

            <div className={cn("text-right tabular-nums font-semibold", textToneClass(r.tone))}>
              <div className="text-[11px] text-foreground/55">Move gap</div>
              <div className="text-base">{r.scoreText}</div>
            </div>
          </div>

          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-2 text-xs text-foreground/70">
              <div className="truncate">
                {r.isLive ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[11px] text-[color:var(--accent)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                    LIVE
                  </span>
                ) : (
                  <span className="text-foreground/60">{r.phase}</span>
                )}
              </div>

              {showMeta ? (
                <div className="flex items-center gap-3">
                  <div className="tabular-nums">
                    <span className="text-foreground/50">L</span>{" "}
                    <span className="text-foreground">{r.live}</span>
                  </div>
                  <div className="tabular-nums">
                    <span className="text-foreground/50">C</span>{" "}
                    <span className="text-foreground">{r.close}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                  Spreads unlock at 2pm PT
                </div>
              ) : null}

              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground/70">
                Index: {indexLabel}
              </div>
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

        <MoveGapExplainer />

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
            <>
              <div className="md:hidden space-y-3">
                {rows.map((r) => (
                  <SlateMobileCard key={r.key} r={r} />
                ))}

                <div className="pt-2 text-xs text-foreground/55">Lab preview. All signals require review.</div>

                {!after2pm ? (
                  <div className="text-xs text-foreground/55">
                    Spreads unlock 1 hour before games start (spreads stay hidden before then).
                  </div>
                ) : null}

                <div className="text-xs text-foreground/55">Spreads are rounded to the nearest 0.5 for readability.</div>
              </div>

              <div className="hidden md:block overflow-x-auto">
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
                      const scoreClass = textToneClass(r.tone);

                      return (
                        <tr
                          key={r.key}
                          className={cn("border-t border-[color:var(--border)]", r.isLive && "bg-[color:var(--accent)]/5")}
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

                            <ScoreLine
                              awayTeam={r.awayTeam}
                              homeTeam={r.homeTeam}
                              awayScore={r.awayScore}
                              homeScore={r.homeScore}
                            />
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
                  <div className="mt-2 text-sm text-foreground/55">
                    Spreads unlock 1 hour before games start (spreads stay hidden before then).
                  </div>
                ) : null}

                <div className="mt-2 text-xs text-foreground/55">Spreads are rounded to the nearest 0.5 for readability.</div>
              </div>
            </>
          ) : (
            <>
              {treemap.length === 0 ? (
                <div className="text-foreground/70">
                  No heat map tiles yet. This usually means there are no live games (or no games meeting the display threshold).
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-foreground/60">
                    Tiles grow with larger deviations. Color intensity reflects how unusual the move is for that game state.
                  </div>

                  <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                    <div className="relative w-full" style={{ paddingTop: `${(720 / 1000) * 100}%` }}>
                      {treemap.map((t) => (
                        <HeatTile
                          key={t.item.id}
                          r={t.item.row}
                          style={{
                            left: t.left,
                            top: t.top,
                            width: t.width,
                            height: t.height,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-foreground/55">
                    Tip: late 1Q + mid 2Q/3Q are the most actionable scan windows. This is still a watchlist view — not a bet
                    button.
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}