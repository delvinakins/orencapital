// src/app/api/admin/nba/power-rankings/save/route.ts
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const DEFAULT_TEAMS = [
  "Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls","Cleveland Cavaliers",
  "Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors","Houston Rockets","Indiana Pacers",
  "Los Angeles Clippers","Los Angeles Lakers","Memphis Grizzlies","Miami Heat","Milwaukee Bucks","Minnesota Timberwolves",
  "New Orleans Pelicans","New York Knicks","Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns",
  "Portland Trail Blazers","Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards",
];

function normalizeTeamName(x: any): string {
  return String(x ?? "").trim();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function asNumber(v: any, fallback: number) {
  const x = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : fallback;
}

async function requireAdminFromAuthHeader(req: Request): Promise<{ email: string } | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;

  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];

  const svc = supabaseService();

  // Verify the user via token
  const { data, error } = await svc.auth.getUser(token);
  if (error) return null;

  const email = data.user?.email ?? null;
  if (!email) return null;
  if (!isAdminEmail(email)) return null;

  return { email };
}

export async function POST(req: Request) {
  try {
    // Admin gate: require Authorization: Bearer <access_token>
    const admin = await requireAdminFromAuthHeader(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const season = String(body?.season ?? "2025-2026").trim() || "2025-2026";

    const rawTeams: any[] = Array.isArray(body?.orderedTeams) ? body.orderedTeams : [];
    const orderedTeams = rawTeams.map(normalizeTeamName).filter(Boolean);

    // If client sends nothing, seed defaults
    const teams = orderedTeams.length > 0 ? orderedTeams : DEFAULT_TEAMS;

    // Basic validation
    if (teams.length !== 30) {
      return NextResponse.json(
        { ok: false, error: `Expected 30 teams; got ${teams.length}.` },
        { status: 400 }
      );
    }

    const params = body?.params ?? {};
    const A = clamp(asNumber(params.A, 10), 0.1, 200);
    const k = clamp(asNumber(params.k, 0.12), 0.001, 2.0);
    const S = clamp(asNumber(params.S, 1.0), 0.01, 20);

    const svc = supabaseService();

    // Upsert params (one row per season)
    const { error: perr } = await svc
      .from("nba_oren_params")
      .upsert(
        [{ season, a: A, k, s: S, updated_at: new Date().toISOString() }],
        { onConflict: "season" }
      );

    if (perr) throw perr;

    // Replace rankings for season (simple + robust)
    // 1) delete old
    const { error: derr } = await svc
      .from("nba_power_rankings")
      .delete()
      .eq("season", season);

    if (derr) throw derr;

    // 2) insert ordered
    const rows = teams.map((team, i) => ({
      season,
      team,
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));

    const { error: ierr } = await svc
      .from("nba_power_rankings")
      .insert(rows);

    if (ierr) throw ierr;

    return NextResponse.json({ ok: true, season });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}