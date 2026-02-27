// src/app/risk-death/RiskDeathClient.tsx
"use client";

import { useMemo, useState } from "react";

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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtPct(x: number | null, digits = 0) {
  if (x == null || !Number.isFinite(x)) return "—";
  const f = Math.round(x * 10 ** digits) / 10 ** digits;
  return `${f}%`;
}

function fmtMoney(x: number) {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
 * - Win yields profit = risk * payoutMultiple (e.g., -110 spread => payoutMultiple ~ 0.909)
 * - Loss loses the risk amount
 * - "Death" occurs when bankroll falls below (1 - deathDD) * startingBankroll
 */
function simulate(args: {
  seed: number;
  nSims: number;
  startBankroll: number;
  winProb: number; // 0..1
  payoutMultiple: number; // profit per 1 risk on win (e.g. 0.909)
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
  // simple, safe "discipline":
  // - half-Kelly
  // - cap at 2% per bet
  // - floor at 0%
  const k = kellyFraction(winProb, payoutMultiple);
  const half = 0.5 * k;
  return clamp(half, 0, 0.02);
}

export default function RiskDeathClient() {
  // Inputs (reasonable defaults)
  const [startBankroll, setStartBankroll] = useState(10000);
  const [deathDDPct, setDeathDDPct] = useState(70); // death at -70% from start
  const [riskPct, setRiskPct] = useState(2); // per bet as % of current bankroll
  const [winProbPct, setWinProbPct] = useState(53); // %
  const [odds, setOdds] = useState(-110); // American odds
  const [betsPerDay, setBetsPerDay] = useState(4);
  const [horizonDays, setHorizonDays] = useState(30);
  const [nSims, setNSims] = useState(6000);

  const [compareDisciplined, setCompareDisciplined] = useState(true);

  const payoutMultiple = useMemo(() => {
    // Convert American odds to profit per 1 risk.
    // -110 => profit/risk = 100/110 = 0.909
    // +150 => profit/risk = 150/100 = 1.5
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
  }, [startBankroll, deathDDPct, riskPct, winProbPct, betsPerDay, horizonDays, nSims, payoutMultiple]);

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
      seed: 7331, // different seed so you can see distinct distributions (still deterministic)
      ...params,
      riskPct: disciplined.riskPct,
    });
  }, [compareDisciplined, params, disciplined.riskPct]);

  const border = "border-[color:var(--border)]";
  const card = "bg-[color:var(--card)]";
  const subtle = "bg-black/10";

  const deathLine = params.startBankroll * (1 - params.deathDD);

  const compareRows = compareDisciplined && disciplinedSummary ? [
    {
      label: "Risk of Death",
      a: fmtPct(summary.deathProb * 100, 0),
      b: fmtPct(disciplinedSummary.deathProb * 100, 0),
      hint: "Probability bankroll crosses the death line before horizon.",
      toneA: summary.deathProb >= 0.35 ? "warn" : summary.deathProb >= 0.15 ? "mid" : "good",
      toneB: disciplinedSummary.deathProb >= 0.35 ? "warn" : disciplinedSummary.deathProb >= 0.15 ? "mid" : "good",
    },
    {
      label: "Median max drawdown",
      a: fmtPct(summary.medianMaxDD * 100, 0),
      b: fmtPct(disciplinedSummary.medianMaxDD * 100, 0),
      hint: "Median peak-to-trough drawdown experienced.",
      toneA: "neutral",
      toneB: "neutral",
    },
    {
      label: "Final bankroll (median)",
      a: fmtMoney(summary.medianFinal),
      b: fmtMoney(disciplinedSummary.medianFinal),
      hint: "Median ending bankroll at horizon.",
      toneA: "neutral",
      toneB: "neutral",
    },
  ] : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1 text-xs text-foreground/70">
            Risk · Calculator
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Blow-Up Risk</h1>
          <p className="text-sm text-foreground/55 max-w-3xl">
            A fast Monte Carlo estimate of how often a betting/trading profile “dies” (crosses a drawdown line) over a horizon.
            This is generic risk-of-ruin math—your Oren Edge formula stays private and untouched.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Inputs */}
          <section className={`lg:col-span-2 rounded-2xl border ${border} ${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Inputs</div>

              <button
                type="button"
                onClick={() => setCompareDisciplined((v) => !v)}
                className={`rounded-xl border ${border} bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-white/10 hover:text-foreground transition-colors`}
                aria-pressed={compareDisciplined}
              >
                {compareDisciplined ? "Comparison: ON" : "Comparison: OFF"}
              </button>
            </div>

            <div className="grid gap-3">
              <Field label="Starting bankroll" value={startBankroll} onChange={(v) => setStartBankroll(v)} suffix="" />
              <Field label="Death line (drawdown from start)" value={deathDDPct} onChange={(v) => setDeathDDPct(v)} suffix="%" />
              <Field label="Your risk per bet (of current bankroll)" value={riskPct} onChange={(v) => setRiskPct(v)} suffix="%" />
              <Field label="Win probability" value={winProbPct} onChange={(v) => setWinProbPct(v)} suffix="%" />
              <Field label="Price (American odds)" value={odds} onChange={(v) => setOdds(v)} suffix="" />
              <Field label="Bets per day" value={betsPerDay} onChange={(v) => setBetsPerDay(v)} suffix="" />
              <Field label="Horizon (days)" value={horizonDays} onChange={(v) => setHorizonDays(v)} suffix="" />
              <Field label="Simulations" value={nSims} onChange={(v) => setNSims(v)} suffix="" />
            </div>

            <div className={`rounded-xl border ${border} ${subtle} px-3.5 py-3 text-xs text-foreground/55 space-y-2`}>
              <div className="flex items-center justify-between">
                <span>Death threshold</span>
                <span className="tabular-nums font-semibold">{fmtMoney(deathLine)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Win payout multiple</span>
                <span className="tabular-nums font-semibold">{fmtNum(params.payoutMultiple, 3)}×</span>
              </div>

              {compareDisciplined && (
                <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-foreground/40">Disciplined sizing (auto)</div>
                  <div className="flex items-center justify-between">
                    <span>Kelly (approx)</span>
                    <span className="tabular-nums font-semibold">{fmtNum(disciplined.kellyPct, 2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Half-Kelly (capped)</span>
                    <span className="tabular-nums font-semibold">{fmtNum(disciplined.riskPct * 100, 2)}%</span>
                  </div>
                  <div className="text-[11px] text-foreground/40">
                    Uses half-Kelly capped at 2% per bet. This is just a safe reference.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Outputs */}
          <section className={`lg:col-span-3 rounded-2xl border ${border} ${card} p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{compareDisciplined ? "Results (side-by-side)" : "Results"}</div>
              <div className="text-xs text-foreground/45 tabular-nums">
                {summary.nSims.toLocaleString()} sims · {params.horizonDays}d · {params.betsPerDay} bets/day
              </div>
            </div>

            {compareDisciplined && disciplinedSummary ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-xl border ${border} ${subtle} px-4 py-3`}>
                    <div className="text-[11px] uppercase tracking-wide text-foreground/45">Your sizing</div>
                    <div className="mt-1 text-xs text-foreground/45">
                      Risk: <span className="tabular-nums font-semibold text-foreground/80">{fmtNum(params.riskPct * 100, 2)}%</span>{" "}
                      per bet
                    </div>
                  </div>
                  <div className={`rounded-xl border ${border} ${subtle} px-4 py-3`}>
                    <div className="text-[11px] uppercase tracking-wide text-foreground/45">Disciplined sizing</div>
                    <div className="mt-1 text-xs text-foreground/45">
                      Risk: <span className="tabular-nums font-semibold text-foreground/80">{fmtNum(disciplined.riskPct * 100, 2)}%</span>{" "}
                      per bet (half-Kelly cap)
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {compareRows.map((row) => (
                    <CompareRow
                      key={row.label}
                      label={row.label}
                      hint={row.hint}
                      aLabel="You"
                      bLabel="Disciplined"
                      a={row.a}
                      b={row.b}
                      toneA={row.toneA as any}
                      toneB={row.toneB as any}
                    />
                  ))}
                </div>

                <div className={`rounded-xl border ${border} ${subtle} px-4 py-3 text-xs text-foreground/50 space-y-1`}>
                  <div className="font-semibold text-foreground/70">Why this matters</div>
                  <div>
                    Blow-up risk is mostly a <span className="text-foreground/80 font-semibold">sizing problem</span>. The “Disciplined”
                    column shows what happens when you cap sizing to something survivable.
                  </div>
                  <div>
                    Use <span className="text-foreground/80 font-semibold">Survivability</span> to dial in risk caps that fit your personal drawdown tolerance.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Risk of Death"
                    value={fmtPct(summary.deathProb * 100, 0)}
                    hint="Probability bankroll crosses the death line before horizon."
                    tone={summary.deathProb >= 0.35 ? "warn" : summary.deathProb >= 0.15 ? "mid" : "good"}
                  />
                  <Metric
                    label="Median time to death"
                    value={summary.medianTimeToDeathDays == null ? "—" : `${Math.round(summary.medianTimeToDeathDays)} days`}
                    hint="Among runs that die (median)."
                    tone="neutral"
                  />
                  <Metric
                    label="Final bankroll (P10 / Median / P90)"
                    value={`${fmtMoney(summary.p10Final)} / ${fmtMoney(summary.medianFinal)} / ${fmtMoney(summary.p90Final)}`}
                    hint="Distribution of outcomes at horizon."
                    tone="neutral"
                  />
                  <Metric
                    label="Max drawdown (Median / P90)"
                    value={`${fmtPct(summary.medianMaxDD * 100, 0)} / ${fmtPct(summary.p90MaxDD * 100, 0)}`}
                    hint="Max peak-to-trough drawdown experienced."
                    tone="neutral"
                  />
                </div>

                <div className={`rounded-xl border ${border} ${subtle} px-4 py-3 text-xs text-foreground/50 space-y-1`}>
                  <div className="font-semibold text-foreground/70">Interpretation</div>
                  <div>
                    If <span className="text-foreground/80 font-semibold">Risk of Death</span> is high, reduce bet sizing (risk%), reduce bet volume,
                    improve win rate, or avoid negative price.
                  </div>
                  <div>
                    This model sizes bets as a % of current bankroll (compounding). If you flat-bet, your real risk profile may differ.
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="text-[11px] text-foreground/35">
          Informational only · This tool does not generate bet signals.
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  const border = "border-[color:var(--border)]";
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-foreground/45">{label}</span>
      <div className={`flex items-center gap-2 rounded-xl border ${border} bg-black/10 px-3 py-2`}>
        <input
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          inputMode="decimal"
          className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-foreground/30"
        />
        {suffix ? <span className="text-xs text-foreground/40">{suffix}</span> : null}
      </div>
    </label>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "mid" | "warn" | "neutral";
}) {
  const border = "border-[color:var(--border)]";
  const base = `rounded-xl border ${border} bg-black/10 px-4 py-3`;
  const ring =
    tone === "warn"
      ? "ring-1 ring-amber-400/25"
      : tone === "mid"
      ? "ring-1 ring-white/10"
      : tone === "good"
      ? "ring-1 ring-[color:var(--accent)]/18"
      : "";

  const valCls =
    tone === "warn"
      ? "text-amber-200"
      : tone === "mid"
      ? "text-foreground"
      : tone === "good"
      ? "text-[color:var(--accent)]"
      : "text-foreground";

  return (
    <div className={`${base} ${ring}`}>
      <div className="text-[11px] uppercase tracking-wide text-foreground/45">{label}</div>
      <div className={`mt-1.5 text-lg font-semibold tabular-nums ${valCls}`}>{value}</div>
      <div className="mt-1 text-xs text-foreground/45">{hint}</div>
    </div>
  );
}

function CompareRow({
  label,
  hint,
  aLabel,
  bLabel,
  a,
  b,
  toneA,
  toneB,
}: {
  label: string;
  hint: string;
  aLabel: string;
  bLabel: string;
  a: string;
  b: string;
  toneA: "good" | "mid" | "warn" | "neutral";
  toneB: "good" | "mid" | "warn" | "neutral";
}) {
  const border = "border-[color:var(--border)]";
  const subtle = "bg-black/10";

  const pill = (tone: "good" | "mid" | "warn" | "neutral") => {
    if (tone === "warn") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
    if (tone === "mid") return "border-white/10 bg-white/5 text-foreground/80";
    if (tone === "good") return "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]";
    return "border-white/10 bg-black/20 text-foreground/60";
  };

  return (
    <div className={`rounded-xl border ${border} ${subtle} px-4 py-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-foreground/45">{label}</div>
          <div className="mt-1 text-xs text-foreground/45">{hint}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${pill(toneA)}`}>
            <span className="text-[10px] opacity-80">{aLabel}</span>
            <span className="tabular-nums font-semibold">{a}</span>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${pill(toneB)}`}>
            <span className="text-[10px] opacity-80">{bLabel}</span>
            <span className="tabular-nums font-semibold">{b}</span>
          </div>
        </div>
      </div>
    </div>
  );
}