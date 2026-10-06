import { cleanTicketUrl } from "./tickets";
import { withoutStationName } from "@/lib/speech";

const GOOGLE_CALENDAR = "https://calendar.google.com/calendar/render";
const SHOW_LENGTH_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarShow {
  artist: string;
  venue: string;
  city: string;
  startsAtMs: number;
  dateOnly?: boolean;
  ticketUrl?: string | null;
}

/** 20261005T140000Z: the instant in UTC, Google's timed-event format. */
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** 20261024: a calendar day. A date-only listing's time is a placeholder midnight, read in UTC like showCalendarDay. */
const dayStamp = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

/** A Google Calendar "add event" link for a concert, in the same shape as the Field Guide's event links. */
export function showCalendarUrl(show: CalendarShow): string {
  const dates = show.dateOnly
    ? `${dayStamp(show.startsAtMs)}/${dayStamp(show.startsAtMs + DAY_MS)}`
    : `${utcStamp(show.startsAtMs)}/${utcStamp(show.startsAtMs + SHOW_LENGTH_MS)}`;
  const details = cleanTicketUrl(show.ticketUrl);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${show.artist} at ${show.venue}`,
    dates,
    ...(details ? { details } : {}),
    location: `${show.venue}, ${show.city}`,
    ctz: "America/Chicago",
  });
  return `${GOOGLE_CALENDAR}?${params}`;
}

const TIME_ZONE = "America/Chicago";
const MINUTE_MS = 60_000;
const DAYS_IN_WEEK = 7;
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const STATION_LOCATION = "88Nine Radio Milwaukee";

export interface CalendarProgram {
  name: string;
  hosts: string[];
  link?: string | null;
  hostProfiles?: { profileUrl?: string | null }[];
  nextAiring?: { startsAt: number; endsAt: number } | null;
}
/** Only the fields a weekly event needs; the schedule's airtimes carry them as optional. */
export interface CalendarAirtime { dayOfWeek?: number; startMin?: number; endMin?: number; [extra: string]: unknown }

interface Clock { year: number; month: number; day: number; weekday: number; minuteOfDay: number }

const chicagoParts = (ms: number) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
}).formatToParts(ms).map((part) => [part.type, part.value]));

function chicagoClock(ms: number): Clock {
  const parts = chicagoParts(ms);
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const chicagoOffsetMs = (ms: number) => {
  const { year, month, day, minuteOfDay } = chicagoClock(ms);
  return Date.UTC(year, month - 1, day, 0, minuteOfDay) - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
};

/** The UTC instant of a Milwaukee wall-clock time; minutes past 1440 roll into the next day. Offset is re-read at the result so DST days resolve. */
function chicagoWallToUtc({ year, month, day }: Clock, minutes: number): number {
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  const guess = naive - chicagoOffsetMs(naive);
  return naive - chicagoOffsetMs(guess);
}

const hasTimes = (airtime: CalendarAirtime): airtime is Required<CalendarAirtime> =>
  airtime.dayOfWeek !== undefined && airtime.startMin !== undefined && airtime.endMin !== undefined;

/** The first start after `now` of any of these weekdays at one wall-clock time, with its end. */
function nextOccurrence(airtimes: Required<CalendarAirtime>[], now: Date) {
  const today = chicagoClock(now.getTime());
  const { startMin, endMin } = airtimes[0];
  for (let ahead = 0; ahead <= DAYS_IN_WEEK; ahead += 1) {
    const date = chicagoClock(Date.UTC(today.year, today.month - 1, today.day + ahead, 12));
    if (!airtimes.some((airtime) => airtime.dayOfWeek === date.weekday)) continue;
    const startsAt = chicagoWallToUtc(date, startMin);
    if (startsAt > now.getTime()) return { startsAt, endsAt: chicagoWallToUtc(date, endMin) };
  }
  throw new Error("No upcoming airing found within a week");
}

/** nextAiring is the schedule's own answer; trust it only when it is one of the airtimes being added. */
function matchingNextAiring(program: CalendarProgram, airtimes: Required<CalendarAirtime>[]) {
  const next = program.nextAiring;
  if (!next) return null;
  const { weekday, minuteOfDay } = chicagoClock(next.startsAt);
  return airtimes.some((airtime) => airtime.dayOfWeek === weekday && airtime.startMin === minuteOfDay) ? next : null;
}

/**
 * A Google Calendar link that repeats a show weekly on the given airtimes (which share one start and end), so the listener's
 * own calendar does the reminding. Null when no airtime carries machine-readable times.
 */
export function programCalendarUrl(program: CalendarProgram, airtimes: CalendarAirtime[], now: Date): string | null {
  const usable = airtimes.filter(hasTimes);
  if (usable.length === 0) return null;
  const { startsAt, endsAt } = matchingNextAiring(program, usable) ?? nextOccurrence(usable, now);
  const hosts = program.hosts.length ? `Hosted by ${program.hosts.join(" & ")}` : "";
  const page = cleanTicketUrl(program.link ?? program.hostProfiles?.find((host) => host.profileUrl)?.profileUrl);
  const details = [hosts, page].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${withoutStationName(program.name)} on 88Nine`,
    dates: `${utcStamp(startsAt)}/${utcStamp(endsAt)}`,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(usable.map((airtime) => BYDAY[airtime.dayOfWeek]))].join(",")}`,
    ...(details ? { details } : {}),
    location: STATION_LOCATION,
    ctz: TIME_ZONE,
  });
  return `${GOOGLE_CALENDAR}?${params}`;
}

/** A schedule slot (the hero's "Up next") repeats weekly at the same weekday and time. */
export function slotCalendarUrl(slot: CalendarProgram & { startsAt: number; endsAt: number }, now: Date): string | null {
  const { weekday, minuteOfDay } = chicagoClock(slot.startsAt);
  const airtime = { dayOfWeek: weekday, startMin: minuteOfDay, endMin: minuteOfDay + Math.round((slot.endsAt - slot.startsAt) / MINUTE_MS) };
  return programCalendarUrl({ ...slot, nextAiring: slot }, [airtime], now);
}
