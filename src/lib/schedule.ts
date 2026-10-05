import { STATION_NAMES } from "@/lib/card/song";
import type { Airtime, HostCard, HostProfile, ScheduleProgram, ScheduleSlot, StationSchedule, Station } from "@/lib/playlist";
import { listOf, listPage, nextOffer, withoutStationName } from "@/lib/speech";

// Only 88Nine has a schedule; every line here is about it.
const TIME_ZONE = "America/Chicago";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEK = ["Sunday", ...WEEKDAYS, "Saturday"];
const DAY_MS = 86_400_000;
const EVENING_HOUR = 17;
const LAST_WEEK_DAYS = 7;

export const SCHEDULE_UNAVAILABLE_SPEECH = "I can't reach 88Nine's schedule right now. Please try again in a moment.";
const NO_SCHEDULE_SPEECH = "I don't have 88Nine's schedule right now.";
/** HYFIN, Rhythm Lab and 414 Music have no published schedule yet. */
export const noScheduleSpeech = (station: Station) => `I don't have ${STATION_NAMES[station]}'s schedule yet.`;

const partsOf = (ms: number) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
}).formatToParts(ms).map((part) => [part.type, part.value]));

/** "2 PM", "2:30 PM", "noon", "midnight"; without the meridiem ("until 2") when the context makes it plain. */
export function clockWords(ms: number, withMeridiem = true): string {
  const { hour, minute, dayPeriod } = partsOf(ms);
  if (hour === "12" && minute === "00") return dayPeriod === "AM" ? "midnight" : "noon";
  const time = minute === "00" ? hour : `${hour}:${minute}`;
  return withMeridiem ? `${time} ${dayPeriod}` : time;
}

/** The schedule writes "12 AM" and "12 PM"; a person says midnight and noon. */
const saidLabel = (label: string) => (label === "12 AM" ? "midnight" : label === "12 PM" ? "noon" : label);

function dayWords(days: string[]): string {
  const set = new Set(days);
  if (WEEK.every((day) => set.has(day))) return "every day";
  if (set.size === WEEKDAYS.length && WEEKDAYS.every((day) => set.has(day))) return "weekdays";
  if (set.size === 2 && set.has("Saturday") && set.has("Sunday")) return "weekends";
  const known = WEEK.filter((day) => set.has(day));
  return listOf((known.length ? known : [...set]).map((day) => `${day}s`));
}

/** "Fridays, 10 PM to midnight"; "weekdays, 10 AM to 2 PM"; different hours on different days joined with "and". */
export function weeklyTimes(airtimes: Airtime[]): string {
  const byHours = airtimes.reduce((groups, { day, start, end }) => {
    const hours = `${saidLabel(start)} to ${saidLabel(end)}`;
    return new Map(groups).set(hours, [...(groups.get(hours) ?? []), day]);
  }, new Map<string, string[]>());
  return listOf([...byHours].map(([hours, days]) => `${dayWords(days)}, ${hours}`));
}

const dayNumber = (ms: number) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(ms)) / DAY_MS;

/** "tonight at 10 PM", "yesterday at 10 PM", "Thursday at 10 PM" (this past week), "Thursday, October 8 at 10 PM". */
function airingWords(ms: number, now: Date, past: boolean): string {
  const days = Math.round(dayNumber(ms) - dayNumber(now.getTime()));
  const { weekday, month, day } = partsOf(ms);
  const at = `at ${clockWords(ms)}`;
  const evening = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(ms)) >= EVENING_HOUR;
  if (days === 0) return past ? `earlier today ${at}` : `${evening ? "tonight" : "today"} ${at}`;
  if (days === -1) return `yesterday ${at}`;
  if (days === 1) return `tomorrow ${at}`;
  if (past && days > -LAST_WEEK_DAYS) return `${weekday} ${at}`;
  return `${weekday}, ${month} ${day} ${at}`;
}

// ponytail: "the" only before names ending in "Show" ("the Midday Show", "Afternoon Drive"); a per-show article field if one reads wrong.
const showName = (name: string) => (/\bshow$/i.test(name) && !/^the\b/i.test(name) ? `the ${name}` : name);

function onNowLine(slot: ScheduleSlot): string {
  const until = `until ${clockWords(slot.endsAt, false)}`;
  if (!slot.hosts.length) return /^88Nine\b/i.test(slot.name) ? `${slot.name} is on ${until}.` : `${slot.name} is on 88Nine ${until}.`;
  return `${listOf(slot.hosts)} ${slot.hosts.length > 1 ? "are" : "is"} on ${showName(slot.name)} ${until}.`;
}

function nextLine(slot: ScheduleSlot, withTime: boolean): string {
  const name = withoutStationName(slot.name);
  const who = slot.hosts.length ? `${listOf(slot.hosts)} on ${showName(name)}` : name;
  return ` Next, ${who}${withTime ? ` at ${clockWords(slot.startsAt)}` : ""}.`;
}

const milwaukeeDay = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "long", day: "numeric" }).format(ms);

