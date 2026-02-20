// src/lib/labs/nba/providers/normalize.ts

export function normTeamName(x: string) {
  return String(x || "")
    .toLowerCase()
    .replace(/\./g, "")
    // Keep digits for "76ers"
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical team names for joining across providers.
 * Keys are normalized via normTeamName().
 */
const ALIASES: Record<string, string> = {
  // Atlanta Hawks
  "atlanta hawks": "atlanta hawks",
  "atl hawks": "atlanta hawks",
  "atl": "atlanta hawks",
  "hawks": "atlanta hawks",

  // Boston Celtics
  "boston celtics": "boston celtics",
  "bos celtics": "boston celtics",
  "bos": "boston celtics",
  "celtics": "boston celtics",

  // Brooklyn Nets
  "brooklyn nets": "brooklyn nets",
  "bkn nets": "brooklyn nets",
  "bkn": "brooklyn nets",
  "nets": "brooklyn nets",

  // Charlotte Hornets
  "charlotte hornets": "charlotte hornets",
  "cha hornets": "charlotte hornets",
  "cha": "charlotte hornets",
  "hornets": "charlotte hornets",

  // Chicago Bulls
  "chicago bulls": "chicago bulls",
  "chi bulls": "chicago bulls",
  "chi": "chicago bulls",
  "bulls": "chicago bulls",

  // Cleveland Cavaliers
  "cleveland cavaliers": "cleveland cavaliers",
  "cle cavaliers": "cleveland cavaliers",
  "cle": "cleveland cavaliers",
  "cavaliers": "cleveland cavaliers",
  "cavs": "cleveland cavaliers",

  // Dallas Mavericks
  "dallas mavericks": "dallas mavericks",
  "dal mavericks": "dallas mavericks",
  "dal": "dallas mavericks",
  "mavericks": "dallas mavericks",
  "mavs": "dallas mavericks",

  // Denver Nuggets
  "denver nuggets": "denver nuggets",
  "den nuggets": "denver nuggets",
  "den": "denver nuggets",
  "nuggets": "denver nuggets",

  // Detroit Pistons
  "detroit pistons": "detroit pistons",
  "det pistons": "detroit pistons",
  "det": "detroit pistons",
  "pistons": "detroit pistons",

  // Golden State Warriors
  "golden state warriors": "golden state warriors",
  "gs warriors": "golden state warriors",
  "gsw": "golden state warriors",
  "gs": "golden state warriors",
  "warriors": "golden state warriors",

  // Houston Rockets
  "houston rockets": "houston rockets",
  "hou rockets": "houston rockets",
  "hou": "houston rockets",
  "rockets": "houston rockets",

  // Indiana Pacers
  "indiana pacers": "indiana pacers",
  "ind pacers": "indiana pacers",
  "ind": "indiana pacers",
  "pacers": "indiana pacers",

  // LA Clippers
  "los angeles clippers": "los angeles clippers",
  "la clippers": "los angeles clippers",
  "lac": "los angeles clippers",
  "clippers": "los angeles clippers",

  // LA Lakers
  "los angeles lakers": "los angeles lakers",
  "la lakers": "los angeles lakers",
  "lal": "los angeles lakers",
  "lakers": "los angeles lakers",

  // Memphis Grizzlies
  "memphis grizzlies": "memphis grizzlies",
  "mem grizzlies": "memphis grizzlies",
  "mem": "memphis grizzlies",
  "grizzlies": "memphis grizzlies",
  "grizz": "memphis grizzlies",

  // Miami Heat
  "miami heat": "miami heat",
  "mia heat": "miami heat",
  "mia": "miami heat",
  "heat": "miami heat",

  // Milwaukee Bucks
  "milwaukee bucks": "milwaukee bucks",
  "mil bucks": "milwaukee bucks",
  "mil": "milwaukee bucks",
  "bucks": "milwaukee bucks",

  // Minnesota Timberwolves
  "minnesota timberwolves": "minnesota timberwolves",
  "min timberwolves": "minnesota timberwolves",
  "min": "minnesota timberwolves",
  "timberwolves": "minnesota timberwolves",
  "wolves": "minnesota timberwolves",
  "t wolves": "minnesota timberwolves",
  "twolves": "minnesota timberwolves",

  // New Orleans Pelicans
  "new orleans pelicans": "new orleans pelicans",
  "no pelicans": "new orleans pelicans",
  "nop": "new orleans pelicans",
  "no": "new orleans pelicans",
  "pelicans": "new orleans pelicans",
  "pels": "new orleans pelicans",

  // New York Knicks
  "new york knicks": "new york knicks",
  "ny knicks": "new york knicks",
  "nyk": "new york knicks",
  "ny": "new york knicks",
  "knicks": "new york knicks",

  // Oklahoma City Thunder
  "oklahoma city thunder": "oklahoma city thunder",
  "okc thunder": "oklahoma city thunder",
  "okc": "oklahoma city thunder",
  "thunder": "oklahoma city thunder",

  // Orlando Magic
  "orlando magic": "orlando magic",
  "orl magic": "orlando magic",
  "orl": "orlando magic",
  "magic": "orlando magic",

  // Philadelphia 76ers (digits must survive normalization)
  "philadelphia 76ers": "philadelphia 76ers",
  "philadelphia sixers": "philadelphia 76ers",
  "phi 76ers": "philadelphia 76ers",
  "phi sixers": "philadelphia 76ers",
  "phi": "philadelphia 76ers",
  "sixers": "philadelphia 76ers",
  "76ers": "philadelphia 76ers",
  "76 ers": "philadelphia 76ers",
  "seventysixers": "philadelphia 76ers",
  "seventy sixers": "philadelphia 76ers",

  // Phoenix Suns
  "phoenix suns": "phoenix suns",
  "phx suns": "phoenix suns",
  "phx": "phoenix suns",
  "suns": "phoenix suns",

  // Portland Trail Blazers
  "portland trail blazers": "portland trail blazers",
  "portland blazers": "portland trail blazers",
  "por trail blazers": "portland trail blazers",
  "por blazers": "portland trail blazers",
  "por": "portland trail blazers",
  "trail blazers": "portland trail blazers",
  "blazers": "portland trail blazers",

  // Sacramento Kings
  "sacramento kings": "sacramento kings",
  "sac kings": "sacramento kings",
  "sac": "sacramento kings",
  "kings": "sacramento kings",

  // San Antonio Spurs
  "san antonio spurs": "san antonio spurs",
  "sa spurs": "san antonio spurs",
  "sas": "san antonio spurs",
  "sa": "san antonio spurs",
  "spurs": "san antonio spurs",

  // Toronto Raptors
  "toronto raptors": "toronto raptors",
  "tor raptors": "toronto raptors",
  "tor": "toronto raptors",
  "raptors": "toronto raptors",

  // Utah Jazz
  "utah jazz": "utah jazz",
  "uta jazz": "utah jazz",
  "uta": "utah jazz",
  "jazz": "utah jazz",

  // Washington Wizards
  "washington wizards": "washington wizards",
  "was wizards": "washington wizards",
  "was": "washington wizards",
  "wizards": "washington wizards",
};

/**
 * Returns canonical team name for joins.
 * If unknown, falls back to normalized input.
 */
export function canonicalTeamName(x: string) {
  const n = normTeamName(x);
  return ALIASES[n] ?? n;
}

export function makeMatchKey(awayTeam: string, homeTeam: string, dateKey: string) {
  // dateKey: YYYY-MM-DD
  return `${dateKey}|${canonicalTeamName(awayTeam)}@${canonicalTeamName(homeTeam)}`;
}

export function parseClockToSecondsRemaining(clock: any): number | null {
  // Accept "MM:SS" or { minutes, seconds }
  if (typeof clock === "string") {
    const m = clock.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    return mm * 60 + ss;
  }

  const mm = typeof clock?.minutes === "number" ? clock.minutes : Number(clock?.minutes);
  const ss = typeof clock?.seconds === "number" ? clock.seconds : Number(clock?.seconds);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;

  return Math.max(0, Math.min(12 * 60, Math.trunc(mm) * 60 + Math.trunc(ss)));
}