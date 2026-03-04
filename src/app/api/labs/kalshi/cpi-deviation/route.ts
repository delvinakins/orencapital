import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const ticker = searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing required param: ticker" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    ticker,
    message: "cpi-deviation route working",
  });
}