/** The host's newest piece, headline and date only, verbatim: "Latest from Erin Wolf, October 2: …". Pronoun-free. */
function latestLine(hosts: HostCard[] = []): string {
  const host = hosts.find((profile) => profile.latest.length > 0);
  if (!host) return "";
  const [piece] = host.latest;
  const published = typeof piece.publishedAt === "string" ? Date.parse(piece.publishedAt) : piece.publishedAt;
  const date = typeof published === "number" && Number.isFinite(published) ? `, ${milwaukeeDay(published)}` : "";
  return ` Latest from ${host.name}${date}: ${piece.title}${/[.!?]$/.test(piece.title) ? "" : "."}`;
}

/** "Erin Wolf is on the 88Nine Midday Show until 2. Next, Carolann Grzybowski on Afternoon Drive. Latest from Erin Wolf, …" */
export function spokenOnNow({ onNow, next }: Pick<StationSchedule, "onNow" | "next">): string {
  if (!onNow && !next) return NO_SCHEDULE_SPEECH;
  if (!onNow) return `88Nine doesn't have a host on right now.${nextLine(next!, true)}`;
  return `${onNowLine(onNow)}${next ? nextLine(next, false) : ""}${latestLine(onNow.hostProfiles)}`;
}

// "88Nine Weekends with Mallory Wallace" already names its host; don't say it twice.
const hostsSuffix = ({ name, hosts }: ScheduleProgram) =>
  hosts.length && !hosts.every((host) => name.toLowerCase().includes(host.toLowerCase())) ? ` with ${listOf(hosts)}` : "";

// `stationSaid`: the sentence already named 88Nine ("On 88Nine's schedule: …"), so the name drops its "88Nine " prefix.
const programLine = (program: ScheduleProgram, stationSaid = false) =>
  `${stationSaid ? withoutStationName(program.name) : program.name}${hostsSuffix(program)} ${program.airtimes.length ? `airs ${weeklyTimes(program.airtimes)}` : "isn't on the weekly schedule"}`;

/** " It's on now." or " It aired Thursday at 10 PM; next is Thursday, October 8 at 10 PM." (either half alone when that's all there is). */
function statusLine(program: ScheduleProgram, now: Date): string {
  if (program.airingNow) return " It's on now.";
  const aired = program.lastAired ? `It aired ${airingWords(program.lastAired.startsAt, now, true)}` : "";
  const next = program.nextAiring ? `${aired ? "next is" : "Next is"} ${airingWords(program.nextAiring.startsAt, now, false)}` : "";
  return aired || next ? ` ${[aired, next].filter(Boolean).join("; ")}.` : "";
}

/** When a show or host is on. One match also says whether it already aired; several are spoken three at a time. */
export function spokenPrograms(query: string, matches: ScheduleProgram[], now: Date, page = 1): string {
  if (matches.length === 0) return `I couldn't find "${query}" on 88Nine's schedule.`;
  if (matches.length === 1) return `${programLine(matches[0])}.${statusLine(matches[0], now)}`;
  const { start, said, left } = listPage(matches, page);
  if (said.length === 0) return "That's all the shows I found on 88Nine's schedule.";
  const lead = start > 0 ? "More from 88Nine's schedule: " : "On 88Nine's schedule: ";
  return `${lead}${said.map((program) => programLine(program, true)).join("; ")}.${nextOffer(left)}`;
}

// A host's "latest" piece older than this isn't news (one host's only byline is from 2016); undated pieces are dropped too.
const LATEST_MAX_AGE_MS = 90 * DAY_MS;
const publishedMs = (published: number | string | null | undefined) => (typeof published === "string" ? Date.parse(published) : published ?? Number.NaN);
const freshHost = <H extends HostCard>(host: H, now: Date): H =>
  ({ ...host, latest: host.latest.filter((piece) => now.getTime() - publishedMs(piece.publishedAt) <= LATEST_MAX_AGE_MS) });
const freshItem = <T extends { hostProfiles?: HostCard[] }>(item: T, now: Date): T =>
  (item.hostProfiles ? { ...item, hostProfiles: item.hostProfiles.map((host) => freshHost(host, now)) } : item);

/** The schedule and host profile with only the last 90 days of "latest" pieces, so nothing older is spoken or shown. */
export function withFreshLatest(schedule: StationSchedule, profile: HostProfile, now: Date): { schedule: StationSchedule; profile: HostProfile } {
  const fresh = <T extends { hostProfiles?: HostCard[] }>(item: T | null) => (item ? freshItem(item, now) : null);
  return {
    schedule: { ...schedule, onNow: fresh(schedule.onNow), next: fresh(schedule.next), match: fresh(schedule.match), matches: schedule.matches.map((program) => freshItem(program, now)) },
    profile: profile ? freshHost(profile, now) : null,
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The shows to answer with: the schedule's matches (each given the host's profile when it has none of its own), else the
 * host profile's own shows, for a host the schedule search missed.
 */
export function programsFrom(schedule: StationSchedule, profile: HostProfile): ScheduleProgram[] {
  const found = schedule.matches.length ? schedule.matches : schedule.match ? [schedule.match] : [];
  if (!profile) return found;
  if (found.length === 0) {
    return profile.programs.map(({ name, airtimes }) => ({ name, hosts: [profile.name], airtimes, lastAired: null, nextAiring: null, airingNow: false, hostProfiles: [profile] }));
  }
  return found.map((program) =>
    !program.hostProfiles?.length && program.hosts.some((host) => sameName(host, profile.name)) ? { ...program, hostProfiles: [profile] } : program);
}
