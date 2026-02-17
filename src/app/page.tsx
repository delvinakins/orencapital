import type { CSSProperties } from "react";

export default function Home() {
  // TODO: Replace with the exact hex used for the logo arrow green.
  // Keep it rich, not neon.
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;

  return (
    <main className="min-h-screen bg-background text-foreground" style={accentStyle}>
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Oren Capital • Risk discipline for retail traders
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn{" "}
            <span className="relative inline-block">
              {/* Gradient ink (very visible) */}
              <span
                className={[
                  "relative z-10 inline-block",
                  "bg-[linear-gradient(90deg,color:var(--accent),rgba(231,235,232,0.9),color:var(--accent))]",
                  "bg-[length:200%_100%] bg-clip-text text-transparent",
                  // subtle lift without looking "neon"
                  "drop-shadow-[0_0_14px_rgba(43,203,119,0.25)]",
                ].join(" ")}
              >
                variance
              </span>

              {/* soft wash behind word */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-0 rounded-md bg-[color:var(--accent)] opacity-[0.10] blur-xl"
              />

              {/* thin underline */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-[0.85]"
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
    </main>
  );
}
