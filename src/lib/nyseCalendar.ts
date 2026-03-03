// src/lib/nyseCalendar.ts

type YMD = { y: number; m: number; d: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateKeyUTC(d: Date) {
  // d should be a "date-only" concept (we store it at noon UTC to avoid DST weirdness)
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function dateUTC(y: number, m1: number, d: number) {
  // m1 = 1..12
  return new Date(Date.UTC(y, m1 - 1, d, 12, 0, 0));
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function dowUTC(d: Date) {
  return d.getUTCDay(); // 0 Sun .. 6 Sat
}

function nthWeekdayOfMonthUTC(
  y: number,
  m1: number,
  weekday: number, // 0 Sun..6 Sat
  nth: number
) {
  const first = dateUTC(y, m1, 1);
  const firstDow = dowUTC(first);
  const delta = (weekday - firstDow + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  return dateUTC(y, m1, day);
}

function lastWeekdayOfMonthUTC(
  y: number,
  m1: number,
  weekday: number // 0 Sun..6 Sat
) {
  // go to first of next month then step back
  const firstNext = m1 === 12 ? dateUTC(y + 1, 1, 1) : dateUTC(y, m1 + 1, 1);
  let d = addDaysUTC(firstNext, -1);
  while (dowUTC(d) !== weekday) d = addDaysUTC(d, -1);
  return d;
}

// Anonymous Gregorian algorithm for Easter Sunday (UTC "date-only")
function easterSundayUTC(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateUTC(year, month, day);
}

function observedFixedHolidayUTC(y: number, m1: number, d: number) {
  const dt = dateUTC(y, m1, d);
  const dow = dowUTC(dt);
  // Saturday -> observed Friday; Sunday -> observed Monday; else same day
  if (dow === 6) return addDaysUTC(dt, -1);
  if (dow === 0) return addDaysUTC(dt, 1);
  return dt;
}

export function nyseHolidayKeysForYear(year: number): Set<string> {
  // Note: NYSE has occasional one-off closings (e.g., national days of mourning).
  // This covers the standard recurring full-day holiday schedule + Good Friday.
  const holidays: Date[] = [];

  // New Year's Day (observed)
  holidays.push(observedFixedHolidayUTC(year, 1, 1));

  // MLK Day: 3rd Monday in Jan
  holidays.push(nthWeekdayOfMonthUTC(year, 1, 1, 3));

  // Presidents' Day (Washington's Birthday): 3rd Monday in Feb
  holidays.push(nthWeekdayOfMonthUTC(year, 2, 1, 3));

  // Good Friday: Easter Sunday - 2 days
  holidays.push(addDaysUTC(easterSundayUTC(year), -2));

  // Memorial Day: last Monday in May
  holidays.push(lastWeekdayOfMonthUTC(year, 5, 1));

  // Juneteenth: Jun 19 (observed) — NYSE recognized since 2022
  holidays.push(observedFixedHolidayUTC(year, 6, 19));

  // Independence Day: Jul 4 (observed)
  holidays.push(observedFixedHolidayUTC(year, 7, 4));

  // Labor Day: 1st Monday in Sep
  holidays.push(nthWeekdayOfMonthUTC(year, 9, 1, 1));

  // Thanksgiving: 4th Thursday in Nov
  holidays.push(nthWeekdayOfMonthUTC(year, 11, 4, 4));

  // Christmas: Dec 25 (observed)
  holidays.push(observedFixedHolidayUTC(year, 12, 25));

  const keys = new Set<string>();
  for (const h of holidays) keys.add(toDateKeyUTC(h));
  return keys;
}

export function isNyseTradingDayUTC(dateOnlyUTC: Date): boolean {
  const dow = dowUTC(dateOnlyUTC);
  if (dow === 0 || dow === 6) return false;

  const y = dateOnlyUTC.getUTCFullYear();
  const key = toDateKeyUTC(dateOnlyUTC);

  // include adjacent-year holidays around New Year observed on prior/next year weekday
  const setPrev = nyseHolidayKeysForYear(y - 1);
  const setThis = nyseHolidayKeysForYear(y);
  const setNext = nyseHolidayKeysForYear(y + 1);

  return !(setPrev.has(key) || setThis.has(key) || setNext.has(key));
}

export function prevNyseTradingDayUTC(dateOnlyUTC: Date): Date {
  let d = addDaysUTC(dateOnlyUTC, -1);
  while (!isNyseTradingDayUTC(d)) d = addDaysUTC(d, -1);
  return d;
}

export function nextNyseTradingDayUTC(dateOnlyUTC: Date): Date {
  let d = addDaysUTC(dateOnlyUTC, 1);
  while (!isNyseTradingDayUTC(d)) d = addDaysUTC(d, 1);
  return d;
}

/**
 * Session date logic (ET):
 * - Resets at 4:00am ET on trading days (premarket open).
 * - If before 4:00am ET: session = previous NYSE trading day.
 * - If it's a weekend/holiday: session = next NYSE trading day.
 */
export function getNyseSessionDateKeyET(now: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));

  // Treat as date-only at noon UTC
  let todayUTC = dateUTC(y, m, d);

  // Before 4am ET => prior trading day
  if (hh < 4) {
    const prev = prevNyseTradingDayUTC(todayUTC);
    return toDateKeyUTC(prev);
  }

  // At/after 4am ET:
  // If today is a trading day => today
  if (isNyseTradingDayUTC(todayUTC)) return toDateKeyUTC(todayUTC);

  // Otherwise show the next trading session (weekend/holiday)
  const next = nextNyseTradingDayUTC(todayUTC);
  return toDateKeyUTC(next);
}

export function formatSessionPill(dateKey: string): string {
  const [yy, mm, dd] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}