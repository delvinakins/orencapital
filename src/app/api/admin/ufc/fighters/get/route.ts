// src/app/api/admin/ufc/fighters/get/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// ─── Default fighter seeds per weight class ────────────────────────────────
// Elo seeded from UFC ranking position: champ=1720, rank 1=1680, …, rank 15=1520
// Style defaults to "balanced" until seeded from UFCStats.
// Users can override any field via the admin UI.

function eloFromRank(rank: number): number {
  if (rank === 0) return 1720; // champion
  return Math.round(1680 - (rank - 1) * 11);
}

type DefaultFighter = { name: string; rank: number; style: "ko_artist" | "grappler" | "balanced" };

const DEFAULT_FIGHTERS: Record<string, DefaultFighter[]> = {
  "Heavyweight": [
    { name: "Jon Jones",          rank: 0,  style: "complete"  },
    { name: "Stipe Miocic",       rank: 1,  style: "balanced"  },
    { name: "Tom Aspinall",       rank: 2,  style: "ko_artist" },
    { name: "Ciryl Gane",         rank: 3,  style: "balanced"  },
    { name: "Sergei Pavlovich",   rank: 4,  style: "ko_artist" },
    { name: "Curtis Blaydes",     rank: 5,  style: "grappler"  },
    { name: "Alexander Volkov",   rank: 6,  style: "balanced"  },
    { name: "Derrick Lewis",      rank: 7,  style: "ko_artist" },
    { name: "Jailton Almeida",    rank: 8,  style: "grappler"  },
    { name: "Tai Tuivasa",        rank: 9,  style: "ko_artist" },
    { name: "Marcin Tybura",      rank: 10, style: "balanced"  },
  ],
  "Light Heavyweight": [
    { name: "Alex Pereira",       rank: 0,  style: "ko_artist" },
    { name: "Jiri Prochazka",     rank: 1,  style: "ko_artist" },
    { name: "Magomed Ankalaev",   rank: 2,  style: "grappler"  },
    { name: "Jamahal Hill",       rank: 3,  style: "ko_artist" },
    { name: "Jan Blachowicz",     rank: 4,  style: "balanced"  },
    { name: "Khalil Rountree",    rank: 5,  style: "ko_artist" },
    { name: "Aleksandar Rakic",   rank: 6,  style: "ko_artist" },
    { name: "Ryan Spann",         rank: 7,  style: "balanced"  },
    { name: "Nikita Krylov",      rank: 8,  style: "ko_artist" },
    { name: "Johnny Walker",      rank: 9,  style: "ko_artist" },
    { name: "Volkan Oezdemir",    rank: 10, style: "ko_artist" },
  ],
  "Middleweight": [
    { name: "Dricus Du Plessis",  rank: 0,  style: "ko_artist" },
    { name: "Israel Adesanya",    rank: 1,  style: "ko_artist" },
    { name: "Sean Strickland",    rank: 2,  style: "balanced"  },
    { name: "Robert Whittaker",   rank: 3,  style: "balanced"  },
    { name: "Paulo Costa",        rank: 4,  style: "ko_artist" },
    { name: "Khamzat Chimaev",    rank: 5,  style: "grappler"  },
    { name: "Marvin Vettori",     rank: 6,  style: "grappler"  },
    { name: "Chris Curtis",       rank: 7,  style: "ko_artist" },
    { name: "Roman Dolidze",      rank: 8,  style: "balanced"  },
    { name: "Jack Hermansson",    rank: 9,  style: "grappler"  },
    { name: "Joe Pyfer",          rank: 10, style: "ko_artist" },
  ],
  "Welterweight": [
    { name: "Belal Muhammad",     rank: 0,  style: "grappler"  },
    { name: "Leon Edwards",       rank: 1,  style: "balanced"  },
    { name: "Colby Covington",    rank: 2,  style: "grappler"  },
    { name: "Kamaru Usman",       rank: 3,  style: "grappler"  },
    { name: "Ian Garry",          rank: 4,  style: "balanced"  },
    { name: "Sean Brady",         rank: 5,  style: "grappler"  },
    { name: "Gilbert Burns",      rank: 6,  style: "grappler"  },
    { name: "Vicente Luque",      rank: 7,  style: "ko_artist" },
    { name: "Jack Della Maddalena", rank: 8, style: "ko_artist" },
    { name: "Geoff Neal",         rank: 9,  style: "ko_artist" },
    { name: "Carlos Prates",      rank: 10, style: "ko_artist" },
  ],
  "Lightweight": [
    { name: "Islam Makhachev",    rank: 0,  style: "grappler"  },
    { name: "Arman Tsarukyan",    rank: 1,  style: "grappler"  },
    { name: "Charles Oliveira",   rank: 2,  style: "grappler"  },
    { name: "Dustin Poirier",     rank: 3,  style: "balanced"  },
    { name: "Justin Gaethje",     rank: 4,  style: "ko_artist" },
    { name: "Beneil Dariush",     rank: 5,  style: "grappler"  },
    { name: "Mateusz Gamrot",     rank: 6,  style: "grappler"  },
    { name: "Rafael Fiziev",      rank: 7,  style: "ko_artist" },
    { name: "Renato Moicano",     rank: 8,  style: "grappler"  },
    { name: "Dan Hooker",         rank: 9,  style: "balanced"  },
    { name: "Jalin Turner",       rank: 10, style: "ko_artist" },
  ],
  "Featherweight": [
    { name: "Ilia Topuria",       rank: 0,  style: "complete"  },
    { name: "Alexander Volkanovski", rank: 1, style: "grappler" },
    { name: "Max Holloway",       rank: 2,  style: "ko_artist" },
    { name: "Brian Ortega",       rank: 3,  style: "grappler"  },
    { name: "Yair Rodriguez",     rank: 4,  style: "ko_artist" },
    { name: "Giga Chikadze",      rank: 5,  style: "ko_artist" },
    { name: "Arnold Allen",       rank: 6,  style: "balanced"  },
    { name: "Josh Emmett",        rank: 7,  style: "ko_artist" },
    { name: "Sodiq Yusuff",       rank: 8,  style: "ko_artist" },
    { name: "Calvin Kattar",      rank: 9,  style: "balanced"  },
    { name: "Movsar Evloev",      rank: 10, style: "grappler"  },
  ],
  "Bantamweight": [
    { name: "Merab Dvalishvili",  rank: 0,  style: "grappler"  },
    { name: "Sean O'Malley",      rank: 1,  style: "ko_artist" },
    { name: "Cory Sandhagen",     rank: 2,  style: "ko_artist" },
    { name: "Marlon Vera",        rank: 3,  style: "balanced"  },
    { name: "Petr Yan",           rank: 4,  style: "balanced"  },
    { name: "Song Yadong",        rank: 5,  style: "ko_artist" },
    { name: "Rob Font",           rank: 6,  style: "balanced"  },
    { name: "Deiveson Figueiredo", rank: 7, style: "grappler"  },
    { name: "Henry Cejudo",       rank: 8,  style: "grappler"  },
    { name: "Umar Nurmagomedov",  rank: 9,  style: "grappler"  },
    { name: "Chris Gutierrez",    rank: 10, style: "balanced"  },
  ],
  "Flyweight": [
    { name: "Alexandre Pantoja",  rank: 0,  style: "grappler"  },
    { name: "Brandon Royval",     rank: 1,  style: "grappler"  },
    { name: "Amir Albazi",        rank: 2,  style: "grappler"  },
    { name: "Kai Kara-France",    rank: 3,  style: "ko_artist" },
    { name: "David Dvorak",       rank: 4,  style: "grappler"  },
    { name: "Manel Kape",         rank: 5,  style: "ko_artist" },
    { name: "Muhammad Mokaev",    rank: 6,  style: "grappler"  },
    { name: "Matt Schnell",       rank: 7,  style: "balanced"  },
    { name: "Tim Elliott",        rank: 8,  style: "grappler"  },
    { name: "Alex Perez",         rank: 9,  style: "balanced"  },
  ],
  "Women's Strawweight": [
    { name: "Zhang Weili",        rank: 0,  style: "complete"  },
    { name: "Yan Xiaonan",        rank: 1,  style: "balanced"  },
    { name: "Amanda Lemos",       rank: 2,  style: "ko_artist" },
    { name: "Marina Rodriguez",   rank: 3,  style: "ko_artist" },
    { name: "Jessica Andrade",    rank: 4,  style: "grappler"  },
    { name: "Carla Esparza",      rank: 5,  style: "grappler"  },
    { name: "Mackenzie Dern",     rank: 6,  style: "grappler"  },
    { name: "Angela Hill",        rank: 7,  style: "balanced"  },
    { name: "Tecia Pennington",   rank: 8,  style: "grappler"  },
    { name: "Liang Na",           rank: 9,  style: "balanced"  },
  ],
  "Women's Flyweight": [
    { name: "Valentina Shevchenko", rank: 0, style: "complete" },
    { name: "Alexa Grasso",       rank: 1,  style: "grappler"  },
    { name: "Taila Santos",       rank: 2,  style: "balanced"  },
    { name: "Viviane Araujo",     rank: 3,  style: "ko_artist" },
    { name: "Jennifer Maia",      rank: 4,  style: "grappler"  },
    { name: "Casey O'Neill",      rank: 5,  style: "grappler"  },
    { name: "Maycee Barber",      rank: 6,  style: "balanced"  },
    { name: "Natalia Silva",      rank: 7,  style: "ko_artist" },
    { name: "Erin Blanchfield",   rank: 8,  style: "grappler"  },
    { name: "Andrea Lee",         rank: 9,  style: "balanced"  },
  ],
  "Women's Bantamweight": [
    { name: "Raquel Pennington",  rank: 0,  style: "balanced"  },
    { name: "Julianna Pena",      rank: 1,  style: "grappler"  },
    { name: "Ketlen Vieira",      rank: 2,  style: "grappler"  },
    { name: "Holly Holm",         rank: 3,  style: "ko_artist" },
    { name: "Mayra Bueno Silva",  rank: 4,  style: "grappler"  },
    { name: "Karol Rosa",         rank: 5,  style: "grappler"  },
    { name: "Irene Aldana",       rank: 6,  style: "balanced"  },
    { name: "Sara McMann",        rank: 7,  style: "grappler"  },
    { name: "Macy Chiasson",      rank: 8,  style: "balanced"  },
    { name: "Aspen Ladd",         rank: 9,  style: "balanced"  },
  ],
};

