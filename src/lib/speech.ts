import { creditLines, STATION_NAMES } from "@/lib/card/song";
import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { PublicEvent, When } from "@/lib/fieldGuide";
import type { DigestItem, FindRow, FollowResult, RecallResult, SavedFind, Station, StationShow, TrackFacts, UnfollowResult } from "@/lib/playlist";
import { localClock } from "@/lib/stationTime";
import { streetAddress } from "@/lib/maps";
import { SITE } from "@/lib/card/tokens";
import { getStation } from "@/lib/stations";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
export const PLAYLIST_UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's playlist right now. Please try again in a moment.";
// Amazon runs linking: a device with a screen shows a QR code, a speaker sends a notice to the Alexa app. We can't tell
// which device asked, so one sentence names both.
const LINK_HOW = "link your Radio Milwaukee account: scan the QR code if your device shows one, or open the notice Alexa sends to the Alexa app on your phone.";
export const LINK_ACCOUNT_SPEECH = `To save songs and follow artists, ${LINK_HOW}`;
export const LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH = `To manage your membership, ${LINK_HOW}`;
/** The account-linking prompt for one tool: membership tools say so; every other tool keeps the shared prompt. */
const MEMBERSHIP_TOOLS = new Set(["cancel_membership", "my_membership"]);
export const linkAccountSpeech = (tool: string) => (MEMBERSHIP_TOOLS.has(tool) ? LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH : LINK_ACCOUNT_SPEECH);
export const NOT_FOUND_SPEECH = "I couldn't find that Radio Milwaukee story.";
export const NOT_ALLOWED_SPEECH = "Detailed answers aren't available for this episode.";
export const NO_PASSAGE_SPEECH = "I couldn't find that in the episode.";
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
export const listOf = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
// Which shows we cover comes from the station registry, so a new show is named without touching this line.
const NO_MATCH = `I couldn't find a Radio Milwaukee story about that. I can find stories from ${listOf(getStation().shows.map((show) => show.name))}.`;

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
 * One quote keeps the spoken answer short enough to say word for word; the rest are counted, never read.
 */
export const ARTICLE_SOURCE = { premiere: "Radio Milwaukee's premiere", session: "Radio Milwaukee's session write-up" } as const;

export function spokenPassages(passages: Passage[], contentType: Story["contentType"] = "episode"): string {
  if (passages.length === 0) return NO_PASSAGE_SPEECH;
  const [first] = passages;
  // An article has no timeline: say whose words they are, never a moment to play.
  if (contentType !== "episode") return `${ARTICLE_SOURCE[contentType]} says: '${first.text}'`;
  const more = passages.length - 1;
  const others = more === 0 ? "" : more === 1 ? " There's one more moment." : ` There are ${more} more moments.`;
  return `At ${clock(first.startMs)}, ${first.speaker ?? "the episode"} says: '${first.text}'${others} Want to hear that part?`;
}

export const NO_PLACES_SPEECH = "Radio Milwaukee hasn't mapped places for that story.";

/** The newest stories, numbered like the carousel so "the second one" works. */
export function spokenLatest(matches: StoryCardMatch[]): string {
  if (matches.length === 0) return "I couldn't find any recent Radio Milwaukee stories.";
  return `The newest Radio Milwaukee stories: ${matches.map((m, i) => `${i + 1}, ${m.title}, from ${source(m)}`).join("; ")}. Which one?`;
}

