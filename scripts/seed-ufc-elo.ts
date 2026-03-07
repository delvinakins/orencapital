// scripts/seed-ufc-elo.ts
// Seeds ufc_fighter_ratings with Elo computed from 8,500+ historical UFC fights.
// Run: npx tsx scripts/seed-ufc-elo.ts
//
// Source: https://github.com/Greco1899/scrape_ufc_stats (last updated Nov 2025)
// OUTCOME column: W/L = first fighter won, L/W = second fighter won

import { createClient } from "@supabase/supabase-js";

const CSV_URL =
  "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/master/ufc_fight_results.csv";

const DEFAULT_ELO = 1500;

const K: Record<string, number> = {
  ko:                  40,
  tko:                 40,
  submission:          36,
  decision_unanimous:  28,
  decision_split:      20,
  decision_majority:   20,
  default:             32,
};

function methodKey(raw: string): string {
  const m = raw.toLowerCase().trim();
  if (m.includes("ko/tko") || m.includes("tko") || m.includes("ko")) {
    return m.includes("tko") ? "tko" : "ko";
  }
  if (m.includes("submission")) return "submission";
  if (m.includes("unanimous"))  return "decision_unanimous";
  if (m.includes("split"))      return "decision_split";
  if (m.includes("majority"))   return "decision_majority";
  return "default";
}

function normalizeWeightClass(raw: string): string {
  const w = raw.toLowerCase().replace(/\s*bout\s*$/i, "").trim();
  if (w.includes("women") && w.includes("strawweight"))  return "Women's Strawweight";
  if (w.includes("women") && w.includes("flyweight"))    return "Women's Flyweight";
  if (w.includes("women") && w.includes("bantamweight")) return "Women's Bantamweight";
  if (w.includes("women") && w.includes("featherweight"))return "Women's Featherweight";
  if (w.includes("light heavyweight"))                    return "Light Heavyweight";
  if (w.includes("heavyweight"))                          return "Heavyweight";
  if (w.includes("middleweight"))                         return "Middleweight";
  if (w.includes("welterweight"))                         return "Welterweight";
  if (w.includes("lightweight"))                          return "Lightweight";
  if (w.includes("featherweight"))                        return "Featherweight";
  if (w.includes("bantamweight"))                         return "Bantamweight";
  if (w.includes("flyweight"))                            return "Flyweight";
  if (w.includes("strawweight"))                          return "Women's Strawweight";
  return "Unknown";
}

// Minimal CSV line parser (handles quoted commas)
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  fields.push(cur.trim());
  return fields;
}

function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

type FighterState = {
  elo: number;
  fights: number;
  wins: number;
  ko_wins: number;
  sub_wins: number;
  weight_class: string;
};

function classifyStyle(s: FighterState): string {
  if (s.fights < 5) return "balanced";
  if (s.ko_wins  / s.fights >= 0.50) return "ko_artist";
  if (s.sub_wins / s.fights >= 0.40) return "grappler";
  return "balanced";
}

