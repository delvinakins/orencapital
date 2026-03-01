"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        {/* HERO */}
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
              Risk discipline for serious traders
            </div>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              Protect capital.
              <br />
              <span className="text-[color:var(--accent)]">Expose mispricing.</span>
            </h1>

            <p className="max-w-xl text-[15px] sm:text-lg leading-relaxed text-foreground/75">
              Most accounts fail from position sizing—not entries. Oren Capital helps you size with intent, simulate
              variance, and enforce survivability rules.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/how-it-works" className="oc-btn oc-btn-accent">
                Start here
              </Link>

              <Link href="/risk-engine" className="oc-btn oc-btn-secondary">
                Open Position Risk
              </Link>
            </div>

            <div className="pt-4 text-xs text-foreground/60">
              Pathway: How it works → Survivability → Position Risk → Journal
            </div>
          </div>

          {/* RIGHT: “Institutional” preview block */}
          <div className="oc-glass rounded-2xl p-5 sm:p-7 border border-[color:var(--border)]">
            <div className="text-sm font-semibold tracking-tight">What you do here</div>
            <div className="mt-1 text-sm text-foreground/70">
              Four steps. Same discipline every day.
            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs text-foreground/60">1) Survivability</div>
                <div className="mt-1 text-sm font-medium">Know your drawdown limits</div>
                <div className="mt-1 text-xs text-foreground/60">See DD50 + survivability cone.</div>
              </div>

              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs text-foreground/60">2) Position Risk</div>
                <div className="mt-1 text-sm font-medium">Size the trade correctly</div>
                <div className="mt-1 text-xs text-foreground/60">Entry, stop, quantity → dollar risk.</div>
              </div>

              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs text-foreground/60">3) Variance Simulator</div>
                <div className="mt-1 text-sm font-medium">Stress test your edge</div>
                <div className="mt-1 text-xs text-foreground/60">P90 drawdown + losing streaks.</div>
              </div>

              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                <div className="text-xs text-foreground/60">4) Journal</div>
                <div className="mt-1 text-sm font-medium">Track execution quality</div>
                <div className="mt-1 text-xs text-foreground/60">Build a repeatable process.</div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <Link href="/risk" className="oc-btn oc-btn-secondary">
                Open Survivability
              </Link>
              <Link href="/journal" className="oc-btn oc-btn-secondary">
                Open Journal
              </Link>
            </div>
          </div>
        </section>

        {/* BELOW FOLD: simple feature row */}
        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Enforced risk caps", desc: "ARC/CPM clamps risk when survivability breaks." },
            { title: "Variance-aware sizing", desc: "See drawdowns and streaks before you pay for them." },
            { title: "Execution tracking", desc: "Journal decisions to eliminate repeat errors." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5">
              <div className="text-base font-medium">{f.title}</div>
              <div className="mt-2 text-sm text-foreground/70">{f.desc}</div>
            </div>
          ))}
        </section>

        <section className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/pricing" className="oc-btn oc-btn-secondary">
            Pricing
          </Link>
          <Link href="/labs/nba" className="oc-btn oc-btn-secondary">
            Labs
          </Link>
        </section>
      </div>
    </main>
  );
}