/** The mapped places, first three by name, matching the numbered map. */
export function spokenPlaces(names: string[], reservable?: string): string {
  if (names.length === 0) return NO_PLACES_SPEECH;
  if (names.length === 1) return `That story mentions one mapped place: ${names[0]}. Want directions?`;
  const first = names.slice(0, 3);
  const list = first.length === 2 ? first.join(" and ") : `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
  const booking = reservable ? ` ${reservable} takes reservations.` : "";
  return `That story mentions ${names.length} mapped places. The first ${first.length === 2 ? "two" : "three"} are ${list}.${booking} Want directions to one?`;
}

export const NO_PLACES_FOR_EVENTS_SPEECH = "Radio Milwaukee hasn't mapped places for that story. Where should I look?";
export const NEWSLETTER_UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's newsletter right now.";
export const NO_NEWSLETTER_SPEECH = "I don't have a recent Radio Milwaukee newsletter.";

/** The weekly briefing: up to four items, numbered like its list, each in the newsletter's own first sentence. */
export function spokenBriefing(date: string, items: { heading: string; summary: string }[]): string {
  const said = items.slice(0, 4).map((item, i) => `${i + 1}, ${item.heading}: ${item.summary}`).join(" ");
  return `This week at Radio Milwaukee, from the ${date} newsletter: ${said} Which one?`;
}

export const EVENTS_UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's event guide right now.";
const CALENDAR_OFFER = "Want to add one to your calendar?";
const MAX_SPOKEN_EVENTS = 3;
const PAGE_SIZE = 3; // Amazon: a voice list offers pagination; three is what a listener keeps in their head
const NUMBER_WORDS = ["", "one", "two", "three"];

/** One spoken page of a list: up to three items from where the last page stopped, and how many are left after it. */
export function listPage<T>(items: T[], page = 1) {
  const start = (page - 1) * PAGE_SIZE;
  return { start, said: items.slice(start, start + PAGE_SIZE), left: Math.max(0, items.length - start - PAGE_SIZE) };
}

/** "Want the next two?": how a speaker with no screen hears that the list goes on. */
export const nextOffer = (left: number) => (left <= 0 ? "" : ` Want the next ${NUMBER_WORDS[Math.min(left, PAGE_SIZE)]}?`);

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

const WHEN_PHRASE: Record<When, string> = { tonight: " tonight", today: " today", tomorrow: " tomorrow", "this-weekend": " this weekend", "this-week": " this week" };
const where = (e: PublicEvent) => (e.venue ? ` at ${e.venue.name}` : "");
// A later page keeps counting: its first item is number 4, so "save number 4" names what was said.
const numbered = (lines: string[], start = 0) => lines.map((line, i) => `${start + i + 1}, ${line}`).join("; ");

/** Three events a page, numbered like the list, each with its venue and time; honest when it had to look farther or found none. */
export function spokenEvents(events: PublicEvent[], { now, near, widened, when, page = 1 }: { now: Date; near?: string; widened?: boolean; when?: When; page?: number }): string {
  const whenPhrase = when ? WHEN_PHRASE[when] : "";
  if (events.length === 0) return near ? `I don't see anything near ${near}${whenPhrase}.` : `I don't see anything for that${whenPhrase}.`;
  const { start, said, left } = listPage(events, page);
  if (said.length === 0) return "That's all I found.";
  const lead = start > 0 ? "More from Radio Milwaukee's event guide: "
    : near ? (widened ? `Nothing within a mile of ${near}, but within three miles: ` : `Near ${near}: `) : "From Radio Milwaukee's event guide: ";
  const list = numbered(said.map((e) => `${e.title}${where(e)}, ${eventTime(e.startAt, now)}`), start);
  return `${lead}${list}.${left ? nextOffer(left) : ` ${CALENDAR_OFFER}`}`;
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

/** "The last 5 on 88Nine, newest first: 1, A; 2, B; 3, C. Want the next two?" Page 2: "Next on 88Nine: 4, D; 5, E." */
export function spokenRecent(stationName: string, songs: { artist: string; title: string }[], page = 1): string {
  if (songs.length === 0) return `I haven't logged any songs on ${stationName} yet.`;
  if (songs.length === 1) return `The last song on ${stationName} was "${songs[0].title}" by ${songs[0].artist}.`;
  const { start, said, left } = listPage(songs, page);
  if (said.length === 0) return `That's all of the last ${songs.length} on ${stationName}.`;
  const lead = start > 0 ? `Next on ${stationName}: ` : `The last ${songs.length} on ${stationName}, newest first: `;
  return `${lead}${numbered(said.map((song) => `"${song.title}" by ${song.artist}`), start)}.${nextOffer(left)}`;
}

const ON_AIR_MAX_WORDS = 45;
const ON_AIR_EXAMPLE_STATION = "HYFIN";
/** "88Nine Midday Show" → "Midday Show": Cadence names start with the station, which is redundant right after "88Nine". */
export const withoutStationName = (name: string) => name.replace(/^88Nine\s+/i, "") || name;
/** `show` is who's hosting (88Nine only, from its schedule). */
interface OnAirStation { station: Station; song: { title: string; artist: string } | null; show?: { name: string; hosts: string[] } | null }
/** "88Nine (Erin Wolf, Midday Show)", or just the station's name when its schedule says nothing. */
const onAirName = ({ station, show }: OnAirStation) =>
  show ? `${STATION_NAMES[station]} (${[listOf(show.hosts), withoutStationName(show.name)].filter(Boolean).join(", ")})` : STATION_NAMES[station];
