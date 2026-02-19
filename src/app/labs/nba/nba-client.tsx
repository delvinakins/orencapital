"use client";

import { useEffect, useState } from "react";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any; // matches API route shape

function makeStubIndex() {
  // Very small synthetic index for now.
  const samples = Array.from({ length: 1200 }).map((_, i) => {
    const spread = [-8, -6, -4, -2, 0, 2, 4, 6][i % 8];
    return {
      gameId: `stub-${i}`,
      state: {
        period: (i % 4) + 1,
        secondsRemainingInPeriod: (i * 37) % 720,
        scoreDiff: ((i * 13) % 20) - 10,
      },
      market: {
        closingHomeSpread: spread,
        liveHomeSpread: spread + (((i * 17) % 10) - 5) * 0.2,
      },
    };
  });

  return buildDistributionIndex(samples);
}

const spreadIndex = makeStubIndex();

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/labs/nba/mock-games", {
        cache: "no-store",
      });

      const json = await res.json();
      if (json?.ok && Array.isArray(json.items)) {
        setGames(json.items);
      }
    } catch {
      // Calm failure: do nothing noisy
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(load, 90 * 1000); // 90 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16 space-y-8">
        <div>
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Labs • NBA
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Live Deviation Heat Map
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-foreground/75">
            Games refresh every 90 seconds. Statistical deviation is computed
            versus historical conditional distributions.
          </p>
        </div>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          {loading ? (
            <div className="text-foreground/70">Loading…</div>
          ) : games.length === 0 ? (
            <div className="text-foreground/70">No games available.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[880px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3">Matchup</th>
                    <th className="px-4 py-3">Clock</th>
                    <th className="px-4 py-3">Live (Home)</th>
                    <th className="px-4 py-3">Close (Home)</th>
                    <th className="px-4 py-3">zSpread</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g: any) => {
                    const result = computeDeviation(g, { spreadIndex });

                    const absZ = Math.abs(result.zSpread);
                    const tone =
                      absZ >= 1.5
                        ? "text-[color:var(--accent)]"
                        : absZ >= 1.0
                        ? "text-amber-200"
                        : "text-foreground/80";

                    const mm = Math.floor(g.secondsRemaining / 60);
                    const ss = String(g.secondsRemaining % 60).padStart(2, "0");

                    return (
                      <tr key={g.gameId} className="border-t border-[color:var(--border)]">
                        <td className="px-4 py-3 font-medium">
                          {g.awayTeam} @ {g.homeTeam}
                        </td>
                        <td className="px-4 py-3">
                          P{g.period} • {mm}:{ss}
                        </td>
                        <td className="px-4 py-3">{g.liveSpreadHome ?? "—"}</td>
                        <td className="px-4 py-3">{g.closingSpreadHome}</td>
                        <td className={`px-4 py-3 font-medium ${tone}`}>
                          {result.zSpread.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
