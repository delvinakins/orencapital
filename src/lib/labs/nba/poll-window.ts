// src/lib/labs/nba/poll-window.ts
// Pure helper: define polling window in America/Los_Angeles.

export type PollWindow = {
  startHour: number; // 0-23
  endHour: number; // 0-23 (exclusive)
};

const DEFAULT_WINDOW: PollWindow = { startHour: 14, endHour: 22 }; // 2pm–10pm PST/PDT

function getHourInLosAngeles(d: Date): number {
  // Use Intl to avoid bundling tz libs. Works in Node runtimes.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hourPart = parts.find((p) => p.type === "hour")?.value;
  const hour = hourPart ? Number(hourPart) : NaN;
  return Number.isFinite(hour) ? hour : d.getHours(); // fallback
}

/**
 * True if we should poll providers right now.
 * Uses America/Los_Angeles local hour.
 */
export function inPollingWindow(now: Date, window: PollWindow = DEFAULT_WINDOW): boolean {
  const h = getHourInLosAngeles(now);
  const start = window.startHour;
  const end = window.endHour;

  // Simple non-wrapping window (14..22). If you ever wrap across midnight, adjust.
  return h >= start && h < end;
}