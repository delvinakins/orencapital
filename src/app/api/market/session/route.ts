// src/app/api/market/session/route.ts
import { NextResponse } from "next/server";
import { formatSessionPill, getNyseSessionDateKeyET } from "@/lib/nyseCalendar";

export const runtime = "nodejs";

export async function GET() {
  try {
    const dateKeyET = getNyseSessionDateKeyET(new Date());
    const label = `${formatSessionPill(dateKeyET)} · Session`;

    return NextResponse.json({
      ok: true,
      dateKeyET,
      label,
      resetsAt: "04:00 America/New_York",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "session calc failed" },
      { status: 500 }
    );
  }
}