async function main() {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
    process.exit(1);
  }

  console.log("Fetching fight history CSV…");
  const text = await fetch(CSV_URL).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  const lines = text.split("\n").filter((l) => l.trim());
  const header = parseLine(lines[0]);

  const BOUT_IDX  = header.indexOf("BOUT");
  const OUT_IDX   = header.indexOf("OUTCOME");
  const WC_IDX    = header.indexOf("WEIGHTCLASS");
  const MTH_IDX   = header.indexOf("METHOD");

  if ([BOUT_IDX, OUT_IDX, WC_IDX, MTH_IDX].some((i) => i < 0)) {
    console.error("CSV header mismatch:", header);
    process.exit(1);
  }

  const dataLines = lines.slice(1);
  // CSV is newest-first; reverse to process oldest → newest
  const chronological = [...dataLines].reverse();

  const eloMap = new Map<string, FighterState>();

  function getOrCreate(name: string): FighterState {
    if (!eloMap.has(name)) {
      eloMap.set(name, { elo: DEFAULT_ELO, fights: 0, wins: 0, ko_wins: 0, sub_wins: 0, weight_class: "Unknown" });
    }
    return eloMap.get(name)!;
  }

  let processed = 0;
  let skipped = 0;

  for (const line of chronological) {
    if (!line.trim()) continue;

    const f = parseLine(line);
    const bout    = f[BOUT_IDX] ?? "";
    const outcome = (f[OUT_IDX] ?? "").trim().toUpperCase();
    const wcRaw   = f[WC_IDX]  ?? "";
    const mthRaw  = f[MTH_IDX] ?? "";

    // Parse "Fighter A vs. Fighter B"
    const vsMatch = bout.match(/^(.+?)\s+vs\.\s+(.+)$/i);
    if (!vsMatch) { skipped++; continue; }

    const f1 = vsMatch[1].trim().toLowerCase();
    const f2 = vsMatch[2].trim().toLowerCase();
    if (!f1 || !f2 || f1 === f2) { skipped++; continue; }

    // W/L = f1 won, L/W = f2 won
    let winner: string, loser: string;
    if      (outcome === "W/L") { winner = f1; loser = f2; }
    else if (outcome === "L/W") { winner = f2; loser = f1; }
    else    { skipped++; continue; } // NC, Draw, DQ, etc.

    const mk = methodKey(mthRaw);
    const k  = K[mk] ?? K.default;
    const wc = normalizeWeightClass(wcRaw);

    const ws = getOrCreate(winner);
    const ls = getOrCreate(loser);

    const exp = expectedScore(ws.elo, ls.elo);
    ws.elo = ws.elo + k * (1 - exp);
    ls.elo = ls.elo - k * (1 - exp);

    ws.fights++; ws.wins++;
    ls.fights++;
    if (mk === "ko" || mk === "tko") ws.ko_wins++;
    if (mk === "submission")         ws.sub_wins++;
    if (wc !== "Unknown") { ws.weight_class = wc; ls.weight_class = wc; }

    processed++;
  }

  console.log(`Processed: ${processed} fights | Skipped: ${skipped} | Unique fighters: ${eloMap.size}`);

  // Print top 15 by Elo
  const sorted = Array.from(eloMap.entries())
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.elo - a.elo);

  console.log("\nTop 15 by Elo:");
  sorted.slice(0, 15).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.name} — ${Math.round(r.elo)} (${r.fights}F / ${r.wins}W | ${classifyStyle(r)})`)
  );

  // Upsert to Supabase
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const rows = sorted.map((s) => ({
    fighter_name: s.name,
    elo:          Math.round(s.elo * 10) / 10,
    fights:       s.fights,
    wins:         s.wins,
    ko_wins:      s.ko_wins,
    sub_wins:     s.sub_wins,
    weight_class: s.weight_class,
    style:        classifyStyle(s),
    updated_at:   new Date().toISOString(),
  }));

  console.log(`\nUpserting ${rows.length} fighters to Supabase in batches…`);
  const BATCH = 500;
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb
      .from("ufc_fighter_ratings")
      .upsert(batch, { onConflict: "fighter_name" });

    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
      continue;
    }
    total += batch.length;
    process.stdout.write(`\r  ${total}/${rows.length}`);
  }

  console.log(`\n\nDone. ${total} fighters seeded.`);

  // Show tonight's card fighters
  const tonightNames = [
    "max holloway", "charles oliveira", "caio borralho", "reinier de ridder",
    "rob font", "raul rosas jr.", "drew dober",
  ];
  console.log("\nTonight's card (UFC 326):");
  for (const name of tonightNames) {
    const s = eloMap.get(name);
    if (s) {
      console.log(`  ${name}: ${Math.round(s.elo)} Elo (${s.fights}F / ${s.wins}W | ${classifyStyle(s)})`);
    } else {
      console.log(`  ${name}: not found in dataset`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
