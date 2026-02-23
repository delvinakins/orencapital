// src/lib/labs/nba/poll-window.ts

const PT_TZ = "America/Los_Angeles";

function partsPT(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const wd = String(parts.find((p) => p.type === "weekday")?.value ?? "Mon");
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { wd, minutes: hh * 60 + mm };
}

/**
 * Polling window (PT):
 * - Weekdays: start 3:30pm (covers 4pm tips + pregame)
 * - Weekends: start 8:00am (matinees)
 * - End: 11:59pm
 */
export function inPollingWindow(now: Date): boolean {
  const { wd, minutes } = partsPT(now);
  const isWeekend = wd === "Sat" || wd === "Sun";
  const start = isWeekend ? 8 * 60 : 15 * 60 + 30;
  const end = 23 * 60 + 59;
  return minutes >= start && minutes <= end;
}