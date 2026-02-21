// src/app/api/labs/nba/apisports-debug/route.ts
import { NextResponse } from "next/server";

const BASE = (process.env.APISPORTS_NBA_BASE_URL || "https://v2.nba.api-sports.io").replace(/\/+$/, "");

function ymdUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url: string) {
  const apiKey = process.env.APISPORTS_NBA_KEY;
  if (!apiKey) {
    return {
      ok: false,
      url,
      error: "Missing APISPORTS_NBA_KEY in environment",
    };
  }

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-apisports-key": apiKey },
  });

  const json = await res.json().catch(() => null);

  return {
    ok: true,
    url,
    httpStatus: res.status,
    okHttp: res.ok,
    json,
  };
}

function safePickGame(g: any) {
  if (!g || typeof g !== "object") return null;

  // Only pick the fields we need to debug parsing
  return {
    id: g.id ?? null,
    date: g.date ?? null,
    status: g.status ?? null,
    periods: g.periods ?? null,
    teams: g.teams ?? null,
    scores: g.scores ?? null,
  };
}

export async function GET() {
  const today = new Date();
  const date = ymdUtc(today);

  const statusUrl = `${BASE}/status`;
  const gamesUrl = `${BASE}/games?date=${encodeURIComponent(date)}`;

  const [statusRaw, gamesRaw] = await Promise.all([fetchJson(statusUrl), fetchJson(gamesUrl)]);

  const gamesJson = (gamesRaw as any)?.json;
  const arr = Array.isArray(gamesJson?.response) ? gamesJson.response : [];
  const sample0 = arr[0] ? safePickGame(arr[0]) : null;

  // If any game looks live-ish, surface that sample too (better than response[0])
  const liveish =
    arr.find((g: any) => {
      const short = String(g?.status?.short ?? "").toUpperCase();
      const long = String(g?.status?.long ?? "").toLowerCase();
      return short === "LIVE" || short.startsWith("Q") || long.includes("in play") || long.includes("live");
    }) ?? null;

  const sampleLiveish = liveish ? safePickGame(liveish) : null;

  return NextResponse.json(
    {
      base: BASE,
      hasKey: Boolean(process.env.APISPORTS_NBA_KEY),
      probes: {
        status: statusRaw.ok
          ? {
              url: statusRaw.url,
              httpStatus: statusRaw.httpStatus,
              okHttp: statusRaw.okHttp,
              errors: (statusRaw as any).json?.errors ?? null,
              results: (statusRaw as any).json?.results ?? null,
            }
          : statusRaw,
        gamesTodayUtc: gamesRaw.ok
          ? {
              url: gamesRaw.url,
              httpStatus: gamesRaw.httpStatus,
              okHttp: gamesRaw.okHttp,
              errors: (gamesRaw as any).json?.errors ?? null,
              results: (gamesRaw as any).json?.results ?? null,
              responseCount: Array.isArray((gamesRaw as any).json?.response) ? (gamesRaw as any).json.response.length : null,
              sample0,
              sampleLiveish,
            }
          : gamesRaw,
      },
      note: "Debug only. Remove after confirming schema.",
    },
    { status: 200 }
  );
}