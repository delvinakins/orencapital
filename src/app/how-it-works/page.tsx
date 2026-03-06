// src/app/how-it-works/page.tsx
import Link from "next/link";

const steps = [
  {
    number: "01",
    href: "/risk",
    cta: "Run survivability analysis",
    title: "Define your risk structure",
    description:
      "Before any trade, you need to know how much you can lose before you blow up. The Survivability engine runs Monte Carlo simulations across thousands of paths to show you expected drawdowns, losing streak probabilities, and long-run ruin risk at your current sizing.",
    bullets: [
      "Monte Carlo distribution modeling",
      "Expected drawdown thresholds",
      "Psychological ruin probability",
      "Expectancy analysis (R-based)",
    ],
  },
  {
    number: "02",
    href: "/risk-engine",
    cta: "Build a structured position",
    title: "Enforce position discipline",
    description:
      "The Position Risk engine calculates exact dollar exposure before you enter a trade. You see immediately whether your stop placement and size are aligned with your risk structure — or whether you're overexposed.",
    bullets: [
      "Risk per trade (% or fixed dollar)",
      "Portfolio-level exposure view",
      "Automatic risk caps under stress",
      "Capital protection mode",
    ],
  },
  {
    number: "03",
    href: "/risk/kill-switch",
    cta: "Set your kill switch",
    title: "Protect capital automatically",
    description:
      "The Account Kill Switch monitors your drawdown, survivability score, and macro regime in real time. When conditions deteriorate, it automatically scales down your allowed risk per trade — removing the temptation to size the same way in bad conditions.",
    bullets: [
      "Drawdown-based risk reduction",
      "Macro regime multiplier",
      "Survivability score integration",
      "Full kill switch at critical thresholds",
    ],
  },
  {
    number: "04",
    href: "/journal",
    cta: "Log a structured trade",
    title: "Track behavior, not just trades",
    description:
      "The Journal connects structure to execution. Every trade is logged with its risk parameters, so you can see whether you're actually following your plan — or whether you're drifting under pressure.",
    bullets: [
      "Structured trade logging",
      "Behavioral pattern tracking",
      "Position-level review",
      "Risk discipline scoring",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24">

        {/* Header */}
        <div className="mb-16 sm:mb-20">
          <div className="text-xs tracking-[0.22em] text-foreground/40 mb-4">HOW IT WORKS</div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight mb-5">
            Trade with structure.<br />
            <span className="text-[color:var(--accent)]">Survive long enough to win.</span>
          </h1>
          <p className="text-lg text-foreground/60 max-w-2xl leading-relaxed">
            Most traders fail because they size incorrectly under pressure. Oren Capital
            forces structural discipline before capital goes at risk.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="group grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-6 sm:gap-10 py-10 border-b border-[color:var(--border)] last:border-0"
            >
              {/* Step number */}
              <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 pt-1">
                <span className="text-3xl font-bold tabular-nums text-[color:var(--accent)]/30 group-hover:text-[color:var(--accent)]/60 transition-colors">
                  {step.number}
                </span>
              </div>

              {/* Content */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
                <p className="text-sm text-foreground/65 leading-relaxed max-w-2xl">
                  {step.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {step.bullets.map((b) => (
                    <div key={b} className="flex items-start gap-2.5 text-sm text-foreground/55">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]/50" />
                      {b}
                    </div>
                  ))}
                </div>

                <Link
                  href={step.href}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] hover:opacity-80 transition-opacity mt-1"
                >
                  {step.cta}
                  <span className="text-xs">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-8 text-center space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Capital survival is not optional.
          </h2>
          <p className="text-sm text-foreground/60 max-w-md mx-auto">
            Markets don't care about conviction. They reward structure and punish overexposure.
            Start with your risk structure.
          </p>
          <Link
            href="/risk"
            className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition mt-2"
          >
            Begin with Survivability
          </Link>
        </div>

      </div>
    </main>
  );
}