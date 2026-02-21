// src/app/api/labs/nba/apisports-debug/route.ts
import { NextResponse } from "next/server";

const BASE = (process.env.APISPORTS_NBA_BASE_URL || "https://v2.nba.api-sports.io").replace(/\/+$/, "");

async function probe(path: string) {
  const apiKey = process.env.APISPORTS_NBA_KEY;

  if (!apiKey) {
    return {
      ok: false,
      path,
      error: "Missing APISPORTS_NBA_KEY in environment",
    };
  }

  const url = `${BASE}${path}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "x-apisports-key": apiKey },
    });

    const json = await res.json().catch(() => null);

    const safe = {
      url,
      httpStatus: res.status,
      okHttp: res.ok,
      errors: json?.errors ?? null,
      results: json?.results ?? null,
      // show only high-level shape, not the whole payload
      responseCount: Array.isArray(json?.response) ? json.response.length : null,
      firstResponseKeys:
        Array.isArray(json?.response) && json.response[0] && typeof json.response[0] === "object"
          ? Object.keys(json.response[0]).slice(0, 30)
          : null,
    };

    return { ok: true, ...safe };
  } catch (e: any) {
    return {
      ok: false,
      url,
      error: e?.message ?? String(e),
    };
  }
}

function ymdUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const today = new Date();
  const date = ymdUtc(today);

  const [statusProbe, gamesProbe] = await Promise.all([
    probe("/status"),
    probe(`/games?date=${encodeURIComponent(date)}`),
  ]);

  return NextResponse.json(
    {
      base: BASE,
      hasKey: Boolean(process.env.APISPORTS_NBA_KEY),
      probes: {
        status: statusProbe,
        gamesTodayUtc: gamesProbe,
      },
      note: "This endpoint is for debugging only. Remove it after we confirm API-Sports connectivity.",
    },
    { status: 200 }
  );
}