// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// ── Types ────────────────────────────────────────────────

type Feature = {
  tag: "CORE" | "MARKETS" | "LABS";
  name: string;
  path: string;
  desc: string;
};

// ── Data ─────────────────────────────────────────────────

const FEATURES: Feature[] = [
  {
    tag: "CORE",
    name: "Risk Engine",
    path: "/risk",
    desc: "Survivability calculator with position sizing. Know your ruin probability before you size.",
  },
  {
    tag: "CORE",
    name: "Position Risk",
    path: "/position-risk",
    desc: "Per-position risk analysis. See exactly what each trade costs your portfolio if it fails.",
  },
  {
    tag: "CORE",
    name: "Macro Risk Climate",
    path: "/risk",
    desc: "FRED-powered macro indicators. Rates, yield curves, and volatility regimes — contextualized.",
  },
  {
    tag: "CORE",
    name: "Kill Switch",
    path: "/risk/kill-switch",
    desc: "Hard stop controls for trading accounts. Set multiplier limits and walk away.",
  },
  {
    tag: "MARKETS",
    name: "S&P 500 Movers",
    path: "/movers",
    desc: "Live price movers with sparklines, extreme-move highlighting, and 60-second auto-refresh.",
  },
  {
    tag: "LABS",
    name: "NBA Deviation Watchlist",
    path: "/labs/nba",
    desc: "Proprietary power ranking model with exponential decay. Computes implied spreads, tracks confluence signals, grades nightly.",
  },
  {
    tag: "LABS",
    name: "Kalshi Deviation Engine",
    path: "/labs/deviation",
    desc: "Realized vol → N(d2) digital option pricing → compare to Kalshi markets. Find where the crowd is wrong.",
  },
];

const PRINCIPLES = [
  {
    num: "01",
    title: "Risk before return",
    body: "Every tool starts with the same question: how much can you lose? Position sizing, survivability, ruin probability — the math that keeps you in the game.",
  },
  {
    num: "02",
    title: "Quantify the edge",
    body: "Gut feelings don't compound. Oren builds models that produce numbers — deviation scores, implied spreads, confluence signals — so you can measure what you think you see.",
  },
  {
    num: "03",
    title: "Ship and grade",
    body: "Every model gets a scoreboard. NBA Edge tracks every pick ATS. The deviation engine logs every signal. If it doesn't hold up, it gets killed.",
  },
];


type StatusRow = { label: string; value: string; sub: string };

const STATIC_STATUS: StatusRow[] = [
  { label: "Data Latency", value: "Real-time", sub: "market feeds" },
  { label: "Live Tools", value: "7", sub: "across the platform" },
];

const TAG_STYLES: Record<Feature["tag"], string> = {
  CORE:    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  MARKETS: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  LABS:    "bg-purple-500/10 text-purple-400 border border-purple-500/20",
};

