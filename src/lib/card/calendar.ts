import { cleanTicketUrl } from "./tickets";

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
