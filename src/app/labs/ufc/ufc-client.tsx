"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
type FightItem = {
  fightId: string;
  commenceTimeIso: string | null;
  eventTitle: string | null;
  fighter1: string;
  fighter2: string;
  fighter1AmericanOdds: number | null;
  fighter2AmericanOdds: number | null;
  fighter1MarketProb: number | null;
  fighter2MarketProb: number | null;
  fighter1Elo: number;
  fighter2Elo: number;
  fighter1EloProb: number;
  fighter2EloProb: number;
  fighter1EloFights: number;
  fighter2EloFights: number;
  fighter1HypeTax: number | null;
  fighter2HypeTax: number | null;
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function formatAmericanOdds(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v > 0 ? `+${v}` : String(v);
}

function formatElo(v: number): string {
  return Math.round(v).toString();
}

function formatHypeTax(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const pct = (v * 100).toFixed(1);
  return v > 0 ? `+${pct}pp` : `${pct}pp`;
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d) + " ET";
}

function formatDateGroup(iso: string | null): string {
  if (!iso) return "Unknown Date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown Date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function isoDateKey(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// ─── Hype tax tone ─────────────────────────────────────────────────────────────
type HypeTone = "overpriced" | "underpriced" | "neutral";

function hypeTone(v: number | null): HypeTone {
  if (v == null || !Number.isFinite(v)) return "neutral";
  if (v >= 0.05) return "overpriced";  // market overprices by 5+pp
  if (v <= -0.05) return "underpriced";
  return "neutral";
}

// ─── Portal tooltip ───────────────────────────────────────────────────────────
function InfoTip({ content }: { content: React.ReactNode }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({
    top: 0, left: 0, placement: "top",
  });

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
    const placement: "top" | "bottom" =
      spaceTop >= TIP_H_EST + 12 ? "top" : spaceBottom >= TIP_H_EST + 12 ? "bottom" : "top";
    const rawLeft = r.left + r.width / 2 - TIP_W / 2;
    const left = Math.max(12, Math.min(vw - TIP_W - 12, rawLeft));
    const top =
      placement === "top"
        ? Math.max(12, r.top - 10)
        : Math.min(vh - 12, r.bottom + 10);
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
              style={{
                left: pos.left,
                top: pos.top,
                transform: pos.placement === "top" ? "translateY(-100%)" : "translateY(0)",
              }}
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
function HypeTaxTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Hype tax</div>
      <div>Market-implied probability minus Elo-implied probability, in percentage points.</div>
      <div>Positive = market overprices this fighter relative to Elo history.</div>
      <div>Negative = market underprices this fighter.</div>
      <div className="text-foreground/50">Watchlist only. Not a bet signal.</div>
    </div>
  );
}

function EloTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Elo rating</div>
      <div>Standard Elo rating seeded from historical UFC fight results. Baseline: 1500 for fighters without history.</div>
      <div className="text-foreground/50">Low fight count = high uncertainty.</div>
    </div>
  );
}

function MarketProbTipContent() {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">Market prob</div>
      <div>Consensus implied win probability from US bookmakers (includes vig). Averaged across available lines.</div>
    </div>
  );
}

