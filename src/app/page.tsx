"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

export default function Home() {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground" style={accentStyle}>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
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
            Institutional risk systems for disciplined market participants: position sizing, bankroll management,
            drawdown tracking, expectancy modeling, and exposure heat — across stocks, options, and sports.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/risk-engine"
              className="oc-home-primary inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-medium text-black active:scale-[0.98]"
            >
              Open the Risk Engine
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-white/5 active:scale-[0.98]"
            >
              View Pricing
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Position Sizing", desc: "Size decisions with discipline. Risk first, entry second." },
              { title: "Variance Simulator", desc: "See realistic drawdowns and losing streaks before they happen." },
              { title: "Exposure Heat", desc: "Avoid correlated stacking and hidden concentration." },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5"
              >
                <div className="text-base font-medium">{f.title}</div>
                <div className="mt-2 text-sm text-foreground/70">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        /* Fix: prevent any global link hover rule from "darkening" this CTA */
        .oc-home-primary {
          background: #ffffff;
          transition: opacity 150ms ease, transform 150ms ease;
        }
        .oc-home-primary:hover {
          background: #ffffff; /* hard lock */
          opacity: 0.92;       /* subtle hover without blackout */
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