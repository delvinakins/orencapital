// src/app/labs/nba/page.tsx
import { buildDistributionIndex, type HistoricalSample } from "@/lib/nba/deviation-engine";
import { computeDeviation, type GameClockState } from "@/lib/labs/nba/heatmap";

export const metadata = {
  title: "Labs • NBA Heat Map — Oren Capital",
  description: "Live Deviation Heat Map for NBA games.",
};

/**
 * Deterministic pseudo-random generator (so server output is stable).
 * This avoids Math.random() differences across builds.
 */
function makeLCG(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    // LCG constants
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Stub historical samples for the conditional distribution engine.
 * We generate a synthetic dataset with realistic-ish spread movement noise.
 *
 * Later: replace this with real historical snapshots derived from:
 * - live line snapshots (per minute)
 * - closing consensus spreads
 * - scoreboard state
 */
function makeStubHistoricalSamples(count = 1400): HistoricalSample[] {
  const rnd = makeLCG(424242);

  const samples: HistoricalSample[] = [];
  const spreads = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];

  for (let i = 0; i < count; i++) {
    const period = 1 + Math.floor(rnd() * 4); // 1..4
    const secondsRemainingInPeriod = Math.floor(rnd() * 720); // 0..719

    const closingHomeSpread = spreads[Math.floor(rnd() * spreads.length)];
    const scoreDiff = Math.round((rnd() - 0.5) * 24); // -12..+12-ish

    // Spread deviation (live - close) synthetic:
    // - tends to widen when favorite leads late
    // - tends to swing toward dog when favorite is behind
    // - higher volatility late (less time -> sharper updates)
    const minutesLeft = secondsRemainingInPeriod / 60;
    const lateFactor = 1 + (1 - Math.min(1, minutesLeft / 12)) * 0.7; // up to 1.7 late

    // favorite indicator: closing spread negative => home favored
    const homeFavored = closingHomeSpread < 0 ? 1 : closingHomeSpread > 0 ? -1 : 0;

    // If home favored and home leads, move more negative (home favored more).
    // If home favored and home trails, move toward 0 or positive.
    const performanceSignal = homeFavored === 1 ? scoreDiff : homeFavored === -1 ? -scoreDiff : scoreDiff * 0.2;

    // convert performance signal into spread movement, scaled down
    const drift = clamp(performanceSignal / 12, -1.5, 1.5) * 1.2;

    // noise
    const noise = (rnd() - 0.5) * 1.6 * lateFactor;

    const deviation = (drift + noise) * lateFactor; // live - close
    const liveHomeSpread = roundToHalf(closingHomeSpread + deviation);

    samples.push({
      gameId: `stub-${i}`,
      t: i,
      state: {
        period,
        secondsRemainingInPeriod,
        scoreDiff,
      },
      market: {
        liveHomeSpread,
        closingHomeSpread,
      },
    });
  }

  return samples;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function roundToHalf(x: number) {
  return Math.round(x * 2) / 2;
}

function fmt(x: number, digits = 2) {
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}`;
}

export default function NbaHeatMapPage() {
  // Build the conditional distribution index (server-side for now).
  const samples = makeStubHistoricalSamples(1600);

  const spreadIndex = buildDistributionIndex(samples, {
    timeBucketSec: 60,          // per-minute buckets
    scoreDiffBucketPts: 3,      // +/- 3 pt score buckets
    closingSpreadBucketPts: 2,  // 2-pt pregame spread buckets
    reservoirSize: 128,
    otMode: "single",
  });

  // Mock “live games” to prove end-to-end scoring.
  // Later: replace with real feed objects.
  const mockGames: GameClockState[] = [
    {
      gameId: "demo-1",
      homeTeam: "BOS",
      awayTeam: "MIA",
      homeScore: 78,
      awayScore: 70,
      period: 3,
      secondsRemaining: 5 * 60 + 18,
      closingSpreadHome: -6.5,
      closingTotal: 219.5,
      liveSpreadHome: -10.5,
    },
    {
      gameId: "demo-2",
      homeTeam: "DEN",
      awayTeam: "LAL",
      homeScore: 54,
      awayScore: 60,
      period: 2,
      secondsRemaining: 1 * 60 + 44,
      closingSpreadHome: -4.0,
      closingTotal: 232.5,
      liveSpreadHome: +1.5,
    },
    {
      gameId: "demo-3",
      homeTeam: "NYK",
      awayTeam: "PHI",
      homeScore: 96,
      awayScore: 92,
      period: 4,
      secondsRemaining: 2 * 60 + 11,
      closingSpreadHome: +2.5,
      closingTotal: 221.5,
      liveSpreadHome: -3.0,
    },
  ];

  const scored = mockGames.map((g) => {
    const r = computeDeviation(g, { spreadIndex });
    return { game: g, r };
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
              Labs • NBA
            </div>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
              Live Deviation Heat Map
            </h1>

            <p className="max-w-3xl text-lg leading-relaxed text-foreground/75">
              This page highlights games where the live market deviates materially from the consensus closing line.
              The statistical engine below is wired using a stub historical dataset for now.
            </p>
          </div>

          {/* Engine sanity check (server-rendered) */}
          <section className="oc-glass rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-base font-semibold">Engine sanity check</div>
                <div className="mt-1 text-sm text-foreground/70">
                  Conditional distributions (time remaining + score diff + closing spread buckets) → z-score.
                </div>
              </div>
              <div className="text-sm text-foreground/60">
                Using {spreadIndex.global.n} stub samples (server-side).
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
              <table className="min-w-[920px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">Matchup</th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                    <th className="px-4 py-3 font-medium">Close (Home)</th>
                    <th className="px-4 py-3 font-medium">Live (Home)</th>
                    <th className="px-4 py-3 font-medium">Obs Dev</th>
                    <th className="px-4 py-3 font-medium">Exp Dev</th>
                    <th className="px-4 py-3 font-medium">zSpread</th>
                    <th className="px-4 py-3 font-medium">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {scored.map(({ game, r }) => {
                    const mm = Math.floor(game.secondsRemaining / 60);
                    const ss = String(game.secondsRemaining % 60).padStart(2, "0");

                    const meta = r.meta ?? { usedModel: false };
                    const z = r.zSpread;

                    const zClass =
                      !Number.isFinite(z) || z === 0
                        ? "text-foreground/70"
                        : Math.abs(z) >= 1.5
                          ? "text-[color:var(--accent)]"
                          : Math.abs(z) >= 1.0
                            ? "text-amber-200"
                            : "text-foreground/80";

                    return (
                      <tr key={game.gameId} className="border-t border-[color:var(--border)]">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {game.awayTeam} @ {game.homeTeam}
                        </td>
                        <td className="px-4 py-3 text-foreground/80">
                          P{game.period} • {mm}:{ss}
                        </td>
                        <td className="px-4 py-3 text-foreground/80">{fmt(game.closingSpreadHome, 1)}</td>
                        <td className="px-4 py-3 text-foreground/80">
                          {typeof game.liveSpreadHome === "number" ? fmt(game.liveSpreadHome, 1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/80">
                          {meta.usedModel && typeof meta.observedDeviation === "number" ? fmt(meta.observedDeviation, 2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/80">
                          {meta.usedModel && typeof meta.expectedDeviation === "number" ? fmt(meta.expectedDeviation, 2) : "—"}
                        </td>
                        <td className={`px-4 py-3 font-medium ${zClass}`}>
                          {meta.usedModel ? fmt(z, 2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground/75">
                          {meta.usedModel ? (meta.label ?? "—") : "Waiting for live spread feed"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-sm text-foreground/55">
              Note: This panel is a deterministic stub to validate wiring. It will be replaced by real live-feed scoring.
            </div>
          </section>

          {/* Keep your original "Coming next" section */}
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
            <div className="text-base font-semibold">Coming next</div>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-foreground/80">
              <li>Connect to NBA live scores + live lines feed</li>
              <li>Store closing spread/total (consensus across books)</li>
              <li>Replace stub samples with real historical snapshots</li>
              <li>Heat map UI (z-score tiering with calm labels)</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