// ── Fade-in on scroll ─────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function Home() {
  const [record, setRecord] = useState<{ wins: number; losses: number; total: number } | null>(null);

  useEffect(() => {
    trackEvent("home_view", { page: "/" });
    // Fetch live NBA record
    fetch("/api/nba/record")
      .then((r) => r.json())
      .then((d) => { if (d?.wins != null) setRecord(d); })
      .catch(() => {});
  }, []);

  const recordStr = record ? `${record.wins}–${record.losses}` : "—";
  const gamesStr = record ? `${record.total} games graded` : "loading…";

  const STATUS: StatusRow[] = [
    { label: "NBA Edge Record", value: recordStr, sub: gamesStr },
    ...STATIC_STATUS,
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">

        {/* ── HERO ─────────────────────────────────────── */}
        <section className="py-20 sm:py-28 space-y-6">
          <div className="text-xs tracking-[0.22em] text-foreground/35 uppercase">
            Oren Capital
          </div>

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.08]">
            Risk tools for traders{" "}
            <span className="text-[color:var(--accent)]">
              who want to survive.
            </span>
          </h1>

          <p className="max-w-xl text-base sm:text-lg leading-relaxed text-foreground/60">
            Position sizing, survivability math, macro context, and quantitative
            models — built to keep you in the game long enough for your edge to
            compound.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/risk"
              onClick={() => trackEvent("home_cta_clicked", { cta: "survivability", href: "/risk", location: "hero" })}
              className="oc-btn oc-btn-primary"
            >
              Survivability Engine
            </Link>
            <Link
              href="/position-risk"
              onClick={() => trackEvent("home_cta_clicked", { cta: "position_risk", href: "/position-risk", location: "hero" })}
              className="oc-btn oc-btn-secondary"
            >
              Position Risk
            </Link>
          </div>

          {/* Stats */}
          <div className="flex gap-8 pt-4 border-t border-[color:var(--border)]">
            {[
              { n: "7", label: "Live tools" },
              { n: "3", label: "Data feeds" },
              { n: "1", label: "Builder" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-semibold tabular-nums text-[color:var(--accent)]">
                  {s.n}
                </div>
                <div className="text-xs text-foreground/40 tracking-wide mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-[color:var(--border)]" />

        {/* ── PHILOSOPHY ───────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <FadeIn>
            <div className="text-xs tracking-[0.22em] text-foreground/35 uppercase mb-10">
              Philosophy
            </div>
          </FadeIn>

          <div className="space-y-0">
            {PRINCIPLES.map((p, i) => (
              <FadeIn key={p.num} delay={i * 0.08}>
                <div className="group grid grid-cols-1 sm:grid-cols-[64px_1fr] gap-4 sm:gap-8 py-8 border-b border-[color:var(--border)] last:border-0">
                  <span className="text-2xl font-bold tabular-nums text-[color:var(--accent)]/25 group-hover:text-[color:var(--accent)]/50 transition-colors pt-0.5">
                    {p.num}
                  </span>
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold tracking-tight">{p.title}</h3>
                    <p className="text-sm text-foreground/55 leading-relaxed">{p.body}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        <div className="border-t border-[color:var(--border)]" />

        {/* ── PLATFORM / FEATURES ──────────────────────── */}
        <section className="py-16 sm:py-20">
          <FadeIn>
            <div className="text-xs tracking-[0.22em] text-foreground/35 uppercase mb-2">
              Platform
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-10">
              What&rsquo;s live
            </h2>
          </FadeIn>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[90px_180px_1fr] gap-6 pb-3 border-b border-[color:var(--border)] text-xs tracking-[0.18em] text-foreground/30 uppercase">
            <div>Type</div>
            <div>Tool</div>
            <div>Description</div>
          </div>

          <div className="space-y-0">
            {FEATURES.map((f, i) => (
              <FadeIn key={f.name} delay={i * 0.05}>
                <Link
                  href={f.path}
                  onClick={() => trackEvent("home_feature_clicked", { name: f.name, path: f.path })}
                  className="group grid grid-cols-1 sm:grid-cols-[90px_180px_1fr] gap-2 sm:gap-6 py-4 border-b border-[color:var(--border)] hover:bg-[color:var(--card)] transition-colors rounded-sm -mx-2 px-2"
                >
                  <div className="flex items-start pt-0.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded tracking-wide ${TAG_STYLES[f.tag]}`}>
                      {f.tag}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium group-hover:text-[color:var(--accent)] transition-colors">
                      {f.name}
                    </span>
                    <span className="text-xs text-foreground/35 font-mono">{f.path}</span>
                  </div>
                  <p className="text-sm text-foreground/55 leading-relaxed">{f.desc}</p>
                </Link>
              </FadeIn>
            ))}
          </div>
        </section>

        <div className="border-t border-[color:var(--border)]" />

        {/* ── ABOUT ──────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <FadeIn>
            <div className="text-xs tracking-[0.22em] text-foreground/35 uppercase mb-2">
              About
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-10">
              Built by a trader. For traders.
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
            <FadeIn delay={0.06}>
              <div className="space-y-4 text-sm text-foreground/60 leading-relaxed">
                <p>
                  Oren Capital was built by a real trader. The same instincts that make betting markets
                  interesting — edge, variance, expected value — apply directly to how
                  you should be managing risk in your trading account.
                </p>
                <p>
                  Every model ships with a public scoreboard. The NBA Edge record is
                  live. The deviation engine logs every signal. If it doesn&rsquo;t
                  hold up against real data, it gets killed. No hiding from the numbers.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.14}>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 space-y-0">
                <div className="text-xs tracking-[0.18em] text-foreground/35 uppercase mb-4">
                  Model Scorecard
                </div>
                {STATUS.map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex justify-between items-baseline py-3 ${
                      i < STATUS.length - 1 ? "border-b border-[color:var(--border)]" : ""
                    }`}
                  >
                    <span className="text-sm text-foreground/55">{s.label}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums">{s.value}</span>
                      <span className="block text-[11px] text-foreground/35 font-mono mt-0.5">
                        {s.sub}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── FOOTER CTA ───────────────────────────────── */}
        <FadeIn>
          <div className="mb-16 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div>
              <div className="text-base font-semibold mb-1">
                Capital survival is not optional.
              </div>
              <div className="text-sm text-foreground/50">
                Free tools available. Pro unlocks the full platform.
              </div>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Link
                href="/risk"
                onClick={() => trackEvent("home_cta_clicked", { cta: "get_started", href: "/risk", location: "footer" })}
                className="oc-btn oc-btn-primary"
              >
                Get Started
              </Link>
              <Link
                href="/pricing"
                onClick={() => trackEvent("pricing_cta_clicked", { href: "/pricing", location: "footer" })}
                className="oc-btn oc-btn-secondary"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </FadeIn>

      </div>
    </main>
  );
}