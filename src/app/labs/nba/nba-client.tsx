"use client";

import { useEffect, useMemo, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { computeDeviation } from "@/lib/labs/nba/heatmap";
import { buildDistributionIndex } from "@/lib/nba/deviation-engine";

type GameClockState = any;

function makeStubIndex() {
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

function fmtNum(x: any, digits = 1) {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function DeviationTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Deviation</div>
      <div className="text-foreground/70">
        Measures how far the live performance has moved from market expectation.
      </div>
      <div className="text-foreground/70">
        Higher values indicate a more unusual move.
      </div>
    </div>
  );
}

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/labs/nba/mock-games", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (json?.ok && Array.isArray(json.items)) {
        setGames(json.items);
      }
    } catch {
      // silent failure — preserve last good state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 90 * 1000);
    return () => clearInterval(interval);
  }, []);

  const rows = useMemo(() => {
    return games.map((g: any) => {
      const result = computeDeviation(g, { spreadIndex });

      const deviation = Number.isFinite(result.zSpread)
        ? result.zSpread
        : 0;

      const abs = Math.abs(deviation);

      const tone =
        abs >= 1.5
          ? "text-[color:var(--accent)]"
          : abs >= 1.0
          ? "text-amber-200"
          : "text-foreground/80";

      const mm = Math.floor((Number(g.secondsRemaining) || 0) / 60);
      const ss = String((Number(g.secondsRemaining) || 0) % 60).padStart(2, "0");

      return {
        key: String(g.gameId ?? `${g.awayTeam}-${g.homeTeam}`),
        matchup: `${g.awayTeam ?? "—"} @ ${g.homeTeam ?? "—"}`,
        clock: `P${g.period ?? "—"} • ${mm}:${ss}`,
        live: fmtNum(g.liveSpreadHome, 1),
        close: fmtNum(g.closingSpreadHome, 1),
        deviationText: fmtNum(deviation, 2),
        tone,
      };
    });
  }, [games]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div>
          <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
            Labs • NBA
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
            Live Deviation Heat Map
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-foreground/75">
            Highlights games performing materially above or below market expectation.
          </p>
        </div>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          {loading ? (
            <div className="text-foreground/70">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-foreground/70">No games available.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-[15px]">
                <thead>
                  <tr className="text-left text-foreground/60">
                    <th className="px-4 py-3 font-medium">Matchup</th>
                    <th className="px-4 py-3 font-medium">Clock</th>
                    <th className="px-4 py-3 font-medium">Live Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">Closing Spread (Home)</th>
                    <th className="px-4 py-3 font-medium">
                      <Tooltip label="Deviation">
                        <DeviationTip />
                      </Tooltip>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-[color:var(--border)]">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.matchup}
                      </td>
                      <td className="px-4 py-3 text-foreground/80">
                        {r.clock}
                      </td>
                      <td className="px-4 py-3 text-foreground/80">
                        {r.live}
                      </td>
                      <td className="px-4 py-3 text-foreground/80">
                        {r.close}
                      </td>
                      <td className={`px-4 py-3 font-medium ${r.tone}`}>
                        {r.deviationText}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 text-sm text-foreground/55">
                Lab preview. All signals require review.
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
