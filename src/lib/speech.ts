import { creditLines } from "@/lib/card/song";
import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { PublicEvent, When } from "@/lib/fieldGuide";
import type { FindRow, RecallResult, SavedFind, TrackFacts } from "@/lib/playlist";
import { localClock } from "@/lib/stationTime";
import { streetAddress } from "@/lib/maps";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
export const PLAYLIST_UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's playlist right now. Please try again in a moment.";
export const LINK_ACCOUNT_SPEECH = "Link your Radio Milwaukee account to save songs.";
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
export const longDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const listOf = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** A premiere: the song, its album and date when known; offers it when it can play. */
function spokenPremiere(story: Story): string {
  const song = story.song!;
  const name = song.title ? `${song.artist}, '${song.title}'` : song.artist;
  const album = song.album ? `, from their album ${song.album}${song.releaseDate ? `, out ${longDate(song.releaseDate)}` : ""}` : "";
  return `From Radio Milwaukee's ${source(story)}: ${name}${album}. ${song.audioUrl ? "Want to hear it?" : "Want to read about it?"}`;
}

/** A session: who played and up to three songs from the set; the page is where to watch. */
function spokenSession(story: Story): string {
  const song = story.song!;
  const set = song.setList?.length ? ` played ${listOf(song.setList.slice(0, 3))}` : " played a session";
  return `From Radio Milwaukee's ${source(story)}: ${song.artist}${set}. ${story.summary} The session is on radiomilwaukee.org.`;
}

export function spokenStory(story: Story): string {
  if (story.contentType === "premiere" && story.song) return spokenPremiere(story);
  if (story.contentType === "session" && story.song) return spokenSession(story);
  if (story.contentType !== "episode") return `From Radio Milwaukee's ${source(story)}: ${story.summary} It's on radiomilwaukee.org.`;
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
export const ARTICLE_SOURCE = { premiere: "Radio Milwaukee's premiere", session: "Radio Milwaukee's session write-up" } as const;

export function spokenPassages(passages: Passage[], contentType: Story["contentType"] = "episode"): string {
  if (passages.length === 0) return NO_PASSAGE_SPEECH;
  const [first] = passages;
  // An article has no timeline: say whose words they are, never a moment to play.
  if (contentType !== "episode") return `${ARTICLE_SOURCE[contentType]} says: '${first.text}'`;
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
    // The Field Guide's Concert Picks import gives listed shows without a write-up this stock blurb: say the source instead.
    if (e.pick && e.pick.blurb.startsWith("On Radio Milwaukee's MKE Concert Picks")) return `${e.pick.curator} picks ${base}, from Radio Milwaukee's MKE Concert Picks`;
    if (e.pick) return `${e.pick.curator} picks ${base}: "${firstSentenceOf(e.pick.blurb)}"`;
    // Station listings are often titled "88Nine presents: …"; don't say "presents" twice.
    return `Radio Milwaukee presents ${base.replace(/^(88nine|hyfin|radio milwaukee|414 music|rhythm lab)\s+presents:?\s*/i, "")}`;
  });
  return `${numbered(lines)}. ${CALENDAR_OFFER}`;
}

const firstSentenceOf = (text: string) => text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;

export function spokenRecall(result: RecallResult): string {
  const [top, ...rest] = result.matches;
  if (result.status === "unknown_station") return "I don't know that station.";
  if (!top) return "I couldn't find anything Radio Milwaukee played then. Try a wider time.";
  const lead = `That was likely "${top.title}" by ${top.artist}, at ${localClock(top.playedAt)}`; // the clock already ends in "p.m." / "a.m."
  if (result.status === "ok") return lead;
  const others = rest.map((m) => `"${m.title}" by ${m.artist}`).join(", or ");
  const caveat = result.status === "cues_unchecked" ? " I couldn't check that detail, so here's what played around then." : "";
  return `${lead}${caveat}${others ? ` Or it might be ${others}.` : ""}`;
}

export function spokenTrackFacts(facts: TrackFacts): string {
  if (facts.status !== "ok") return "I don't have more on that song.";
  const f = facts as TrackFacts & { title?: string; artist?: string; year?: number | null; label?: string | null };
  const producedBy = creditLines(facts).find((line) => line.startsWith("Produced by"));
  const details = [f.year ? `released in ${f.year}` : null, f.label ? `on ${f.label}` : null, producedBy ? producedBy.replace("Produced", "produced") : null].filter(Boolean).join(", ");
  return `"${f.title}" by ${f.artist}${details ? `, ${details}` : ""}.`;
}

const SPOKEN_LIST_MAX = 3; // longer spoken lists lose listeners; the screen carries the rest

/** "The last 5 on 88Nine, newest first: A, B, C, and 2 more on screen." */
export function spokenRecent(stationName: string, songs: { artist: string; title: string }[]): string {
  if (songs.length === 0) return `I haven't logged any songs on ${stationName} yet.`;
  const said = songs.slice(0, SPOKEN_LIST_MAX).map((song) => `"${song.title}" by ${song.artist}`);
  if (songs.length === 1) return `The last song on ${stationName} was ${said[0]}.`;
  const rest = songs.length - said.length;
  return `The last ${songs.length} on ${stationName}, newest first: ${said.join(", ")}${rest ? `, and ${rest} more on screen` : ""}.`;
}

const milwaukeeDay = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);

/** "'One Mic' by Nas last played on HYFIN, October 3 at 3:16 a.m." (or "today at …"). */
export function spokenSearch(query: string, top: { artist: string; title: string; playedAt: number; stationName: string } | undefined, now: Date): string {
  if (!top) return `Radio Milwaukee's stations haven't played "${query}" lately.`;
  const day = milwaukeeDay(top.playedAt) === milwaukeeDay(now.getTime()) ? "today" : milwaukeeDay(top.playedAt);
  return `"${top.title}" by ${top.artist} last played on ${top.stationName}, ${day} at ${localClock(top.playedAt)}`; // the clock ends in "a.m." / "p.m."
}

export function spokenSaved(saved: SavedFind): string {
  if (saved.status === "not_found") return "I couldn't find that play anymore — which song did you mean?";
  const already = saved.alreadySaved ? "It was already in your Finds, so I moved it to the top" : `Saved "${saved.title}" by ${saved.artist} to your 88Nine Finds`;
  return saved.appleMusic === "pending" ? `${already}, and I'm adding it to Apple Music.` : `${already}.`;
}

export function spokenFinds(finds: FindRow[]): string {
  if (finds.length === 0) return "Your Finds are empty. After I name a song, say 'save it'.";
  const items = finds.map((f) => `${f.label}: "${f.title}" by ${f.artist}`).join("; ");
  const reconnect = finds.some((f) => f.appleMusic.status === "expired") ? " Apple Music needs reconnecting at radiomilwaukee.org slash connect." : "";
  return `Your latest Finds — ${items}.${reconnect}`;
}

export function spokenDeleted({ deletedFinds, deletedLink }: { deletedFinds: number; deletedLink: boolean }): string {
  const finds = `${deletedFinds} ${deletedFinds === 1 ? "find" : "finds"}`;
  return `Done. I deleted ${finds}${deletedLink ? " and disconnected Apple Music" : ""}.`;
}