const keepListening = (name: string) => `Say 'Alexa, play ${name}' to keep listening.`;
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function allOnAir(stations: OnAirStation[], withArtists: boolean): string {
  const said = (song: OnAirStation["song"]) => (song ? `"${song.title}"${withArtists ? ` by ${song.artist}` : ""}` : "live");
  const [first, ...rest] = stations;
  const lead = `${onAirName(first)} ${first.song ? `is playing ${said(first.song)}` : "is live"}`;
  const others = rest.map((row) => `; ${onAirName(row)}, ${said(row.song)}`).join("");
  return `On air now: ${lead}${others}. ${keepListening(ON_AIR_EXAMPLE_STATION)}`;
}

/** "On air now: 88Nine is playing … ; HYFIN, …": one station or all, ending with how to keep listening on Alexa's own player. */
export function spokenOnAir(stations: OnAirStation[]): string {
  if (stations.length === 1) {
    const [{ station, song }] = stations;
    const name = STATION_NAMES[station];
    return `${onAirName(stations[0])} ${song ? `is playing "${song.title}" by ${song.artist}` : "is live now"}. ${keepListening(name)}`;
  }
  // ponytail: artists are the only thing dropped; four very long titles can still run past the cap.
  const full = allOnAir(stations, true);
  return wordCount(full) <= ON_AIR_MAX_WORDS ? full : allOnAir(stations, false);
}

/** "Save number 3" on an on-air row that reads "Live now". */
export const noSongOnAirSpeech = (stationName: string) => `${stationName} doesn't have a song playing right now.`;

/** "Save that song" with several stations on air: ask which, never guess. Null when nothing is on air. */
export function whichOnAirSpeech(stations: OnAirStation[]): string | null {
  const choices = stations.flatMap(({ station, song }) => (song ? [`${STATION_NAMES[station]}'s "${song.title}"`] : []));
  if (choices.length === 0) return null;
  return `Which station's song: ${choices.length === 1 ? choices[0] : `${choices.slice(0, -1).join(", ")} or ${choices.at(-1)}`}?`;
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
  const base = saved.appleMusic === "pending" ? `${already}, and I'm adding it to Apple Music.` : `${already}.`;
  const hint = saved.appleMusic === "not_linked" && !saved.recentlySaved ? ` ${APPLE_HINT}` : "";
  return `${base}${savedExtras(saved)}${hint}`;
}

// radiomilwaukee.org/connect is a 404 (checked 2026-10-06); the connect page lives on this app.
const APPLE_CONNECT = `${new URL(SITE).host} slash connect slash apple-music`;
const APPLE_RECONNECT = `Apple Music needs reconnecting at ${APPLE_CONNECT}.`;
const APPLE_HINT = `To add these to your Apple Music library too, connect it at ${APPLE_CONNECT}.`;
const showDay = (ms: number) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);

/** " I'll keep an eye out for Thao — they play Turner Hall in Milwaukee on Friday, October 9, and we have their Studio Milwaukee story." Each part is optional. */
function savedExtras(saved: Extract<SavedFind, { status: "ok" }>): string {
  const follow = saved.firstFollow ? `I'll keep an eye out for ${saved.artistName}` : "";
  const show = saved.nextShow ? `they play ${saved.nextShow.venue} in ${saved.nextShow.city} on ${showDay(saved.nextShow.startsAtMs)}` : "";
  const story = saved.story ? `we have their ${saved.story.show} story` : "";
  const lead = follow ? (show ? `${follow} — ${show}` : follow) : show ? `${saved.artistName} ${show.replace(/^they play /, "plays ")}` : "";
  const sentence = story ? (lead ? `${lead}, and ${story}` : `We have a ${saved.story?.show} story about ${saved.artistName}`) : lead;
  return sentence ? ` ${sentence}.` : "";
}

export function spokenFinds(finds: FindRow[], page = 1): string {
  if (finds.length === 0) return "Your Finds are empty. After I name a song, say 'save it'.";
  const { start, said, left } = listPage(finds, page);
  if (said.length === 0) return "That's all your Finds.";
  const items = said.map((f) => `${f.label}: "${f.title}" by ${f.artist}`).join("; ");
  const reconnect = finds.some((f) => f.appleMusic.status === "expired") ? ` ${APPLE_RECONNECT}` : "";
  return `${start > 0 ? "More of your Finds" : "Your latest Finds"} — ${items}.${reconnect}${nextOffer(left)}`;
}

