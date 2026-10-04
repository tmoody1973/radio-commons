export const STATION_TIME_ZONE = "America/Chicago";

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;
const zoneParts = new Intl.DateTimeFormat("en-US", {
  timeZone: STATION_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
});

/** The zone's wall-clock fields at an instant, read back as if they were UTC. */
function wallClockAsUtc(ms: number): number {
  const p = Object.fromEntries(zoneParts.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Converts a wall-clock time (given as UTC fields) to the real instant. Two passes settle DST edges. */
function instantFromWallClock(wallAsUtc: number): number {
  const first = wallAsUtc - (wallClockAsUtc(wallAsUtc) - wallAsUtc);
  return wallAsUtc - (wallClockAsUtc(first) - first);
}

function minutesOfDay(time: string): number {
  const match = HH_MM.exec(time);
  if (!match) throw new Error(`Time must be 24-hour HH:MM, got "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** HH:MM on today's or yesterday's Milwaukee date as epoch ms; an end before the start means the window crosses midnight. */
export function localWindow(input: { day: "today" | "yesterday"; startTime: string; endTime: string }, now: Date): { from: number; to: number } {
  const start = minutesOfDay(input.startTime);
  const end = minutesOfDay(input.endTime);
  const localMidnight = Math.floor(wallClockAsUtc(now.getTime()) / DAY_MS) * DAY_MS - (input.day === "yesterday" ? DAY_MS : 0);
  const endOffset = end < start ? end * 60_000 + DAY_MS : end * 60_000;
  return { from: instantFromWallClock(localMidnight + start * 60_000), to: instantFromWallClock(localMidnight + endOffset) };
}

/** e.g. "8:12 a.m." in Milwaukee time. */
export function localClock(ms: number): string {
  const wall = new Date(wallClockAsUtc(ms));
  const hour = wall.getUTCHours();
  const minutes = String(wall.getUTCMinutes()).padStart(2, "0");
  return `${hour % 12 || 12}:${minutes} ${hour < 12 ? "a.m." : "p.m."}`;
}
