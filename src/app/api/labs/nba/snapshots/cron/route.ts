// src/app/api/labs/nba/snapshots/cron/route.ts
import { NextResponse } from "next/server";

function ptMonthYear(now: Date): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? now.getFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? now.getMonth() + 1);
  return { month, year };
}

function currentNbaSeasonPT(now = new Date()): string {
  // If it's Oct–Dec, season is YYYY-(YYYY+1). Otherwise it's (YYYY-1)-YYYY.
  const { month, year } = ptMonthYear(now);
  return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token === secret;
}

async function handler(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const adminToken = process.env.ADMIN_SEED_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured.", detail: "Missing ADMIN_SEED_TOKEN env var." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const season = url.searchParams.get("season") || currentNbaSeasonPT(new Date());
  const dryRun = url.searchParams.get("dryRun") === "1";

  const ingestUrl = new URL("/api/labs/nba/snapshots/ingest", url.origin);
  ingestUrl.searchParams.set("season", season);
  if (dryRun) ingestUrl.searchParams.set("dryRun", "1");

  try {
    const res = await fetch(ingestUrl.toString(), {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      cache: "no-store",
    });

    const text = await res.text();
    let ingest: any = null;
    try {
      ingest = JSON.parse(text);
    } catch {
      ingest = { ok: false, error: "Non-JSON response from ingest.", detail: text.slice(0, 300) };
    }

    return NextResponse.json({
      ok: true,
      cron: true,
      season,
      dryRun,
      ingestStatus: res.status,
      ingest,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Cron ingest failed.", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}