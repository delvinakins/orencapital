// src/app/api/market/movers/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    source: "massive",
    message: "Polygon/Massive route is active",
  });
}