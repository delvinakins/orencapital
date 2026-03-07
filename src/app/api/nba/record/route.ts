// src/app/api/nba/record/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const revalidate = 3600; // cache for 1 hour

export async function GET() {
  const { data, error } = await supabase
    .from("nba_edge_scoreboard")
    .select("mark")
    .eq("is_backfill", false); // exclude manually backfilled games

  if (error || !data) {
    return NextResponse.json({ error: "Failed to fetch record" }, { status: 500 });
  }

  const wins = data.filter((r) => r.mark === "hit").length;
  const losses = data.filter((r) => r.mark === "miss").length;
  const total = wins + losses;

  return NextResponse.json({ wins, losses, total, ok: true });
}