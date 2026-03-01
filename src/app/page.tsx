// src/app/page.tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

/* =========================================================
   Macro Climate Component (lightweight, no fetch yet)
========================================================= */

type Climate = {
  score: number;
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  details: string;
};

function getToneColor(tone: Climate["tone"]) {
  if (tone === "accent") return "bg-[color:var(--accent)]";
  if (tone === "warn") return "bg-amber-500";
  return "bg-yellow-500";
}

function MarketClimateBar({ climate }: { climate: Climate }) {
  return (
    <div className="mt-12 space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-foreground/60">Macro Risk Climate</div>
        <div className="text-xs text-foreground/60 tabular-nums">{climate.score} / 100</div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="font-semibold tracking-tight">{climate.label}</div>
        <div className="text-xs text-foreground/55">Live signal coming next</div>
      </div>

      <div className="h-2 w-full rounded-full bg-[color:var(--border)] overflow-hidden">
        <div className={`h-full transition-all duration-500 ${getToneColor(climate.tone)}`} style={{ width: `${climate.score}%` }} />
      </div>

      <div className="text-xs text-foreground/60">{climate.details}</div>
    </div>
  );
}

/* =========================================================
   Page
========================================================= */

export default function Home() {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          {/* Intro Section */}
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Oren Capital • Risk discipline across markets
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            <span className="oren-accent relative inline-block align-baseline">
              <span className="relative z-10 text-[color:var(--accent)]">Discipline</span>

              <span
                key={`underline-${pathname}`}
                aria-hidden
                className="oren-underline pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-[0.9]"
              />

              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-[0.10]"
              />
            </span>{" "}
            across markets.
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-foreground/75">
            Institutional risk systems for disciplined market participants: position sizing, bankroll management, drawdown tracking,
            expectancy modeling, and exposure heat — across stocks, options, and sports.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/risk-engine"
              className="oc-home-primary inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-medium text-black active:scale-[0.98]"
            >
              Open the Risk Engine
            </Link>

            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-white/5 active:scale-[0.98]"
            >
              View Pricing
            </Link>
          </div>

          {/* 🔥 NEW: Macro Risk Climate */}
          <MarketClimateBar
            climate={{
              score: 62,
              label: "Elevated",
              tone: "neutral",
              details: "Volatility elevated · Trend mixed · Cross-asset correlation rising",
            }}
          />

          {/* Features */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Position Sizing", desc: "Size decisions with discipline. Risk first, entry second." },
              { title: "Variance Simulator", desc: "See realistic drawdowns and losing streaks before they happen." },
              { title: "Exposure Heat", desc: "Avoid correlated stacking and hidden concentration." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
                <div className="text-base font-medium">{f.title}</div>
                <div className="mt-2 text-sm text-foreground/70">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .oc-home-primary {
          background: #ffffff;
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .oc-home-primary:hover {
          background: #ffffff;
          opacity: 0.92;
        }

        @media (prefers-reduced-motion: no-preference) {
          .oren-underline {
            transform-origin: left;
            transform: scaleX(0);
            animation: oren_underline 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms forwards;
          }
        }

        @keyframes oren_underline {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </main>
  );
}