// ─── Fighter row ──────────────────────────────────────────────────────────────
function FighterRow({
  name,
  americanOdds,
  marketProb,
  eloProb,
  elo,
  eloFights,
  hypeTaxVal,
  isFav,
}: {
  name: string;
  americanOdds: number | null;
  marketProb: number | null;
  eloProb: number;
  elo: number;
  eloFights: number;
  hypeTaxVal: number | null;
  isFav: boolean;
}) {
  const tone = hypeTone(hypeTaxVal);
  const hypeCls =
    tone === "overpriced"
      ? "text-rose-300"
      : tone === "underpriced"
      ? "text-emerald-300"
      : "text-foreground/40";

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      {/* Name + fav indicator */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full flex-none",
            isFav ? "bg-white/60" : "bg-white/20"
          )}
        />
        <span className={cn("font-semibold text-sm truncate", isFav ? "text-foreground" : "text-foreground/70")}>
          {name}
        </span>
        {eloFights === 0 && (
          <span className="text-[10px] text-foreground/30 flex-none">new</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 flex-none text-xs tabular-nums">
        <div className="text-right">
          <div className="text-[10px] text-foreground/35 mb-0.5">Odds</div>
          <div className="font-medium">{formatAmericanOdds(americanOdds)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-foreground/35 mb-0.5">Mkt%</div>
          <div className="font-medium">{formatPct(marketProb)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-foreground/35 mb-0.5">Elo%</div>
          <div className="font-medium">{formatPct(eloProb)}</div>
        </div>
        <div className="text-right min-w-[52px]">
          <div className="text-[10px] text-foreground/35 mb-0.5">Hype tax</div>
          <div className={cn("font-semibold", hypeCls)}>{formatHypeTax(hypeTaxVal)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Fight card ────────────────────────────────────────────────────────────────
function FightCard({ fight }: { fight: FightItem }) {
  const f1Fav = (fight.fighter1MarketProb ?? 0) >= (fight.fighter2MarketProb ?? 0);

  const topHypeTax =
    fight.fighter1HypeTax != null && fight.fighter2HypeTax != null
      ? Math.max(Math.abs(fight.fighter1HypeTax), Math.abs(fight.fighter2HypeTax))
      : null;

  const hasSignal = topHypeTax != null && topHypeTax >= 0.05;

  const leftBarColor = hasSignal
    ? topHypeTax! >= 0.1
      ? "bg-rose-400/80"
      : "bg-rose-400/40"
    : "bg-white/8";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 transition-colors hover:bg-white/[0.02]",
        hasSignal && "bg-rose-500/[0.02]"
      )}
    >
      {/* Left color bar */}
      <div className={cn("w-1 self-stretch rounded-full flex-none", leftBarColor)} />

      {/* Card body */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <div className="text-base font-semibold">
              {fight.fighter1} <span className="text-foreground/30 font-normal">vs</span> {fight.fighter2}
            </div>
            <div className="text-xs text-foreground/35 mt-0.5">
              {formatEventDate(fight.commenceTimeIso)}
            </div>
          </div>
          {hasSignal && (
            <div className="flex items-center gap-1.5 flex-none">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300">
                HYPE GAP
              </span>
              <InfoTip content={<HypeTaxTipContent />} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 my-2" />

        {/* Fighter rows */}
        <FighterRow
          name={fight.fighter1}
          americanOdds={fight.fighter1AmericanOdds}
          marketProb={fight.fighter1MarketProb}
          eloProb={fight.fighter1EloProb}
          elo={fight.fighter1Elo}
          eloFights={fight.fighter1EloFights}
          hypeTaxVal={fight.fighter1HypeTax}
          isFav={f1Fav}
        />
        <div className="h-px bg-white/5" />
        <FighterRow
          name={fight.fighter2}
          americanOdds={fight.fighter2AmericanOdds}
          marketProb={fight.fighter2MarketProb}
          eloProb={fight.fighter2EloProb}
          elo={fight.fighter2Elo}
          eloFights={fight.fighter2EloFights}
          hypeTaxVal={fight.fighter2HypeTax}
          isFav={!f1Fav}
        />

        {/* Elo details row */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { name: fight.fighter1, elo: fight.fighter1Elo, fights: fight.fighter1EloFights },
            { name: fight.fighter2, elo: fight.fighter2Elo, fights: fight.fighter2EloFights },
          ].map(({ name, elo, fights }) => (
            <div key={name} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] text-foreground/40 uppercase tracking-wide truncate">{name.split(" ").pop()}</span>
                <InfoTip content={<EloTipContent />} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="tabular-nums text-lg font-semibold">{formatElo(elo)}</span>
                <span className="text-[10px] text-foreground/30">Elo</span>
                {fights > 0 && (
                  <span className="text-[10px] text-foreground/25 ml-auto">{fights}F</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 text-[10px] text-foreground/25 tracking-wide">
          Watchlist only · Not a bet signal
        </div>
      </div>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ children, variant = "neutral" }: {
  children: React.ReactNode;
  variant?: "neutral" | "live" | "accent";
}) {
  const cls =
    variant === "live"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : variant === "accent"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : "border-white/10 bg-white/5 text-white/60";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide", cls)}>
      {children}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UfcClient() {
  const [fights, setFights] = useState<FightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/labs/ufc/fights", { cache: "no-store" });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        setLoadError("Unable to load fights right now.");
        setLoading(false);
        return;
      }
      const json: any = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.items)) {
        setFights(json.items);
        setUpdatedAt(json.updatedAt ?? null);
        setLoading(false);
      } else {
        setLoadError(json?.error ?? "Live feed is offline right now.");
        setLoading(false);
      }
    } catch {
      setLoadError("Unable to load fights right now.");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const updatedAtLabel = useMemo(() => {
    if (!updatedAt) return null;
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(d) + " ET";
  }, [updatedAt]);

  // Group fights by date
  const grouped = useMemo(() => {
    const groups = new Map<string, FightItem[]>();
    for (const f of fights) {
      const key = isoDateKey(f.commenceTimeIso);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fights]);

  const signalCount = useMemo(
    () =>
      fights.filter((f) => {
        const top =
          f.fighter1HypeTax != null && f.fighter2HypeTax != null
            ? Math.max(Math.abs(f.fighter1HypeTax), Math.abs(f.fighter2HypeTax))
            : null;
        return top != null && top >= 0.05;
      }).length,
    [fights]
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16 space-y-6">

        {/* Header */}
        <header className="space-y-4">
          <div className="text-xs tracking-[0.22em] text-foreground/40">LABS · UFC</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">UFC Hype Tax</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="text-sm text-foreground/55 max-w-xl">
            Market-implied win probability vs Elo-implied probability. Hype gap = market overprices fighter relative to historical results.
          </p>
        </header>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>{fights.length} fights</StatusPill>
          {signalCount > 0 && (
            <StatusPill variant="accent">{signalCount} hype gap{signalCount !== 1 ? "s" : ""}</StatusPill>
          )}
          {updatedAtLabel && (
            <span className="text-xs text-foreground/35">refreshed {updatedAtLabel}</span>
          )}
        </div>

        {/* Legend */}
        {!loading && fights.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-foreground/40 pb-1">
            {[
              { label: "Hype tax", content: <HypeTaxTipContent /> },
              { label: "Elo", content: <EloTipContent /> },
              { label: "Mkt%", content: <MarketProbTipContent /> },
            ].map(({ label, content }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span>{label}</span>
                <InfoTip content={content} />
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400/60" />
              <span>Hype gap ≥ 5pp</span>
            </div>
          </div>
        )}

        {/* Fight cards grouped by date */}
        <section>
          {loading ? (
            <div className="text-sm text-foreground/40 px-1">Loading fights…</div>
          ) : fights.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-foreground/50">
              {loadError ?? "No upcoming fights found. Check back closer to fight week."}
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([dateKey, dateFights]) => (
                <div key={dateKey} className="space-y-3">
                  <div className="text-xs font-medium text-foreground/40 tracking-wide uppercase">
                    {formatDateGroup(dateFights[0]?.commenceTimeIso ?? null)}
                  </div>
                  {dateFights.map((fight) => (
                    <FightCard key={fight.fightId} fight={fight} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
