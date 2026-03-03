import { NextResponse } from "next/server";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Convert "now" to ET components
function getETParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // en-CA gives YYYY-MM-DD ordering in parts reliably
  const parts = fmt.formatToParts(d);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  const weekday = pick("weekday"); // Mon, Tue...
  const hour = Number(pick("hour"));
  const minute = Number(pick("minute"));

  return { year, month, day, weekday, hour, minute };
}

function etDateString(p: { year: number; month: number; day: number }) {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// Minimal “trading day” check: Mon–Fri
// (If you want holiday-perfect, we can upgrade this route to use an exchange calendar feed you already have.)
function isWeekday(weekday: string) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
}

// Step back one day in ET (approx via UTC date math, then re-read ET parts)
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export async function GET() {
  try {
    const now = new Date();
    const et = getETParts(now);

    // If before 4:00am ET, the “session date” should be the prior trading day
    const beforeReset = et.hour < 4;

    let sessionDate = now;

    if (beforeReset) {
      sessionDate = addDays(now, -1);
    }

    // If weekend, roll back to Friday for session date
    // (This keeps the pill correct for most cases.)
    let sessET = getETParts(sessionDate);
    if (sessET.weekday === "Sun") sessionDate = addDays(sessionDate, -2);
    if (sessET.weekday === "Sat") sessionDate = addDays(sessionDate, -1);

    sessET = getETParts(sessionDate);

    // Next reset time:
    // - if before 4am ET AND today is weekday => today 4am ET
    // - else => next weekday at 4am ET
    let resetBase = now;
    let resetET = getETParts(resetBase);

    if (beforeReset && isWeekday(et.weekday)) {
      // today at 4am ET
    } else {
      // move to next day
      resetBase = addDays(now, 1);
      resetET = getETParts(resetBase);

      // if weekend, jump to Monday
      if (resetET.weekday === "Sat") resetBase = addDays(resetBase, 2);
      if (resetET.weekday === "Sun") resetBase = addDays(resetBase, 1);
    }

    // Build an ISO-like string for “4:00am ET” display
    const resetETParts = getETParts(resetBase);
    const resetAtET = `${resetETParts.year}-${pad2(resetETParts.month)}-${pad2(
      resetETParts.day
    )} 04:00 ET`;

    const sessionDateET = etDateString(sessET);
    const label = `${sessET.weekday} • ${sessionDateET}`;

    return NextResponse.json({
      ok: true,
      sessionDateET,
      resetAtET,
      label,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "session route failed" },
      { status: 500 }
    );
  }
}