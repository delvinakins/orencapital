"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";

export default function Home() {
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;

  // This changes whenever you navigate to "/" via client-side routing (e.g., clicking the logo)
  // Using it as a key remounts the underline element and retriggers the animation.
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground" style={accentStyle}>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Oren Capital • Risk discipline for retail traders
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn{" "}
            <span className="oren-accent relative inline-block align-baseline">
              <span className="relative z-10 text-[color:var(--accent)]">variance</span>

              {/* underline (keyed to retrigger on client-side nav back to "/") */}
              <span
                key={`underline-${pathname}`}
                aria-hidden
                className="oren-underline pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-[0.9]"
              />

              {/* tiny, non-blurry glow */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-[0.10]"
              />
            </span>{" "}
            into structured growth.
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-foreground/75">
            Institutional risk tools built for serious retail swing and options traders: position sizing,
            drawdown tracking, expectancy, and portfolio heat — without hype.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/risk-engine"
              className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 text-sm font-medium text-black hover:bg-black/5"
            >
              Open the Risk Engine
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-5 py-3 text-sm font-medium text-foreground/90 hover:bg-white/5"
            >
              View Pricing
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Position Sizing", desc: "Size trades like a pro. Risk first, entry second." },
              { title: "Variance Simulator", desc: "See realistic drawdowns and losing streaks before they happen." },
              { title: "Portfolio Heat", desc: "Avoid correlated stacking and hidden exposure." },
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
