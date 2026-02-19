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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtNum(x: any, digits = 1) {
  const v = typeof x === "number" ? x : x == null ? null : Number(x);
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function formatSpread(x: any, digits = 1) {
  if (x == null) return "—";
  const v = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  if (v > 0) return `+${s}`;
  if (v < 0) return s;
  return "0";
}

function DeviationTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">Deviation</div>
      <div className="text-foreground/70">
        Measures how far live performance has moved from market expectation.
      </div>
      <div className="text-foreground/70">Higher values indicate a more unusual move.</div>
    </div>
  );
}

function ViewTip() {
  return (
    <div className="max-w-sm space-y-2">
      <div className="font-semibold">View</div>
      <div className="text-foreground/70">
        Heat map is a fast scan. Table is for detail.
      </div>
    </div>
  );
}

type ViewMode = "heatmap" | "table";

type Row = {
  key: string;
  abs: number;
  deviation: number;
  matchup: string;
  clock: string;
  live: string;
  close: string;
  deviationText: string;
  toneText: string;
  directionLabel: string;
  tileTone: "accent" | "warn" | "neutral";
  scale: number;
};

export default function NbaClient() {
  const [games, setGames] = useState<GameClockState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("heatmap");

  async function load() {
    setLoadError(null);

    try {
      const res = await fetch("/api/labs/nba/mock-games", { cache: "no-store" });

      if (res.status === 404) {
        setGames([]);
        setLoadError("Feed endpoint not found.");
        setLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setGames([]);
        setLoadError("Unable to load games right now.");
        setLoading(false);
        return;
      }

      const json = await res.json().catch(() => null);

      if (!json?.ok || !Array.isArray(json.items)) {
        setGames([]);
        setLoadError("Unable to load games right now.");
        setLoading(false);
        return;
      }

      setGames(json.items);
      setLoading(false);
    } catch {
      setGames([]);
      setLoadError("Unable to load games right now.");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 90 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<Row[]>(() => {
    const computed = games.map((g: any) => {
      const result = computeDeviation(g, { spreadIndex });

      const deviation = Number.isFinite(result.zSpread) ? result.zSpread : 0;
      const abs = Math.abs(deviation);

      const tileTone: Row["tileTone"] = abs >= 1.5 ? "accent" : abs >= 1.0 ? "warn" : "neutral";
      const toneText =
        tileTone === "accent"
          ? "text-[color:var(--accent)]"
          : tileTone === "warn"
            ? "text-amber-200"
            : "text-foreground/80";

      // Subtle tile growth based on signal strength.
      // Capped to avoid "gamey" UI and layout jitter.
      const scale = 1 + clamp(abs, 0, 2.0) * 0.06; // 1.00 .. 1.12

      const mm = Math.floor((Number(g.secondsRemaining) || 0) / 60);
      const ss = String((Number(g.secondsRemaining) || 0) % 60).padStart(2, "0");

      // Plain direction label (no jargon)
      const directionLabel =
        deviation >= 0.35 ? "above expectation" : deviation <= -0.35 ? "below expectation" : "near expectation";

      return {
        key: String(g.gameId ?? `${g.awayTeam}-${g.homeTeam}`),
        abs,
        deviation,
        matchup: `${g.awayTeam ?? "—"} @ ${g.homeTeam ?? "—"}`,
        clock: `P${g.period ?? "—"} • ${mm}:${ss}`,
        live: formatSpread(g.liveSpreadHome, 1),
        close: formatSpread(g.closingSpreadHome, 1),
        deviationText: fmtNum(deviation, 2),
        toneText,
        directionLabel,
        tileTone,
        scale,
      };
    });

    computed.sort((a, b) => b.abs - a.abs);
    return computed;
  }, [games]);

  function HeatLegend() {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]/80" />
          <span>unusual move</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span>worth watching</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/30" />
          <span>typical range</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-2 text-sm text-foreground/80">
              Labs • NBA
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Live Deviation Heat Map</h1>

            <p className="mt-4 max-w-3xl text-lg text-foreground/75">
              Highlights games performing materially above or below market expectation.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <div className="inline-flex w-full sm:w-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
              <button
                type="button"
                onClick={() => setView("heatmap")}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                  view === "heatmap"
                    ? "bg-white text-slate-950"
                    : "text-foreground/80 hover:bg-white/5"
                )}
              >
                Heat map
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-2 text-sm rounded-lg transition",
                  view === "table"
                    ? "bg-white text-slate-950"
                    : "text-foreground/80 hover:bg-white/5"
                )}
              >
                Table
              </button>
            </div>

            <div className="text-sm text-foreground/60">
              <Tooltip label="View">
                <ViewTip />
              </Tooltip>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-6">
          {loading ? (
            <div className="text-foreground/70">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-foreground/70">{loadError ?? "No games available."}</div>
          ) : view === "heatmap" ? (
            <div className="space-y-5">
              <HeatLegend />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((r) => {
                  const tileClass =
                    r.tileTone === "accent"
                      ? "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/8 shadow-[0_0_0_1px_rgba(43,203,119,0.08)]"
                      : r.tileTone === "warn"
                        ? "border-amber-800/50 bg-amber-900/10"
                        : "border-[color:var(--border)] bg-white/2";

                  return (
                    <div
                      key={r.key}
                      className={cn(
                        "rounded-2xl border p-5",
                        "transition-transform duration-300 ease-out",
                        "hover:-translate-y-0.5",
                        tileClass
                      )}
                      style={{ transform: `scale(${r.scale})` }}
                      title={`${r.matchup} • ${r.clock}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold tracking-tight text-foreground">
                            {r.matchup}
                          </div>
                          <div className="mt-1 text-sm text-foreground/65">{r.clock}</div>
                        </div>

                        <div className={cn("text-sm font-semibold", r.toneText)}>
                          {r.directionLabel}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
                          <div className="text-xs text-foreground/60">Live (home)</div>
                          <div className="mt-1 font-semibold text-foreground">{r.live}</div>
                        </div>
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
                          <div className="text-xs text-foreground/60">Close (home)</div>
                          <div className="mt-1 font-semibold text-foreground">{r.close}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <div className="text-foreground/60">
                          <Tooltip label="Deviation">
                            <DeviationTip />
                          </Tooltip>
                        </div>
                        <div className={cn("font-semibold", r.toneText)}>{r.deviationText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-sm text-foreground/55">Lab preview. All signals require review.</div>
            </div>
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
                      <td className="px-4 py-3 font-medium text-foreground">{r.matchup}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.clock}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.live}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.close}</td>
                      <td className={cn("px-4 py-3 font-medium", r.toneText)}>{r.deviationText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 text-sm text-foreground/55">Lab preview. All signals require review.</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}