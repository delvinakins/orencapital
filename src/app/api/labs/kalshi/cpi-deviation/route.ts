// src/app/api/labs/kalshi/cpi-deviation/route.ts
import { NextResponse } from "next/server";

// NOTE: This route is intentionally minimal so it always builds.
// We will wire in real Kalshi + nowcast logic after the build is green.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const ticker = searchParams.get("ticker") ?? "";
  const mu = Number(searchParams.get("mu") ?? "0");
  const threshold = Number(searchParams.get("threshold") ?? "0");
  const sigma = Number(searchParams.get("sigma") ?? "0.15");

  // Basic validation
  if (!ticker) {
    return NextResponse.json(
      { error: "Missing required param: ticker" },
      { status: 400 }
    );
  }
  if (![mu, threshold, sigma].every((x) => Number.isFinite(x))) {
    return NextResponse.json(
      { error: "mu/threshold/sigma must be numbers" },
      { status: 400 }
    );
  }
  if (sigma <= 0) {
    return NextResponse.json({ error: "sigma must be > 0" }, { status: 400 });
  }

  // Placeholder response (keeps build green)
  return NextResponse.json({
    ticker,
    fair: { mu, threshold, sigma },
    kalshi: null,
    delta: null,
    z: null,
    note: "Route module is valid. Next step: wire Kalshi orderbook + fair prob model.",
  });
}