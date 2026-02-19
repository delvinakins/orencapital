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

// Deterministic generator so UI remains stable
function makeLCG(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateSlate(): GameClockState[] {
  const rand = makeLCG(2025);

  // Shuffle teams deterministically
  const teams = [...NBA_TEAMS].sort(() => rand() - 0.5);

  const games: GameClockState[] = [];
  const gameCount = 10; // realistic slate size

  for (let i = 0; i < gameCount * 2; i += 2) {
    const away = teams[i];
    const home = teams[i + 1];

    const period = 1 + Math.floor(rand() * 4);
    const secondsRemaining = Math.floor(rand() * 720);

    const closingSpreadHome = roundToHalf((rand() - 0.5) * 14); // -7..+7
    const closingTotal = roundToHalf(214 + rand() * 30);        // 214..244

    const progress =
      ((period - 1) * 720 + (720 - secondsRemaining)) / (4 * 720);

    const expectedTotalSoFar = closingTotal * progress;
    const totalNoise = (rand() - 0.5) * 16;
    const liveTotal = clamp(
      Math.round(expectedTotalSoFar + totalNoise),
      0,
      260
    );

    const marginNoise = (rand() - 0.5) * 12;
    const expectedMarginSoFar =
      (-closingSpreadHome) * (0.3 + 0.7 * progress);
    const homeMargin = Math.round(expectedMarginSoFar + marginNoise);

    const homeScore = clamp(
      Math.round((liveTotal + homeMargin) / 2),
      0,
      200
    );
    const awayScore = clamp(liveTotal - homeScore, 0, 200);

    const lateFactor = 0.6 + progress;
    const marginInfluence =
      clamp(homeMargin / 10, -2.5, 2.5) * lateFactor;

    const spreadNoise = (rand() - 0.5) * 2.5 * lateFactor;

    const liveSpreadHome = roundToHalf(
      closingSpreadHome - marginInfluence + spreadNoise
    );

    const possessionRoll = rand();
    const possession =
      possessionRoll < 0.45
        ? "HOME"
        : possessionRoll < 0.9
        ? "AWAY"
        : "UNKNOWN";

    const strengthRoll = rand();
    const strengthBucket =
      strengthRoll < 0.2
        ? "ELITE"
        : strengthRoll < 0.5
        ? "GOOD"
        : strengthRoll < 0.8
        ? "AVG"
        : "WEAK";

    games.push({
      gameId: `game-${i / 2 + 1}`,
      awayTeam: away,
      homeTeam: home,
      homeScore,
      awayScore,
      period,
      secondsRemaining,
      possession,
      closingSpreadHome,
      closingTotal,
      liveSpreadHome,
      liveTotal,
      strengthBucket,
    });
  }

  return games;
}

export async function GET() {
  return NextResponse.json(
    { ok: true, items: generateSlate() },
    { status: 200 }
  );
}