export const WEIGHT_CLASSES = Object.keys(DEFAULT_FIGHTERS);

export async function GET(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: gate.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const weightClass = (searchParams.get("weightClass") || "Lightweight").trim();

    const svc = supabaseService();
    const { data, error } = await svc
      .from("ufc_fighter_ratings")
      .select("fighter_name, elo, fights, wins, ko_wins, sub_wins, td_accuracy, ground_ctrl_pct, style, dob, weight_class")
      .eq("weight_class", weightClass)
      .order("elo", { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      const fighters = data.map((r: any) => ({
        name: r.fighter_name,
        elo: Number(r.elo ?? 1500),
        fights: r.fights ?? 0,
        style: r.style ?? "balanced",
        dob: r.dob ?? null,
        tdAccuracy: r.td_accuracy != null ? Number(r.td_accuracy) : null,
        groundCtrlPct: r.ground_ctrl_pct != null ? Number(r.ground_ctrl_pct) : null,
        weightClass: r.weight_class ?? weightClass,
      }));
      return NextResponse.json({ ok: true, weightClass, fighters, source: "db" });
    }

    // Return seeded defaults for this weight class
    const defaults = DEFAULT_FIGHTERS[weightClass] ?? DEFAULT_FIGHTERS["Lightweight"];
    const fighters = defaults.map((f) => ({
      name: f.name,
      elo: eloFromRank(f.rank),
      fights: 0,
      style: f.style,
      dob: null,
      tdAccuracy: null,
      groundCtrlPct: null,
      weightClass,
    }));

    return NextResponse.json({ ok: true, weightClass, fighters, source: "defaults" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