export function spokenDeleted({ deletedFinds, deletedLink }: { deletedFinds: number; deletedLink: boolean }): string {
  const finds = `${deletedFinds} ${deletedFinds === 1 ? "find" : "finds"}`;
  return `Done. I deleted ${finds}${deletedLink ? " and disconnected Apple Music" : ""}.`;
}

export const WHICH_ARTIST_TO_FOLLOW_SPEECH = "Which artist should I follow?";
export const WHICH_ARTIST_TO_UNFOLLOW_SPEECH = "Which artist should I stop following?";
const unknownArtist = (name: string) => `I don't have ${name} in our playlist yet.`;

/** `said` is the name the listener used; absent when they only gave a playId. */
export function spokenFollowed(result: FollowResult, said: string | undefined): string {
  if (result.status === "unknown_artist") return unknownArtist(said ?? "that artist");
  return result.firstFollow ? `I'll follow ${result.artistName}. Ask me what's new for you anytime.` : `You're already following ${result.artistName}.`;
}

export function spokenUnfollowed(result: UnfollowResult, said: string): string {
  if (result.status === "unknown_artist") return unknownArtist(said);
  if (result.status === "not_following") return `You're not following ${said}.`;
  return `Done — I won't keep an eye out for ${result.artistName} anymore.`;
}

export const EMPTY_DIGEST_NO_PICKS_SPEECH = "Nothing new from your artists yet.";
export const EMPTY_DIGEST_SPEECH = "Nothing new from your artists yet — here's what the station's excited about.";
const DIGEST_SPOKEN_ITEMS = 3;
const timesSaid = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);
const stationName = (slug: string) => STATION_NAMES[slug as Station] ?? slug;

function spokenDigestItem(item: DigestItem, isFirst: boolean): string {
  switch (item.kind) {
    case "show": return `${item.artist} plays ${item.venue} in ${item.city} on ${showDay(item.startsAtMs)}.`;
    case "spins": return `${listOf(item.byStation.map((s, i) => `${stationName(s.station)}${i === 0 ? ` played ${item.artist}` : ""} ${timesSaid(s.count)}`))}.`;
    case "story": return `${isFirst ? "" : "And "}there's a new ${item.show} story about ${item.artist}.`;
    case "apple": return [item.added > 0 ? `${item.added} of your saved songs ${item.added === 1 ? "is" : "are"} in Apple Music.` : "", item.expired > 0 ? APPLE_RECONNECT : ""].filter(Boolean).join(" ");
  }
}

/** The top few things that happened since the listener last asked, as one spoken run. */
export function spokenDigest(items: DigestItem[]): string {
  const spoken = items.slice(0, DIGEST_SPOKEN_ITEMS).map((item, i) => spokenDigestItem(item, i === 0)).filter(Boolean);
  return `Since your last visit: ${spoken.join(" ")}`;
}

const HOME_CITY = "milwaukee";
// ponytail: a date-only listing's time is a placeholder midnight, so its calendar day is read in UTC (right for UTC or Milwaukee midnight).
export const showCalendarDay = (show: Pick<StationShow, "startsAtMs" | "dateOnly">, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: show.dateOnly ? "UTC" : "America/Chicago" }).format(show.startsAtMs);

/** "Artists 88Nine has been playing with shows coming up: A at V in Madison, Tuesday, October 20; …. Want the next two?" */
export function spokenStationShows(shows: StationShow[], station: Station | undefined, page = 1): string {
  const who = station ? STATION_NAMES[station] : "Radio Milwaukee";
  if (shows.length === 0) return `None of the artists ${who} has been playing have shows listed right now.`;
  const { start, said: shown, left } = listPage(shows, page);
  if (shown.length === 0) return `That's all the shows for artists ${who} has been playing.`;
  const said = shown.map((show) => {
    const city = show.city.trim().toLowerCase() === HOME_CITY ? "" : ` in ${show.city}`;
    return `${show.artistName} at ${show.venueName}${city}, ${showCalendarDay(show, { weekday: "long", month: "long", day: "numeric" })}`;
  });
  const lead = start > 0 ? `More shows from artists ${who} has been playing: ` : `Artists ${who} has been playing with shows coming up: `;
  return `${lead}${said.join("; ")}.${nextOffer(left)}`;
}
