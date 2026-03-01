// FILE: src/app/how-it-works/page.tsx
"use client";

import Link from "next/link";

function StepCard({
  n,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  n: string;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="oc-glass rounded-2xl p-6 sm:p-7 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]
                     flex items-center justify-center text-sm font-semibold text-[color:var(--accent)]"
        >
          {n}
        </div>
        <div className="text-lg font-semibold">{title}</div>
      </div>

      <p className="text-sm text-foreground/75 leading-relaxed">{body}</p>

      <div className="pt-1">
        <Link href={ctaHref} className="oc-btn oc-btn-accent">
          {ctaLabel} →
        </Link>
      </div>
    </div>
  );
}

function Callout({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/55 p-6 sm:p-7">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-foreground/75 leading-relaxed">{body}</div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10 sm:py-16 space-y-10">
        {/* HERO */}
        <header className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-xs text-foreground/70">
            <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
            Oren Capital • Survivability-first trading
          </div>

          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Most traders don’t fail because of strategy.
            <br />
            They fail because of <span className="text-[color:var(--accent)]">sizing</span>.
          </h1>

          <p className="max-w-2xl text-[15px] text-foreground/75 leading-relaxed">
            Oren is a risk system that forces structure before emotion. You define risk, stress-test survivability,
            and when conditions get dangerous, Oren automatically reduces allowable risk.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/risk-engine" className="oc-btn oc-btn-accent">
              Start with Position Risk →
            </Link>
            <Link href="/variance" className="oc-btn oc-btn-secondary">
              Open Variance Simulator →
            </Link>
          </div>

          <div className="text-xs text-foreground/60">
            Tagline: <span className="text-foreground/80">We don’t predict markets. We protect capital and expose mispricing.</span>
          </div>
        </header>

        {/* 3 STEPS */}
        <section className="grid gap-4 sm:grid-cols-3">
          <StepCard
            n="1"
            title="Define risk before you trade"
            body="Use Position Risk to compute exactly how much you lose if your stop hits. If the math is vague, the trade is fiction."
            ctaHref="/risk-engine"
            ctaLabel="Open Position Risk"
          />

          <StepCard
            n="2"
            title="Stress-test survival"
            body="Use the Variance Simulator to see likely drawdowns and losing streaks. Your job is to pick a risk level you can survive."
            ctaHref="/variance"
            ctaLabel="Run the Simulator"
          />

          <StepCard
            n="3"
            title="Automatic capital protection"
            body="If survivability deteriorates, Oren can enforce a smaller max risk per trade. This prevents a bad regime from wiping you out."
            ctaHref="/risk-engine"
            ctaLabel="See enforcement"
          />
        </section>

        {/* GOVERNANCE */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Governance: CPM vs ARC</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Callout
              title="CPM — Capital Protection Mode"
              body="CPM is the emergency brake. If metrics breach hard thresholds (high ruin risk, extreme drawdown expectations, or long losing streaks), Oren forces a strict cap on risk per trade for a short window."
            />
            <Callout
              title="ARC — Auto Risk Cap"
              body="ARC is the steady guardrail. It caps your max risk per trade based on survivability signals, without freezing you. You can still trade — you just can’t trade oversized."
            />
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/55 p-6 sm:p-7">
            <div className="text-sm font-semibold">Plain-language rule</div>
            <div className="mt-2 text-sm text-foreground/75 leading-relaxed">
              If your simulation says “this sizing likely breaks you,” Oren reduces what you’re allowed to risk. The goal isn’t to win today.
              The goal is to still be here next month.
            </div>
          </div>
        </section>

        {/* QUICK START */}
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Quick start</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <Callout
              title="Pick a default risk"
              body="Start conservative: 0.25%–0.75% per trade. If you don’t know your edge, you don’t earn the right to size up."
            />
            <Callout
              title="Run 120 trades"
              body="Simulate a meaningful sample. If the P90 drawdown is unacceptable, lower risk and rerun until it’s tolerable."
            />
            <Callout
              title="Let enforcement protect you"
              body="If CPM/ARC triggers, treat it as signal — not punishment. Your system is telling you sizing is unsafe."
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Link href="/risk-engine" className="oc-btn oc-btn-accent">
              Start now →
            </Link>
            <Link href="/pricing" className="oc-btn oc-btn-secondary">
              See Pro →
            </Link>
          </div>
        </section>

        {/* FOOTER CTA */}
        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/55 p-6 sm:p-8">
          <div className="text-lg font-semibold">You don’t need better predictions.</div>
          <div className="mt-1 text-sm text-foreground/75">You need better structure.</div>
          <div className="mt-4">
            <Link href="/risk-engine" className="oc-btn oc-btn-accent">
              Open Position Risk →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
