import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { PublicEvent, When } from "@/lib/fieldGuide";
import { streetAddress } from "@/lib/maps";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
export const NOT_FOUND_SPEECH = "I couldn't find that Radio Milwaukee story.";
export const NOT_ALLOWED_SPEECH = "Detailed answers aren't available for this episode.";
export const NO_PASSAGE_SPEECH = "I couldn't find that in the episode.";
const NO_MATCH = "I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood.";
const PODTRAC = /^https?:\/\/dts\.podtrac\.com\/redirect\.mp3\//;

export function monthYear(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" }).format(ms);
}

/** Podtrac is a download-counting hop that ad blockers block; Dovetail behind it serves the same file. */
export function directAudioUrl(url: string): string {
  return PODTRAC.test(url) ? url.replace(PODTRAC, "https://") : url;
}

const source = (item: { show: string; publishedAt: number }) => `${item.show}, ${monthYear(item.publishedAt)}`;

export function spokenMatches(matches: StoryCardMatch[]): string {
  if (matches.length === 0) return NO_MATCH;
  // A story found in its transcript carries where: "Mentioned at 10:45: …".
  const where = (m: StoryCardMatch) => (m.hint.startsWith("Mentioned at ") ? ` ${m.hint}` : "");
  if (matches.length === 1) return `I found one Radio Milwaukee story: ${matches[0].title}, from ${source(matches[0])}.${where(matches[0])}`;
  const list = matches.map((m, i) => `${i + 1}, ${m.title}, from ${source(m)}`).join("; ");
  return `I found ${matches.length} Radio Milwaukee stories: ${list}. Which one?`;
}

/** Summary labeled as the station's, its source, and one next step: directions to a pinned place, else the episode. */
export function spokenStory(story: Story): string {
  const place = story.places.find((p) => p.lat !== null && p.lng !== null);
  const street = streetAddress(place?.address, place?.name);
  const offer = place
    ? `Would you like directions to ${place.name}${street ? ` at ${street}` : ""}, or to hear the episode?`
    : "Would you like to hear the episode?";
  return `From ${source(story)}: Radio Milwaukee's summary says, ${story.summary} ${offer}`;
}

/** When in the episode: "18:42", or "1:02:05" past an hour. */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The first passage in the episode's own words, with its moment and (only if an editor confirmed it) who said it.
 * One quote keeps the spoken answer short enough to say word for word; the card shows every passage.
 */
export function spokenPassages(passages: Passage[]): string {
  if (passages.length === 0) return NO_PASSAGE_SPEECH;
  const [first] = passages;
  const more = passages.length - 1;
  const onScreen = more === 0 ? "" : more === 1 ? " One more moment is on the screen." : ` ${more} more moments are on the screen.`;
  return `At ${clock(first.startMs)}, ${first.speaker ?? "the episode"} says: '${first.text}'${onScreen} Want to hear that part?`;
}

export const NO_PLACES_SPEECH = "Radio Milwaukee hasn't mapped places for that story.";

/** The newest stories, numbered like the carousel so "the second one" works. */
export function spokenLatest(matches: StoryCardMatch[]): string {
  if (matches.length === 0) return "I couldn't find any recent Radio Milwaukee stories.";
  return `The newest Radio Milwaukee stories: ${matches.map((m, i) => `${i + 1}, ${m.title}, from ${source(m)}`).join("; ")}. Which one?`;
}

