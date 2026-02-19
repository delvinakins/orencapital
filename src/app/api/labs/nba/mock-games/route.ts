import { NextResponse } from "next/server";

type GameClockState = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;

  homeScore: number;
  awayScore: number;
  period: number;
  secondsRemaining: number;
  possession?: "HOME" | "AWAY" | "UNKNOWN";

  closingSpreadHome: number;
  closingTotal: number;

  liveSpreadHome?: number;
  liveTotal?: number;

  strengthBucket?: "ELITE" | "GOOD" | "AVG" | "WEAK";
};

const NBA_TEAMS = [
  "ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW",
  "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
  "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS",
];

function roundToHalf(x: number) {
  return Math.round(x * 2) / 2;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function makeLCG(seed = 2025) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeSlate(gameCount = 10): GameClockState[] {
  const rand = makeLCG(20250219);

  // deterministic shuffle (Fisher-Yates)
  const teams = [...NBA_TEAMS];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }

  const slate: GameClockState[] = [];
  const pairs = Math.min(gameCount * 2, teams.length);

  for (let i = 0; i < pairs; i += 2) {
    const awayTeam = teams[i];
    const homeTeam = teams[i + 1];

    const period = 1 + Math.floor(rand() * 4);
    const secondsRemaining = Math.floor(rand() * 720);

    const closingSpreadHome = roundToHalf((rand() - 0.5) * 16); // -8..+8
    const closingTotal = roundToHalf(212 + rand() * 34); // 212..246

    const progress =
      ((period - 1) * 720 + (720 - secondsRemaining)) / (4 * 720); // 0..1

    const expectedTotalSoFar = closingTotal * progress;
    const totalNoise = (rand() - 0.5) * 18; // +/-9
    const liveTotalSoFar = clamp(Math.round(expectedTotalSoFar + totalNoise), 0, 260);

    const expectedMarginSoFar = (-closingSpreadHome) * (0.25 + 0.75 * progress);
    const marginNoise = (rand() - 0.5) * 14; // +/-7
    const homeMargin = Math.round(expectedMarginSoFar + marginNoise);

    const homeScore = clamp(Math.round((liveTotalSoFar + homeMargin) / 2), 0, 200);
    const awayScore = clamp(liveTotalSoFar - homeScore, 0, 200);

    const lateFactor = 0.6 + progress; // more movement later
    const marginInfluence = clamp(homeMargin / 10, -3, 3) * lateFactor;
    const spreadNoise = (rand() - 0.5) * 2.8 * lateFactor;

    const liveSpreadHome = roundToHalf(closingSpreadHome - marginInfluence + spreadNoise);

    const possessionRoll = rand();
    const possession: GameClockState["possession"] =
      possessionRoll < 0.45 ? "HOME" : possessionRoll < 0.9 ? "AWAY" : "UNKNOWN";

    const strengthRoll = rand();
    const strengthBucket: GameClockState["strengthBucket"] =
      strengthRoll < 0.2 ? "ELITE" : strengthRoll < 0.5 ? "GOOD" : strengthRoll < 0.8 ? "AVG" : "WEAK";

    slate.push({
      gameId: `mock-${slate.length + 1}`,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      period,
      secondsRemaining,
      possession,
      closingSpreadHome,
      closingTotal,
      liveSpreadHome,
      liveTotal: roundToHalf(closingTotal + (rand() - 0.5) * 6),
      strengthBucket,
    });
  }

  return slate;
}

export async function GET() {
  try {
    const items = makeSlate(10);
    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch {
    // Always JSON (never HTML), and user-safe.
    return NextResponse.json({ ok: false, items: [], error: "Unavailable." }, { status: 200 });
  }
}
