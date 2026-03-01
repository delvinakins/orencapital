// src/app/page.tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* =========================================================
   Local Tooltip (matches your style)
========================================================= */

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!open) return;
      const el = tipRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;

    box.style.transform = "translateX(-50%)";
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;

      let dx = 0;
      if (r.left < pad) dx = pad - r.left;
      if (r.right > vw - pad) dx = vw - pad - r.right;

      if (dx !== 0) box.style.transform = `translateX(calc(-50% + ${dx}px))`;
    });
  }, [open]);

  return (
    <span className="inline-flex items-center gap-2" ref={tipRef}>
      <span>{label}</span>

      <span className="relative inline-flex">
        <button
          type="button"
          aria-label={`Help: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="
            inline-flex h-5 w-5 items-center justify-center
            rounded-full
            border border-[color:var(--border)]
            bg-[color:var(--card)]
            text-[11px] text-foreground/80
            hover:border-[color:var(--accent)]
            hover:text-[color:var(--accent)]
            active:scale-[0.98]
            transition-colors
          "
        >
          i
        </button>

        {open && (
          <div
            ref={boxRef}
            role="dialog"
            aria-label={`${label} help`}
            onClick={(e) => e.stopPropagation()}
            className="
              absolute left-1/2 top-[140%] z-50
              w-[min(420px,85vw)]
              -translate-x-1/2
              rounded-xl
              border border-[color:var(--border)]
              bg-[color:var(--background)]
              px-3 py-2
              text-xs text-foreground/90
              shadow-2xl shadow-black/40
            "
          >
            {children}
            <div className="mt-2 text-[11px] text-foreground/60">Tap outside to close</div>
          </div>
        )}
      </span>
    </span>
  );
}

/* =========================================================
   Macro Climate Component
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
  const tip = (
    <div className="space-y-2">
      <div>
        <span className="font-semibold">{climate.score} / 100</span> is a <span className="font-semibold">market stress score</span>{" "}
        (0 = calm, 100 = crisis).
      </div>
      <div className="text-foreground/70">
        It answers: <span className="font-semibold">“Is the environment forgiving or punishing for sizing?”</span>
      </div>

      <div className="space-y-1 text-foreground/70">
        <div><span className="font-semibold">0–25:</span> Stable (forgiving)</div>
        <div><span className="font-semibold">26–60:</span> Elevated (size down)</div>
        <div><span className="font-semibold">61–100:</span> High Risk (survival mode)</div>
      </div>

      <div className="text-foreground/70">
        Higher stress typically means higher volatility, choppier trends, rising correlation — and{" "}
        <span className="font-semibold">higher blow-up risk at the same risk %</span>.
      </div>

      <div className="text-foreground/60">
        Live feed (VIX/trend/correlation) coming next. Right now this is a placeholder.
      </div>
    </div>
  );

  return (
    <div className="mt-12 space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-foreground/60">
          <Tooltip label="Macro Risk Climate">{tip}</Tooltip>
        </div>
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

          <MarketClimateBar
            climate={{
              score: 12,
              label: "Stable",
              tone: "accent",
              details: "Volatility low · Trend healthy · Correlation contained",
            }}
          />

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