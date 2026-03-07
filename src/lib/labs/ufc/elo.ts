// src/lib/labs/ufc/elo.ts
// Oren Combat Rating (OCR) engine for UFC fighters.
//
// OCR formula (applied at matchup time):
//   effectiveElo(fighter) = baseElo + eloAgeAdjustment(age) + styleMatchupBonus(style, opponentStyle)
//   P(fighter wins) = 1 / (1 + 10^((effectiveElo_B - effectiveElo_A) / 400))
//
// What makes OCR distinct from plain Elo:
//   1. Finish-quality K-factor: KO/TKO wins update rating more than split decisions
//   2. Age peak curve: fighters outside the 27–31 peak window get an Elo penalty
//   3. Style matchup: grapplers dominate unless facing a KO artist; KO artists have a general edge

export const DEFAULT_ELO = 1500;

// ─── Finish quality K-factors ────────────────────────────────────────────────
export type FinishMethod =
  | "ko"
  | "tko"
  | "submission"
  | "decision_unanimous"
  | "decision_split"
  | "decision_majority"
  | "default";

export const K_BY_METHOD: Record<FinishMethod, number> = {
  ko:                  40,  // dominant signal
  tko:                 40,
  submission:          36,  // high-skill finish
  decision_unanimous:  28,  // clean win, moderate signal
  decision_split:      20,  // contested — weakest signal
  decision_majority:   20,
  default:             32,
};

// ─── Fighter style ────────────────────────────────────────────────────────────
export type FighterStyle = "ko_artist" | "grappler" | "balanced";

/**
 * Classify a fighter's style from accumulated stats.
 * Requires at least 5 fights for meaningful classification.
 *
 * ko_artist:  KO/TKO rate ≥ 50% (min 5 fights)
 * grappler:   td_accuracy ≥ 45% AND ground_ctrl_pct ≥ 35%
 *             OR submission rate ≥ 40% (min 5 fights)
 * balanced:   everything else
 */
export function classifyStyle(stats: {
  fights: number;
  ko_wins: number;
  sub_wins: number;
  td_accuracy: number | null;
  ground_ctrl_pct: number | null;
}): FighterStyle {
  const { fights, ko_wins, sub_wins, td_accuracy, ground_ctrl_pct } = stats;
  if (fights < 5) return "balanced";

  const koRate = ko_wins / fights;
  const subRate = sub_wins / fights;

  if (koRate >= 0.50) return "ko_artist";

  const hasGrapplingStats = td_accuracy != null && ground_ctrl_pct != null;
  if (hasGrapplingStats && td_accuracy! >= 0.45 && ground_ctrl_pct! >= 0.35) return "grappler";
  if (subRate >= 0.40) return "grappler";

  return "balanced";
}

// ─── Age adjustment (applied at matchup time, NOT stored in base Elo) ─────────
/**
 * Returns an Elo point delta to add to effectiveElo based on fighter age.
 * Peak window: 27–31 → 0 adjustment.
 * Declines above 33 and below 25.
 *
 * Values are conservative — the base Elo already partially encodes a fighter's
 * prime performance. This modifier captures current form vs historical record.
 */
export function eloAgeAdjustment(age: number | null): number {
  if (age == null || !Number.isFinite(age)) return 0;

  if (age >= 27 && age <= 31) return 0;        // peak window
  if (age >= 25 && age < 27)  return -5;        // pre-peak, close to prime
  if (age >= 32 && age <= 33) return -15;       // early decline
  if (age >= 34 && age <= 35) return -35;       // mid decline
  if (age > 35)               return Math.round(-35 - (age - 35) * 20); // steep late decline
  return -15;                                    // very young (<25)
}

// ─── Style matchup bonus (applied at matchup time) ────────────────────────────
/**
 * Returns an Elo point bonus for fighter A given the matchup with fighter B.
 *
 * grappler vs anyone except ko_artist: +50 effective Elo
 *   (world-class wrestlers dominate unless the opponent can finish with strikes)
 * ko_artist vs anyone: +30 effective Elo
 *   (general striking threat; neutralized if opponent is also a ko_artist)
 */
export function styleMatchupBonus(
  fighterStyle: FighterStyle | null,
  opponentStyle: FighterStyle | null
): number {
  if (!fighterStyle || !opponentStyle) return 0;
  if (fighterStyle === "grappler" && opponentStyle !== "ko_artist") return 50;
  if (fighterStyle === "ko_artist") return 30;
  return 0;
}

// ─── Core Elo math ────────────────────────────────────────────────────────────
/** Expected score for fighter A (raw Elo comparison, no adjustments). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Full OCR win probability for fighter A vs fighter B.
 * Applies age and style adjustments on top of base Elo.
 */
export function ocrWinProb(args: {
  eloA: number;
  eloB: number;
  ageA: number | null;
  ageB: number | null;
  styleA: FighterStyle | null;
  styleB: FighterStyle | null;
}): number {
  const { eloA, eloB, ageA, ageB, styleA, styleB } = args;

  const effectiveA =
    eloA + eloAgeAdjustment(ageA) + styleMatchupBonus(styleA, styleB);
  const effectiveB =
    eloB + eloAgeAdjustment(ageB) + styleMatchupBonus(styleB, styleA);

  return expectedScore(effectiveA, effectiveB);
}

/** Update base Elo ratings after a fight result. */
export function updateElo(
  winnerElo: number,
  loserElo: number,
  method: FinishMethod = "default"
): { winnerNew: number; loserNew: number } {
  const k = K_BY_METHOD[method] ?? K_BY_METHOD.default;
  const exp = expectedScore(winnerElo, loserElo);
  return {
    winnerNew: Math.round((winnerElo + k * (1 - exp)) * 10) / 10,
    loserNew:  Math.round((loserElo  + k * (0 - (1 - exp))) * 10) / 10,
  };
}

/** Convert American moneyline to implied win probability (includes vig). */
export function americanToImpliedProb(american: number): number | null {
  if (!Number.isFinite(american)) return null;
  if (american > 0) return 100 / (american + 100);
  if (american < 0) return Math.abs(american) / (Math.abs(american) + 100);
  return null;
}

/**
 * Hype tax: market-implied probability minus OCR-implied probability.
 * Positive = market overprices fighter relative to OCR.
 * Negative = market underprices fighter.
 */
export function hypeTax(marketProb: number, ocrProb: number): number {
  return marketProb - ocrProb;
}
