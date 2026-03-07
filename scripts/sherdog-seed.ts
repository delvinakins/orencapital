// scripts/sherdog-seed.ts
// Scrapes a fighter's full pro MMA record from Sherdog (all promotions, not just UFC)
// and upserts their computed Elo + stats to ufc_fighter_ratings in Supabase.
//
// Unlike the grade endpoint (which adds to existing state), this script
// computes the fighter's Elo from scratch by replaying their career chronologically,
// using each opponent's *current* DB Elo as the counterpart.
//
// Usage (single):
//   npx tsx scripts/sherdog-seed.ts "Islam Makhachev"
//   npx tsx scripts/sherdog-seed.ts "https://www.sherdog.com/fighter/Islam-Makhachev-76836"
//   npx tsx scripts/sherdog-seed.ts --dry-run "Losene Keita"
//
// Usage (bulk card seed):
//   npx tsx scripts/sherdog-seed.ts "Fighter 1" "Fighter 2" "Fighter 3" ...
//   npx tsx scripts/sherdog-seed.ts --dry-run "Max Holloway" "Charles Oliveira" "Caio Borralho"
//
// Env (auto-loaded from .env.local):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { load as cheerioLoad } from "cheerio";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ─── Env loader ───────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE = "https://www.sherdog.com";
const DEFAULT_ELO = 1500;

