"use client";

import { useMemo, useState, type ReactNode, useEffect, useRef } from "react";
import { updateSurvivalScore } from "@/lib/risk/useSurvivalScore";

/* =========================================================
   Types
========================================================= */

type Summary = {
  nSims: number;
  deathProb: number; // 0..1
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  medianMaxDD: number; // 0..1
  p90MaxDD: number; // 0..1
  medianTimeToDeathDays: number | null;
};

/* =========================================================
   Helpers
========================================================= */

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtPctFrom01(x01: number | null, digits = 0) {
  if (x01 == null || !Number.isFinite(x01)) return "—";
  const p = x01 * 100;
  const f = Math.round(p * 10 ** digits) / 10 ** digits;
  return `${f.toFixed(digits)}%`;
}

function fmtPctFrom100(xPct: number | null, digits = 0) {
  if (xPct == null || !Number.isFinite(xPct)) return "—";
  const f = Math.round(xPct * 10 ** digits) / 10 ** digits;
  return `${f.toFixed(digits)}%`;
}

function fmtMoney(x: number) {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtNum(x: number, digits = 2) {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// Deterministic-ish PRNG (mulberry32)
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const idx = clamp((a.length - 1) * p, 0, a.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

/**
 * Risk Death Calculator (simple, fast, private)
 *
 * Model:
 * - Discrete bets
 * - Each bet risks "riskPct" of *current* bankroll (compounding)
 * - Win yields profit = risk * payoutMultiple (e.g., -110 => ~0.909)
 * - Loss loses the risk amount
 * - "Death" occurs when bankroll falls below (1 - deathDD) * startingBankroll
 */
function simulate(args: {
  seed: number;
  nSims: number;
  startBankroll: number;
  winProb: number; // 0..1
  payoutMultiple: number; // profit per 1 risk on win
  riskPct: number; // 0..1
  betsPerDay: number;
  horizonDays: number;
  deathDD: number; // 0..1 (e.g., 0.7 means death at -70% from start)
}): Summary {
  const { seed, nSims, startBankroll, winProb, payoutMultiple, riskPct, betsPerDay, horizonDays, deathDD } = args;

  const rand = mulberry32(seed);
  const deathLine = startBankroll * (1 - deathDD);
  const horizonBets = Math.max(1, Math.round(horizonDays * betsPerDay));

  let deaths = 0;
  const finals: number[] = [];
  const maxDDs: number[] = [];
  const timeToDeathDays: number[] = [];

  for (let s = 0; s < nSims; s++) {
    let br = startBankroll;
    let peak = startBankroll;
    let maxDD = 0;
    let diedAtBet: number | null = null;

    for (let i = 0; i < horizonBets; i++) {
      const risk = Math.max(0, br * riskPct);
      if (risk <= 0) break;

      const u = rand();
      if (u < winProb) br += risk * payoutMultiple;
      else br -= risk;

      if (br > peak) peak = br;

      const dd = peak > 0 ? (peak - br) / peak : 1;
      if (dd > maxDD) maxDD = dd;

      if (br <= deathLine) {
        diedAtBet = i + 1;
        break;
      }
    }

    finals.push(br);
    maxDDs.push(clamp(maxDD, 0, 1));

    if (diedAtBet != null) {
      deaths++;
      timeToDeathDays.push(diedAtBet / Math.max(1, betsPerDay));
    }
  }

  const deathProb = deaths / nSims;

  return {
    nSims,
    deathProb,
    medianFinal: percentile(finals, 0.5),
    p10Final: percentile(finals, 0.1),
    p90Final: percentile(finals, 0.9),
    medianMaxDD: percentile(maxDDs, 0.5),
    p90MaxDD: percentile(maxDDs, 0.9),
    medianTimeToDeathDays: timeToDeathDays.length > 0 ? percentile(timeToDeathDays, 0.5) : null,
  };
}

function kellyFraction(winProb: number, payoutMultiple: number) {
  // f* = (b p - q) / b, where q = 1-p
  const p = clamp(winProb, 0.0001, 0.9999);
  const b = clamp(payoutMultiple, 0.0001, 1000);
  const q = 1 - p;
  const f = (b * p - q) / b;
  return clamp(f, 0, 1);
}

function disciplinedRiskPct(winProb: number, payoutMultiple: number) {
  // safe discipline:
  // - half-Kelly
  // - cap at 2% per bet
  const k = kellyFraction(winProb, payoutMultiple);
  const half = 0.5 * k;
  return clamp(half, 0, 0.02);
}

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
              w-[min(360px,85vw)]
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
   UI Atoms
========================================================= */

function Input({
  label,
  value,
  onChange,
  suffix,
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  tip?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-foreground/70">{tip ? <Tooltip label={label}>{tip}</Tooltip> : label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 pr-14 text-foreground outline-none placeholder:text-foreground/30"
        />
        {suffix ? (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/45">
            {suffix}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "neutral",
  tip,
}: {
  label: ReactNode;
  value: string;
  sub?: string;
  tone?: "neutral" | "accent" | "warn";
  tip?: ReactNode;
}) {
  const toneClass =
    tone === "accent"
      ? "border-[color:var(--accent)]/55 shadow-[0_0_0_1px_rgba(43,203,119,0.10)]"
      : tone === "warn"
        ? "border-amber-800/60"
        : "border-[color:var(--border)]";

  const valueClass =
    tone === "accent"
      ? "text-[color:var(--accent)]"
      : tone === "warn"
        ? "text-amber-200"
        : "text-foreground";

  return (
    <div className={`rounded-xl border ${toneClass} bg-[color:var(--card)] p-5 sm:p-6`}>
      <div className="text-xs text-foreground/60">{tip ? <Tooltip label={String(label)}>{tip}</Tooltip> : label}</div>
      <div className={`mt-2 text-xl font-semibold ${valueClass} tabular-nums`}>{value}</div>
      {sub ? <div className="mt-2 text-xs text-foreground/60">{sub}</div> : null}
    </div>
  );
}

function toneFromProb(p01: number): "accent" | "neutral" | "warn" {
  if (!Number.isFinite(p01)) return "neutral";
  if (p01 >= 0.35) return "warn";
  if (p01 <= 0.10) return "accent";
  return "neutral";
}

/* =========================================================
   Page
========================================================= */

export default function RiskDeathClient() {
  // Inputs
  const [startBankroll, setStartBankroll] = useState("10000");
  const [deathDDPct, setDeathDDPct] = useState("70"); // death at -70% from start
  const [riskPct, setRiskPct] = useState("2"); // per bet as % of current bankroll
  const [winProbPct, setWinProbPct] = useState("53"); // %
  const [odds, setOdds] = useState("-110"); // American odds
  const [betsPerDay, setBetsPerDay] = useState("4");
  const [horizonDays, setHorizonDays] = useState("30");
  const [nSims, setNSims] = useState("6000");

  const [compareDisciplined, setCompareDisciplined] = useState(true);

  const payoutMultiple = useMemo(() => {
    const o = Number(odds);
    if (!Number.isFinite(o) || o === 0) return 0.909;
    if (o < 0) return 100 / Math.abs(o);
    return o / 100;
  }, [odds]);

  const params = useMemo(() => {
    const sb = Math.max(1, Number(startBankroll) || 1);
    const dd = clamp((Number(deathDDPct) || 0) / 100, 0.01, 0.99);
    const rp = clamp((Number(riskPct) || 0) / 100, 0.0001, 0.25);
    const wp = clamp((Number(winProbPct) || 0) / 100, 0.01, 0.99);
    const bpd = clamp(Math.round(Number(betsPerDay) || 1), 1, 200);
    const hd = clamp(Math.round(Number(horizonDays) || 1), 1, 365);
    const sims = clamp(Math.round(Number(nSims) || 5000), 1000, 25000);

    return {
      startBankroll: sb,
      deathDD: dd,
      riskPct: rp,
      winProb: wp,
      payoutMultiple: clamp(payoutMultiple, 0.1, 10),
      betsPerDay: bpd,
      horizonDays: hd,
      nSims: sims,
    };
  }, [startBankroll, deathDDPct, riskPct, winProbPct, odds, betsPerDay, horizonDays, nSims, payoutMultiple]);

  const disciplined = useMemo(() => {
    const rp = disciplinedRiskPct(params.winProb, params.payoutMultiple);
    const k = kellyFraction(params.winProb, params.payoutMultiple);
    return { riskPct: rp, kellyPct: k * 100 };
  }, [params.winProb, params.payoutMultiple]);

  const summary = useMemo(() => {
    return simulate({
      seed: 1337,
      ...params,
    });
  }, [params]);

  const disciplinedSummary = useMemo(() => {
    if (!compareDisciplined) return null;
    return simulate({
      seed: 7331,
      ...params,
      riskPct: disciplined.riskPct,
    });
  }, [compareDisciplined, params, disciplined.riskPct]);

  // ✅ UPDATE SURVIVAL SCORE (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      updateSurvivalScore({
        source: "risk-death",
        metrics: {
          ruin_probability: clamp(summary.deathProb, 0, 1),
          drawdown_pct: clamp(summary.p90MaxDD, 0, 1),
          consecutive_losses: Math.max(0, Math.round(params.betsPerDay * params.horizonDays)),
          risk_pct: clamp(params.riskPct, 0, 1),
        },
      });
    }, 350);

    return () => clearTimeout(t);
  }, [summary.deathProb, summary.p90MaxDD, params.betsPerDay, params.horizonDays, params.riskPct]);

  const deathLine = params.startBankroll * (1 - params.deathDD);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Risk • Calculator
          </div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-foreground">Blow-Up Risk</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-60" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>

          <p className="text-[15px] text-foreground/70 max-w-3xl">
            A fast Monte Carlo estimate of how often a profile “dies” by crossing a drawdown line over a fixed horizon.
            This is a sizing reality check.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Inputs */}
          <section className="lg:col-span-2 oc-glass rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold tracking-tight">Inputs</div>

              <button
                type="button"
                onClick={() => setCompareDisciplined((v) => !v)}
                className="oc-btn oc-btn-secondary h-10 px-3 text-xs"
                aria-pressed={compareDisciplined}
              >
                {compareDisciplined ? "Comparison: ON" : "Comparison: OFF"}
              </button>
            </div>

            <div className="grid gap-4">
              <Input label="Starting bankroll" value={startBankroll} onChange={setStartBankroll} tip="Starting account value for the simulation horizon." />

              <Input
                label="Death line drawdown"
                value={deathDDPct}
                onChange={setDeathDDPct}
                suffix="%"
                tip="When your bankroll falls below (1 - death line) × starting bankroll, the run is counted as dead."
              />

              <Input
                label="Risk % per bet"
                value={riskPct}
                onChange={setRiskPct}
                suffix="%"
                tip="Risked as a % of current bankroll (compounding). This is the main driver of death probability."
              />

              <Input
                label="Win rate"
                value={winProbPct}
                onChange={setWinProbPct}
                suffix="%"
                tip="Estimated probability of a win. If unsure, test a band like 50–55%."
              />

              <Input label="Price (American odds)" value={odds} onChange={setOdds} tip="Used to compute win payout multiple (profit per 1 unit risk)." />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Input label="Bets per day" value={betsPerDay} onChange={setBetsPerDay} tip="How many attempts per day." />
                <Input label="Horizon (days)" value={horizonDays} onChange={setHorizonDays} tip="How long to simulate." />
              </div>

              <Input label="Simulations" value={nSims} onChange={setNSims} tip="Higher is smoother but slower. 6,000–15,000 is plenty." />
            </div>

            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/55 backdrop-blur-[2px] p-4 text-xs text-foreground/70 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span>Death threshold</span>
                <span className="tabular-nums font-semibold text-foreground">{fmtMoney(deathLine)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span>Win payout multiple</span>
                <span className="tabular-nums font-semibold text-foreground">{fmtNum(params.payoutMultiple, 3)}×</span>
              </div>

              {compareDisciplined && (
                <div className="pt-3 mt-3 border-t border-[color:var(--border)] space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-foreground/50">Disciplined sizing (reference)</div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Kelly (approx)</span>
                    <span className="tabular-nums font-semibold text-foreground">{fmtNum(disciplined.kellyPct, 2)}%</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Half-Kelly (capped)</span>
                    <span className="tabular-nums font-semibold text-foreground">{fmtNum(disciplined.riskPct * 100, 2)}%</span>
                  </div>

                  <div className="text-[11px] text-foreground/50">
                    Half-Kelly capped at 2% per bet. This is a safety reference, not a recommendation.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Outputs */}
          <section className="lg:col-span-3 oc-glass rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold tracking-tight">{compareDisciplined ? "Results (side-by-side)" : "Results"}</div>
              <div className="text-xs text-foreground/60 tabular-nums">
                {summary.nSims.toLocaleString()} sims · {params.horizonDays}d · {params.betsPerDay} bets/day
              </div>
            </div>

            {compareDisciplined && disciplinedSummary ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    label="Your sizing"
                    value={`${fmtNum(params.riskPct * 100, 2)}% per bet`}
                    sub={`Death line: ${fmtPctFrom100(Number(deathDDPct), 0)} · Win rate: ${fmtPctFrom100(Number(winProbPct), 0)}`}
                    tone="neutral"
                  />
                  <Card
                    label="Disciplined sizing"
                    value={`${fmtNum(disciplined.riskPct * 100, 2)}% per bet`}
                    sub={`Kelly: ${fmtNum(disciplined.kellyPct, 2)}% · Cap: 2.00%`}
                    tone="accent"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Card
                    label="Risk of Death"
                    value={fmtPctFrom01(summary.deathProb, 1)}
                    sub="Your sizing"
                    tone={toneFromProb(summary.deathProb)}
                    tip="Probability the bankroll crosses the death line before the horizon."
                  />
                  <Card
                    label="Risk of Death"
                    value={fmtPctFrom01(disciplinedSummary.deathProb, 1)}
                    sub="Disciplined sizing"
                    tone={toneFromProb(disciplinedSummary.deathProb)}
                    tip="Same assumptions, but with capped half-Kelly risk sizing."
                  />
                  <Card
                    label="Delta"
                    value={fmtPctFrom01(disciplinedSummary.deathProb - summary.deathProb, 1)}
                    sub="Disciplined minus you"
                    tone={disciplinedSummary.deathProb - summary.deathProb <= -0.05 ? "accent" : "neutral"}
                    tip="How much death probability changes under disciplined sizing."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    label="Final bankroll (median)"
                    value={fmtMoney(summary.medianFinal)}
                    sub={`P10: ${fmtMoney(summary.p10Final)} · P90: ${fmtMoney(summary.p90Final)}`}
                  />
                  <Card
                    label="Final bankroll (median)"
                    value={fmtMoney(disciplinedSummary.medianFinal)}
                    sub={`P10: ${fmtMoney(disciplinedSummary.p10Final)} · P90: ${fmtMoney(disciplinedSummary.p90Final)}`}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    label="Max drawdown"
                    value={`${fmtPctFrom01(summary.medianMaxDD, 0)} (median)`}
                    sub={`P90: ${fmtPctFrom01(summary.p90MaxDD, 0)}`}
                  />
                  <Card
                    label="Max drawdown"
                    value={`${fmtPctFrom01(disciplinedSummary.medianMaxDD, 0)} (median)`}
                    sub={`P90: ${fmtPctFrom01(disciplinedSummary.p90MaxDD, 0)}`}
                  />
                </div>

                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/55 backdrop-blur-[2px] p-4 text-sm text-foreground/75">
                  <div className="font-semibold text-foreground mb-1">Interpretation</div>
                  <div>
                    Blow-up risk is mostly a <span className="text-foreground font-semibold">sizing problem</span>. If your risk of death is
                    high, the fastest fix is reducing <span className="text-foreground font-semibold">risk % per bet</span>.
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    label="Risk of Death"
                    value={fmtPctFrom01(summary.deathProb, 1)}
                    tone={toneFromProb(summary.deathProb)}
                    sub="Probability bankroll crosses the death line before horizon."
                  />

                  <Card
                    label="Median time to death"
                    value={summary.medianTimeToDeathDays == null ? "—" : `${Math.round(summary.medianTimeToDeathDays)} days`}
                    sub="Among runs that die (median)."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card
                    label="Final bankroll"
                    value={`${fmtMoney(summary.p10Final)} – ${fmtMoney(summary.p90Final)}`}
                    sub={`Median: ${fmtMoney(summary.medianFinal)}`}
                  />

                  <Card
                    label="Max drawdown"
                    value={`${fmtPctFrom01(summary.medianMaxDD, 0)} (median)`}
                    sub={`P90: ${fmtPctFrom01(summary.p90MaxDD, 0)}`}
                  />
                </div>

                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/55 backdrop-blur-[2px] p-4 text-sm text-foreground/75">
                  <div className="font-semibold text-foreground mb-1">Interpretation</div>
                  <div>
                    If <span className="text-foreground font-semibold">Risk of Death</span> is high, reduce bet sizing (risk%), reduce volume,
                    improve win rate, or improve price.
                  </div>
                  <div className="mt-2 text-xs text-foreground/60">
                    Note: This sizes bets as a % of current bankroll (compounding). Flat-betting will behave differently.
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="text-[11px] text-foreground/50">
          Informational only · This tool does not generate signals or recommendations.
        </div>
      </div>
    </main>
  );
}