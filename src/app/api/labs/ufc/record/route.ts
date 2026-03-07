// src/app/api/labs/ufc/record/route.ts
// OCR accuracy scoreboard: how often does the model pick the right winner,
// and how does that compare to blindly following the market?

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseOrNull() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = supabaseOrNull();
  if (!sb) return NextResponse.json({ ok: false, error: "No DB" }, { status: 503 });

  const { data, error } = await sb
    .from("ufc_predictions")
    .select("fighter1_ocr_prob, fighter2_ocr_prob, fighter1_market_prob, fighter2_market_prob, winner, fighter1, fighter2")
    .not("graded_at", "is", null);

  if (error || !Array.isArray(data)) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Query failed" }, { status: 500 });
  }

  let ocrCorrect = 0, ocrFlipCorrect = 0, ocrAgreeCorrect = 0;
  let mktCorrect = 0, disagreements = 0, total = 0;

  for (const row of data) {
    if (!row.winner) continue;
    total++;

    const ocrFavF1 = (row.fighter1_ocr_prob ?? 0.5) >= 0.5;
    const mktFavF1 = (row.fighter1_market_prob ?? 0.5) >= 0.5;
    const ocrPick  = ocrFavF1 ? row.fighter1 : row.fighter2;
    const mktPick  = mktFavF1 ? row.fighter1 : row.fighter2;

    const ocrWon = ocrPick === row.winner;
    const mktWon = mktPick === row.winner;
    const disagreed = ocrPick !== mktPick;

    if (ocrWon) ocrCorrect++;
    if (mktWon) mktCorrect++;
    if (disagreed) {
      disagreements++;
      if (ocrWon) ocrFlipCorrect++;
    } else {
      if (ocrWon) ocrAgreeCorrect++;
    }
  }

  return NextResponse.json({
    ok: true,
    total,
    ocr: {
      correct: ocrCorrect,
      wrong: total - ocrCorrect,
      pct: total > 0 ? ocrCorrect / total : null,
    },
    market: {
      correct: mktCorrect,
      wrong: total - mktCorrect,
      pct: total > 0 ? mktCorrect / total : null,
    },
    // When OCR and market disagreed — did OCR add value?
    flips: {
      total: disagreements,
      ocrCorrect: ocrFlipCorrect,
      pct: disagreements > 0 ? ocrFlipCorrect / disagreements : null,
    },
    // When OCR and market agreed
    agrees: {
      total: total - disagreements,
      ocrCorrect: ocrAgreeCorrect,
      pct: (total - disagreements) > 0 ? ocrAgreeCorrect / (total - disagreements) : null,
    },
  });
}