const K: Record<string, number> = {
  ko: 40, tko: 40, submission: 36,
  decision_unanimous: 28, decision_split: 20, decision_majority: 20, default: 32,
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Types ────────────────────────────────────────────────────────────────────
type FightResult = {
  date: string;        // ISO YYYY-MM-DD (chronological sort key)
  opponent: string;    // lowercased
  result: "win" | "loss";
  method: string;      // key into K map
  round: number | null;
  time: string | null;
  event: string;
};

// ─── Method parsing ───────────────────────────────────────────────────────────
function parseMethod(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  if (s.startsWith("no contest") || s.startsWith("draw") ||
      s.startsWith("dq") || s.startsWith("disqualif") ||
      s.includes("forfeit")) return null; // skip non-conclusive
  if (s.startsWith("tko") || s.includes("technical knockout") ||
      s.includes("doctor stoppage") || s.includes("corner stoppage") ||
      s.includes("injury") || s.includes("retirement")) return "tko";
  if (s.startsWith("ko")) return "ko";
  if (s.startsWith("technical submission") || s.startsWith("submission")) return "submission";
  if (s.includes("decision")) {
    if (s.includes("split"))    return "decision_split";
    if (s.includes("majority")) return "decision_majority";
    return "decision_unanimous";
  }
  return "default";
}

// ─── Date parsing ─────────────────────────────────────────────────────────────
function parseSherdogDate(raw: string): string | null {
  // "Jul / 10 / 2021" or "Jan / 23, 2021"
  const clean = raw.replace(/,/g, "").replace(/\s+/g, " ").trim();
  const m = clean.match(/(\w+)\s*\/\s*(\d+)\s*\/\s*(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]} ${m[3]}`);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ─── Sherdog search ───────────────────────────────────────────────────────────
async function findFighterUrl(name: string): Promise<string | null> {
  console.log(`Searching Sherdog for "${name}"...`);
  const res = await fetch(`${BASE}/stats/fightfinder?SearchTxt=${encodeURIComponent(name)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const $ = cheerioLoad(await res.text());
  const first = $('table.fightfinder_result a[href^="/fighter/"]').first();
  if (!first.length) return null;
  console.log(`  Match: ${first.text().trim()} → ${first.attr("href")}`);
  return `${BASE}${first.attr("href")}`;
}

// ─── Sherdog scraper ──────────────────────────────────────────────────────────
async function scrapeFighter(url: string): Promise<{
  name: string;
  dob: string | null;
  fights: FightResult[];
}> {
  console.log(`Scraping ${url}...`);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const $ = cheerioLoad(await res.text());

  // Name
  const name =
    $('h1[itemprop="name"] span[itemprop="name"]').first().text().trim() ||
    $("h1.fn").first().text().trim() ||
    $("h1").first().text().trim();

  // DOB — "Jul / 22 / 1988"
  let dob: string | null = null;
  $(".bio_fighter li, span.item").each((_, el) => {
    const text = $(el).text();
    if (text.toLowerCase().includes("date of birth") || text.toLowerCase().includes("birthday")) {
      const m = text.match(/(\w+)\s*\/\s*(\d+)\s*[\/,]\s*(\d{4})/);
      if (m) dob = parseSherdogDate(`${m[1]} / ${m[2]} / ${m[3]}`);
    }
  });

  // Fight history — Sherdog has one or more .fight_history sections
  const fights: FightResult[] = [];
  $("div.module.fight_history table.new_table.fighter tr").each((_, row) => {
    if ($(row).hasClass("table_head")) return;
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const resultText = $(cells[0]).find("span.final_result").text().trim().toLowerCase();
    if (resultText !== "win" && resultText !== "loss") return;

    const opponent = $(cells[1]).find("a").first().text().trim().toLowerCase();
    if (!opponent) return;

    const dateText = $(cells[2]).find("span.sub_line").first().text().trim();
    const date = parseSherdogDate(dateText);
    if (!date) return;

    const event = $(cells[2]).find("a").first().text().trim();
    const methodRaw = $(cells[3]).find("b").first().text().trim();
    const method = parseMethod(methodRaw);
    if (!method) return;

    const round = parseInt($(cells[4]).text().trim(), 10) || null;
    const time = cells.length > 5 ? $(cells[5]).text().trim() || null : null;

    fights.push({ date, opponent, result: resultText as "win" | "loss", method, round, time, event });
  });

  // Sort chronologically (Sherdog shows newest first)
  fights.sort((a, b) => a.date.localeCompare(b.date));

  const wins = fights.filter((f) => f.result === "win").length;
  const losses = fights.filter((f) => f.result === "loss").length;
  console.log(`  ${name} — ${fights.length} fights (${wins}W / ${losses}L)${dob ? ` · DOB: ${dob}` : ""}`);

  return { name, dob, fights };
}

// ─── Elo math ─────────────────────────────────────────────────────────────────
function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function classifyStyle(fights: number, ko_wins: number, sub_wins: number): string {
  if (fights < 5) return "balanced";
  if (ko_wins  / fights >= 0.50) return "ko_artist";
  if (sub_wins / fights >= 0.40) return "grappler";
  return "balanced";
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seedOne(
  input: string,
  dryRun: boolean,
  sb: ReturnType<typeof createClient> | null
): Promise<boolean> {
  // Resolve fighter URL
  let url: string;
  if (input.startsWith("http")) {
    url = input;
  } else {
    const found = await findFighterUrl(input);
    if (!found) { console.error(`  Fighter not found on Sherdog: "${input}"`); return false; }
    url = found;
    await delay(600);
  }

  const { name, dob, fights } = await scrapeFighter(url);

  if (fights.length === 0) {
    console.log("  No gradeable fights found. Skipping.");
    return false;
  }

  // Load opponents' current Elo from DB for accurate calculation
  const opponentNames = [...new Set(fights.map((f) => f.opponent))];
  const opponentElos = new Map<string, number>();

  if (sb) {
    const { data } = await sb
      .from("ufc_fighter_ratings")
      .select("fighter_name, elo")
      .in("fighter_name", opponentNames);
    for (const row of data ?? []) {
      opponentElos.set(row.fighter_name, Number(row.elo));
    }
  }

  const getOpponentElo = (n: string) => opponentElos.get(n) ?? DEFAULT_ELO;

  // Replay career chronologically from scratch
  let elo = DEFAULT_ELO;
  let fights_count = 0, wins = 0, ko_wins = 0, sub_wins = 0;

  console.log("\n--- Career replay ---");
  for (const fight of fights) {
    const oppElo = getOpponentElo(fight.opponent);
    const k = K[fight.method] ?? K.default;
    const exp = expectedScore(elo, oppElo);

    if (fight.result === "win") {
      elo = elo + k * (1 - exp);
      wins++;
      if (fight.method === "ko")         ko_wins++;
      if (fight.method === "tko")        ko_wins++;
      if (fight.method === "submission") sub_wins++;
    } else {
      elo = elo - k * (1 - exp);
    }
    fights_count++;

    const marker = fight.result === "win" ? "W" : "L";
    const opp = fight.opponent.replace(/\b\w/g, (c) => c.toUpperCase());
    console.log(
      `  ${fight.date}  ${marker}  ${opp.padEnd(28)} ${fight.method.padEnd(22)}  R${fight.round ?? "?"}  → Elo ${Math.round(elo)}`
    );
  }

  const style = classifyStyle(fights_count, ko_wins, sub_wins);
  const finalElo = Math.round(elo * 10) / 10;

  console.log(`\nFinal: ${name}`);
  console.log(`  Elo: ${finalElo}  Fights: ${fights_count}  Wins: ${wins}  KO: ${ko_wins}  Sub: ${sub_wins}  Style: ${style}`);
  if (dob) console.log(`  DOB: ${dob}`);

  if (dryRun) {
    console.log("  [DRY RUN] Nothing written.");
    return true;
  }

  const dbName = name.toLowerCase().trim();
  const { error } = await sb!.from("ufc_fighter_ratings").upsert({
    fighter_name: dbName,
    elo:          finalElo,
    fights:       fights_count,
    wins,
    ko_wins,
    sub_wins,
    style,
    ...(dob ? { dob } : {}),
    updated_at:   new Date().toISOString(),
  }, { onConflict: "fighter_name" });

  if (error) {
    console.error(`  Supabase upsert failed: ${error.message}`);
    return false;
  }

  console.log(`  Seeded: ${dbName} → ${finalElo} Elo (${fights_count}F / ${wins}W / ${style})`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("--preview");
  const inputs = args.filter((a) => !a.startsWith("--"));

  if (inputs.length === 0 || args.includes("--help")) {
    console.log(`Usage: npx tsx scripts/sherdog-seed.ts [--dry-run] "Fighter 1" ["Fighter 2" ...]`);
    process.exit(inputs.length ? 0 : 1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!supabaseUrl || !supabaseKey)) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or in .env.local)");
    process.exit(1);
  }

  const sb = (!dryRun && supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

  if (dryRun) console.log("--- DRY RUN ---\n");

  let ok = 0, failed = 0;

  for (let i = 0; i < inputs.length; i++) {
    if (inputs.length > 1) console.log(`\n[${i + 1}/${inputs.length}] ${inputs[i]}`);
    const success = await seedOne(inputs[i], dryRun, sb);
    if (success) ok++; else failed++;
    // Polite delay between fighters when doing bulk seeding
    if (i < inputs.length - 1) await delay(800);
  }

  if (inputs.length > 1) {
    console.log(`\n=== Done: ${ok} seeded, ${failed} failed ===`);
  }
}

main().catch((e) => { console.error("Fatal:", e?.message ?? e); process.exit(1); });