/** The mapped places, first three by name, matching the numbered list on screen. */
export function spokenPlaces(names: string[], reservable?: string): string {
  if (names.length === 0) return NO_PLACES_SPEECH;
  if (names.length === 1) return `That story mentions one mapped place: ${names[0]}. Want directions?`;
  const first = names.slice(0, 3);
  const list = first.length === 2 ? first.join(" and ") : `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
  const booking = reservable ? ` ${reservable} takes reservations; tap Reserve to book.` : "";
  return `That story mentions ${names.length} mapped places. The first ${first.length === 2 ? "two" : "three"} are ${list}.${booking} Want directions to one?`;
}

export const NO_PLACES_FOR_EVENTS_SPEECH = "Radio Milwaukee hasn't mapped places for that story. Where should I look?";
export const EVENTS_UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's event guide right now.";
const CALENDAR_OFFER = "Want to add one to your calendar?";
const MAX_SPOKEN_EVENTS = 3;

const chicago = (ms: number) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false, weekday: "long",
  }).formatToParts(ms).map((p) => [p.type, p.value]));
  return { day: Date.UTC(+parts.year, +parts.month - 1, +parts.day), hour: +parts.hour % 24, minute: +parts.minute, weekday: parts.weekday };
};

/** "tonight at 8 PM", "tomorrow at 2 PM", "Tuesday at 7 PM", "October 19 at 7 PM": Milwaukee time, the way a person says it. */
export function eventTime(startAt: string, now: Date): string {
  const at = chicago(Date.parse(startAt));
  const today = chicago(now.getTime());
  const days = Math.round((at.day - today.day) / 86_400_000);
  const hour12 = at.hour % 12 === 0 ? 12 : at.hour % 12;
  const time = at.hour === 0 && at.minute === 0 ? "midnight" : `${hour12}${at.minute ? `:${String(at.minute).padStart(2, "0")}` : ""} ${at.hour < 12 ? "AM" : "PM"}`;
  // Night runs past midnight: at 10 PM a 12:30 AM show is still "tonight", and so is 2 AM when it's 1:30 AM.
  const lateNight = (days === 1 && at.hour < 3 && today.hour >= 17) || (days === 0 && at.hour < 5 && today.hour < 5);
  const day = lateNight ? "tonight" : days === 0 ? (at.hour >= 17 ? "tonight" : "today")
    : days === 1 ? "tomorrow"
      : days > 1 && days < 7 ? at.weekday
        : new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric" }).format(Date.parse(startAt));
  return `${day} at ${time}`;
}

const WHEN_PHRASE: Record<When, string> = { tonight: " tonight", today: " today", "this-weekend": " this weekend", "this-week": " this week" };
const where = (e: PublicEvent) => (e.venue ? ` at ${e.venue.name}` : "");
const numbered = (lines: string[]) => lines.map((line, i) => `${i + 1}, ${line}`).join("; ");

/** Up to three events, numbered like the screen, each with its venue and time; honest when it had to look farther or found none. */
export function spokenEvents(events: PublicEvent[], { now, near, widened, when }: { now: Date; near?: string; widened?: boolean; when?: When }): string {
  const whenPhrase = when ? WHEN_PHRASE[when] : "";
  if (events.length === 0) return near ? `I don't see anything near ${near}${whenPhrase}.` : `I don't see anything for that${whenPhrase}.`;
  const lead = near ? (widened ? `Nothing within a mile of ${near}, but within three miles: ` : `Near ${near}: `) : "From Radio Milwaukee's event guide: ";
  const list = numbered(events.slice(0, MAX_SPOKEN_EVENTS).map((e) => `${e.title}${where(e)}, ${eventTime(e.startAt, now)}`));
  return `${lead}${list}. ${CALENDAR_OFFER}`;
}

/** Staff picks in the curator's own words; station events as Radio Milwaukee's. */
export function spokenPicks(events: PublicEvent[], now: Date): string {
  if (events.length === 0) return "Radio Milwaukee doesn't have picks posted right now.";
  const lines = events.slice(0, MAX_SPOKEN_EVENTS).map((e) => {
    const base = `${e.title}${where(e)}, ${eventTime(e.startAt, now)}`;
    if (e.pick) return `${e.pick.curator} picks ${base}: "${firstSentenceOf(e.pick.blurb)}"`;
    // Station listings are often titled "88Nine presents: …"; don't say "presents" twice.
    return `Radio Milwaukee presents ${base.replace(/^(88nine|hyfin|radio milwaukee|414 music|rhythm lab)\s+presents:?\s*/i, "")}`;
  });
  return `${numbered(lines)}. ${CALENDAR_OFFER}`;
}

const firstSentenceOf = (text: string) => text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;
