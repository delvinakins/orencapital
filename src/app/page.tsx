// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

/* ── Tooltip ────────────────────────────────────────────── */

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span className="inline-flex items-center gap-2" ref={ref}>
      <span>{label}</span>
      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={`Help: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] text-[11px] text-foreground/80 hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors"
        >
          i
        </button>
        {open && (
          <div
            role="dialog"
            aria-label={`${label} help`}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1/2 top-[140%] z-50 w-[min(420px,85vw)] -translate-x-1/2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs text-foreground/90 shadow-2xl shadow-black/40"
          >
            {children}
            <div className="mt-2 text-[11px] text-foreground/60">Tap outside to close</div>
          </div>
        )}
      </span>
    </span>
  );
}

/* ── Macro Climate Bar ──────────────────────────────────── */

type Climate = {
  score: number;
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  details: string;
  vix?: number | null;
  spx?: number | null;
  spx200?: number | null;
  cap_bps?: number | null;
};

function fmt(x?: number | null, d = 2) {
  return x != null && Number.isFinite(x)
    ? x.toLocaleString(undefined, { maximumFractionDigits: d })
    : "—";
}

function pct(x?: number | null, d = 1) {
  return x != null && Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—";
}

const TONE_BG: Record<Climate["tone"], string> = {
  accent: "bg-[color:var(--accent)]",
  neutral: "bg-yellow-500",
  warn: "bg-amber-500",
};

function ClimateTooltip({ c }: { c: Climate }) {
  const trend =
    c.spx != null && c.spx200 != null && c.spx200 > 0
      ? (c.spx - c.spx200) / c.spx200
      : null;

  const inputs: [string, string][] = [
    ["VIX", fmt(c.vix, 2)],
    ["SPX", fmt(c.spx, 0)],
    ["SPX vs 200d", pct(trend, 2)],
    ["Risk cap", c.cap_bps != null ? `${c.cap_bps} bps` : "—"],
  ];

  return (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">{c.score} / 100</span> — market stress score. 0 =
        calm, 100 = crisis.
      </div>
      <div className="text-foreground/70">
        Answers:{" "}
        <span className="font-semibold">
          &quot;Is the environment forgiving or punishing for sizing right now?&quot;
        </span>
      </div>
      <div className="space-y-1 text-foreground/70">
        <div>
          <span className="font-semibold">0–25:</span> Stable
        </div>
        <div>
          <span className="font-semibold">26–60:</span> Elevated — consider sizing down
        </div>
        <div>
          <span className="font-semibold">61–100:</span> High Risk — survival mode
        </div>
      </div>
      <div className="pt-2 mt-2 border-t border-[color:var(--border)] space-y-1 text-foreground/70">
        <div className="text-[11px] uppercase tracking-wide text-foreground/50 mb-2">
          Live inputs
        </div>
        {inputs.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <span>{k}</span>
            <span className="tabular-nums font-semibold text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CLIMATE_FALLBACK: Climate = {
  score: 0,
  label: "Stable",
  tone: "neutral",
  details: "Market climate unavailable",
  vix: null,
  spx: null,
  spx200: null,
  cap_bps: null,
};

function MarketClimateBar() {
  const [climate, setClimate] = useState<Climate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/market/climate", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (alive && json?.ok) setClimate(json.climate);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const c = climate ?? CLIMATE_FALLBACK;

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-foreground/50">
          <Tooltip label="Macro Risk Climate">
            <ClimateTooltip c={c} />
          </Tooltip>
        </div>
        <div className="text-xs text-foreground/50 tabular-nums">
          {loading ? "…" : `${c.score} / 100`}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{loading ? "Loading…" : c.label}</div>
        <div className="text-xs text-foreground/50">
          {!loading && `VIX ${fmt(c.vix, 2)} · SPX ${fmt(c.spx, 0)}`}
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-[color:var(--border)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${TONE_BG[c.tone]}`}
          style={{ width: `${Math.max(2, Math.min(100, c.score))}%` }}
        />
      </div>

      <div className="text-xs text-foreground/50">
        {loading ? "Fetching live signal…" : c.details}
      </div>
    </div>
  );
}

/* ── Feature Card ───────────────────────────────────────── */

