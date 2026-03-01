// src/app/how-it-works/page.tsx

import Link from "next/link";

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-16">

        {/* Hero */}
        <section className="space-y-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Trade with Structure.
            <br />
            <span className="text-[color:var(--accent)]">
              Survive Long Enough to Win.
            </span>
          </h1>

          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            Most traders fail because they size incorrectly.
            Oren Capital forces structural discipline before you put capital at risk.
          </p>

          <Link
            href="/risk"
            className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition"
          >
            Start Here
          </Link>
        </section>

        {/* Step 1 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Define Your Risk Structure</h2>
          <p className="text-foreground/70">
            Use the Survivability engine to simulate drawdowns, losing streaks,
            and long-term distribution outcomes before risking real money.
          </p>

          <ul className="list-disc pl-6 space-y-2 text-foreground/70">
            <li>Monte Carlo distribution modeling</li>
            <li>Expected drawdown thresholds</li>
            <li>Psychological ruin probability</li>
            <li>Expectancy analysis (R-based)</li>
          </ul>

          <Link href="/risk" className="text-[color:var(--accent)] font-medium hover:underline">
            Run survivability analysis →
          </Link>
        </section>

        {/* Step 2 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Enforce Position Discipline</h2>
          <p className="text-foreground/70">
            The Position Risk engine calculates exact dollar exposure before entry.
            You see whether your structure is aligned — or reckless.
          </p>

          <ul className="list-disc pl-6 space-y-2 text-foreground/70">
            <li>Risk per trade (percent or fixed dollar)</li>
            <li>Portfolio-level exposure</li>
            <li>Automatic risk caps (when survivability degrades)</li>
            <li>Capital protection mode under stress</li>
          </ul>

          <Link href="/risk-engine" className="text-[color:var(--accent)] font-medium hover:underline">
            Build a structured position →
          </Link>
        </section>

        {/* Step 3 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Track Behavior, Not Just Trades</h2>
          <p className="text-foreground/70">
            The Journal connects structure to execution.
            Discipline compounds. Emotion destroys.
          </p>

          <ul className="list-disc pl-6 space-y-2 text-foreground/70">
            <li>Snapshot-based journaling</li>
            <li>Behavioral pattern tracking</li>
            <li>Position-level review</li>
            <li>Structured reflection</li>
          </ul>

          <Link href="/journal" className="text-[color:var(--accent)] font-medium hover:underline">
            Log a structured trade →
          </Link>
        </section>

        {/* Final CTA */}
        <section className="space-y-6 text-center pt-10 border-t border-[color:var(--border)]">
          <h2 className="text-2xl font-semibold">
            Capital survival is not optional.
          </h2>

          <p className="text-foreground/70 max-w-xl mx-auto">
            Markets do not care about conviction.
            They reward structure and punish overexposure.
          </p>

          <Link
            href="/risk"
            className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition"
          >
            Begin With Risk Structure
          </Link>
        </section>

      </div>
    </main>
  );
}