function FeatureCard({
  href,
  label,
  title,
  desc,
}: {
  href: string;
  label: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      onClick={() =>
        trackEvent("home_feature_clicked", {
          href,
          label,
          title,
        })
      }
      className="group flex flex-col gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 hover:border-[color:var(--accent)]/30 transition-colors"
    >
      <div className="text-[10px] tracking-[0.2em] text-foreground/35 uppercase">{label}</div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-sm text-foreground/55 leading-relaxed flex-1">{desc}</div>
      <div className="text-xs text-[color:var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
        Open →
      </div>
    </Link>
  );
}

/* ── Features data ──────────────────────────────────────── */

const FEATURES = [
  {
    href: "/risk",
    label: "Core",
    title: "50% Drawdown Risk",
    desc: "Monte Carlo survivability model. See your probability of hitting -50% equity given your sizing and edge.",
  },
  {
    href: "/risk-engine",
    label: "Core",
    title: "Position Risk",
    desc: "R-based position sizing with multi-leg support. Entry, stop, size — calculated with discipline.",
  },
  {
    href: "/variance",
    label: "Core",
    title: "Variance Simulator",
    desc: "Run your strategy parameters through 300+ simulations. See realistic drawdowns and losing streaks.",
  },
  {
    href: "/risk/kill-switch",
    label: "Protection",
    title: "Account Kill Switch",
    desc: "Advisory risk governor. Automatically cuts your allowed risk when drawdown and conditions deteriorate.",
  },
  {
    href: "/portfolio",
    label: "Pro",
    title: "Portfolio Overview",
    desc: "Discipline across your open book. Exposure heat, drawdown context, and concentration at a glance.",
  },
  {
    href: "/journal",
    label: "Pro",
    title: "Trade Journal",
    desc: "Structured trade logging measured in R. Strategy breakdown, EV tracking, and behavioral patterns.",
  },
  {
    href: "/movers",
    label: "Market",
    title: "S&P 500 Movers",
    desc: "Top 10 movers with intraday sparklines, vol tags, and structural risk signals. Refreshes every 60s.",
  },
  {
    href: "/labs/nba",
    label: "Labs",
    title: "NBA Deviation",
    desc: "Live deviation tracking vs consensus closing line. Spread and total during games.",
  },
] as const;

/* ── Page ────────────────────────────────────────────────── */

export default function Home() {
  useEffect(() => {
    trackEvent("home_view", {
      page: "/",
    });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">
        {/* Hero */}
        <div className="space-y-6 mb-14">
          <div className="text-xs tracking-[0.22em] text-foreground/35">OREN CAPITAL</div>

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.08]">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">
                Capital survival
              </span>
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90 origin-left scale-x-0 animate-[oren_underline_700ms_ease-out_120ms_forwards]"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10"
              />
            </span>{" "}
            is not optional.
          </h1>

          <p className="max-w-xl text-base sm:text-lg leading-relaxed text-foreground/65">
            Risk tools for traders who think about longevity — not just returns. Size
            positions correctly, model your drawdowns before they happen, and know when
            to stop.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/risk"
              onClick={() =>
                trackEvent("home_cta_clicked", {
                  cta: "survivability_engine",
                  href: "/risk",
                  location: "hero",
                })
              }
              className="oc-btn oc-btn-primary"
            >
              Survivability Engine
            </Link>
            <Link
              href="/risk-engine"
              onClick={() =>
                trackEvent("home_cta_clicked", {
                  cta: "position_risk",
                  href: "/risk-engine",
                  location: "hero",
                })
              }
              className="oc-btn oc-btn-secondary"
            >
              Position Risk
            </Link>
          </div>
        </div>

        <MarketClimateBar />

        <div className="my-12 border-t border-[color:var(--border)]" />

        {/* Features */}
        <div className="mb-5">
          <div className="text-xs tracking-[0.22em] text-foreground/35 mb-2">TOOLS</div>
          <div className="text-sm text-foreground/50">Everything in the platform.</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.href} {...f} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <div className="text-base font-medium mb-1">Ready to trade with structure?</div>
            <div className="text-sm text-foreground/50">
              Free tools available. Pro unlocks the full platform.
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/risk"
              onClick={() =>
                trackEvent("home_cta_clicked", {
                  cta: "get_started",
                  href: "/risk",
                  location: "footer",
                })
              }
              className="oc-btn oc-btn-primary"
            >
              Get Started
            </Link>
            <Link
              href="/pricing"
              onClick={() =>
                trackEvent("pricing_cta_clicked", {
                  href: "/pricing",
                  location: "footer",
                })
              }
              className="oc-btn oc-btn-secondary"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes oren_underline { from { transform: scaleX(0) } to { transform: scaleX(1) } }
      `}</style>
    </main>
  );
}