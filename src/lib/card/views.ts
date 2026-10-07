import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { PlaylistItem, PlaylistSummary } from "@/lib/playlist";
import type { StationRequest } from "@/lib/requests";
import type { BriefingItem } from "@/lib/briefing";
import type { PublicEvent } from "@/lib/fieldGuide";
import type { Badge } from "@/lib/map/geo";
import type { Digest, DigestItem, FindRow, HostCard, RecentSong, SavedFind, ScheduleProgram, ScheduleSlot, Station, StationShow } from "@/lib/playlist";
import { LIVE_STREAMS } from "@/lib/streams";
import { CAPABILITIES } from "@/lib/capabilities";
import { dollars, LEVELS, type GiveKind } from "@/lib/give/tiers";
import { PREMIUMS } from "@/lib/give/premiums";
import type { MembershipFacts } from "@/lib/give";
import { pinnedPlaces } from "@/lib/map/staticMap";
import { directionsUrl, streetAddress } from "@/lib/maps";
import { ARTICLE_SOURCE, clock, longDate, monthYear, showCalendarDay, withoutStationName } from "@/lib/speech";
import { localClock } from "@/lib/stationTime";
import { clockWords, weeklyTimes } from "@/lib/schedule";
import { sizedArtwork, STATION_NAMES, type SongCard } from "./song";
import { showCalendarUrl, type CalendarShow } from "./calendar";
import { cleanTicketUrl } from "./tickets";
import { SITE } from "./tokens";

export interface MapData { url: string; w: number; h: number; badges: Badge[]; anchor?: { x: number; y: number; name: string } }
/** An event with its time already put into words ("tonight at 8 PM"), so rendering stays clock-free. */
export interface EventItem { event: PublicEvent; when: string }
export type SavedOk = Extract<SavedFind, { status: "ok" }>;
/** One station on the "On air now" card: its latest song (with "3 min ago" already in words), or null when there is no recent play. */
export interface OnAirTile { station: Station; song: (RecentSong & { when: string }) | null; show?: { name: string; hosts: string[] } | null }
export type CardView =
  | { view: "story"; story: Story; releaseEvent?: PublicEvent | null }
  | { view: "quote"; story: Story; passages: Passage[] }
  | { view: "stories"; matches: StoryCardMatch[] }
  | { view: "places"; story: Story; map: MapData }
  | { view: "events"; items: EventItem[] }
  | { view: "events-map"; items: EventItem[]; map: MapData }
  | { view: "song"; song: SongCard }
  | { view: "songs"; songs: SongCard[] }
  | { view: "digest"; artists: Digest["artists"]; items: DigestItem[] }
  | { view: "finds"; finds: FindRow[] }
  | { view: "station-shows"; shows: StationShow[] }
  | { view: "capabilities" }
  | { view: "on-air"; tiles: OnAirTile[] }
  /** 88Nine's schedule: matches when the listener named a show or host, else who's on now and next. */
  | { view: "schedule"; onNow: ScheduleSlot | null; next: ScheduleSlot | null; matches: ScheduleProgram[] }
  /** Artwork and preview are known only when the save went through a search hit; otherwise a plain tile. */
  | { view: "saved"; saved: SavedOk; artworkUrl: string | null; previewUrl: string | null }
  | { view: "briefing"; date: string; items: BriefingItem[] }
  /** links: tier id → its /give URL; qrSvg is our own QR code (from the qrcode library), placed as is. */
  /** selected: the tier id the listener asked for ("upgrade me to Front Row"), shown highlighted on its tab. */
  | { view: "give"; links: Record<string, string>; qrSvg: string; shortUrl: string; selected?: string }
  | ({ view: "membership" } & MembershipFacts)
  /** ChatGPT door only: a request preview whose Send carries the sealed token, and what happened after. */
  | { view: "request"; request: StationRequest; token: string }
  | { view: "request-status"; ok: boolean; title: string; detail: string }
  /** ChatGPT door only: the station home (sidebar entrypoint). finds is null when the listener isn't signed in. */
  | { view: "home"; tiles: OnAirTile[]; episodes?: StoryCardMatch[] | null; briefing: { date: string; items: BriefingItem[] } | null; finds: FindRow[] | null }
  /** ChatGPT door only: one listener playlist, and the list of them (rm-playlist-v2 #69). */
  | { view: "playlist"; playlistId: string; name: string; items: PlaylistItem[] }
  | { view: "playlists"; playlists: PlaylistSummary[] };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
const PIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const LOGO = `<img class="logo" src="${SITE}/brand/rm-logo.png" alt="Radio Milwaukee">`;
const dayMonth = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);
const art = (url: string | null, show: string, cls: string) =>
  url ? `<img class="${cls}" src="${escape(url)}" alt="${escape(show)} artwork">` : `<div class="${cls} ph" role="img" aria-label="${escape(show)}"></div>`;

/** "Ted's Ice Cream, El Tsunami, Bread House and 6 more places": one glanceable supporting field. */
function placesLine(story: Story): string {
  const names = story.places.map((p) => p.name);
  if (names.length === 0) return "";
  const more = names.length - 3;
  return names.slice(0, 3).join(", ") + (more > 0 ? ` and ${more} more place${more === 1 ? "" : "s"}` : "");
}

/** A premiere: the song, album and release date, credits, release show; ▶ plays the song when it may. */
function premiereView(story: Story, releaseEvent: PublicEvent | null): string {
  const song = story.song!;
  const head = song.title ? `${song.artist} — “${song.title}”` : song.artist;
  const sub = [song.album, song.releaseDate ? `out ${longDate(song.releaseDate)}` : null].filter(Boolean).join(" · ");
  const credits = song.credits.map((c) => `${c.name} (${c.role})`).join(", ");
  const show = song.releaseShow ? `Release show: ${song.releaseShow.venue}, ${longDate(song.releaseShow.date)}` : "";
  const read = (cls: string) => (story.permalink ? `<button type="button" class="${cls} details" data-url="${escape(story.permalink)}">Read the premiere</button>` : "");
  const primary = song.audioUrl ? `<button type="button" class="primary play" data-audio="${escape(song.audioUrl)}">${PLAY} Play song</button>` : read("primary");
  const secondary = releaseEvent
    ? `<button type="button" class="secondary calendar" data-url="${escape(releaseEvent.calendarUrl)}">${CAL} Add to calendar</button>`
    : song.audioUrl ? read("secondary") : "";
  return `<article class="card story music">${LOGO}<div class="body">${art(story.imageUrl, story.show, "art")}<div class="info">`
    + `<p class="meta">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p><h2>${escape(head)}</h2>`
    + (sub ? `<p class="line">${escape(sub)}</p>` : "")
    + (credits ? `<p class="line small">${escape(credits)}</p>` : "")
    + (show ? `<p class="line small">${escape(show)}</p>` : "")
    + `<div class="actions">${primary}${secondary}</div></div></div></article>`;
}

/** A session: who played and the set list; the session lives on radiomilwaukee.org, never as audio here (decision 012). */
function sessionView(story: Story): string {
  const set = (story.song?.setList ?? []).slice(0, 6).map((title) => `<li>${escape(title)}</li>`).join("");
  const watch = story.permalink ? `<button type="button" class="primary details" data-url="${escape(story.permalink)}">Watch on radiomilwaukee.org</button>` : "";
  return `<article class="card story music">${LOGO}<div class="body">${art(story.imageUrl, story.show, "art")}<div class="info">`
    + `<p class="meta">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p><h2>${escape(story.title)}</h2>`
    + (set ? `<ol class="setlist">${set}</ol>` : "")
    + `<div class="actions">${watch}</div></div></div></article>`;
}

/** A premiere or session with no approved song record: the article, never its audio. */
function articleView(story: Story): string {
  const read = story.permalink ? `<button type="button" class="primary details" data-url="${escape(story.permalink)}">Read it on radiomilwaukee.org</button>` : "";
  return `<article class="card story music">${LOGO}<div class="body">${art(story.imageUrl, story.show, "art")}<div class="info">`
    + `<p class="meta">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p><h2>${escape(story.title)}</h2>`
    + `<div class="actions">${read}</div></div></div></article>`;
}

function storyView(story: Story, releaseEvent: PublicEvent | null = null): string {
  if (story.contentType === "premiere" && story.song) return premiereView(story, releaseEvent);
  if (story.contentType === "session" && story.song) return sessionView(story);
  if (story.contentType !== "episode") return articleView(story);
  const pinned = pinnedPlaces(story);
  const secondary = pinned.length > 1
    ? `<button type="button" class="secondary ask" data-ask="Where are the places from that episode?" data-call="${escape(JSON.stringify({ name: "get_station_story", arguments: { storyId: story.storyId, view: "places" } }))}">${PIN} Places</button>`
    : pinned.length === 1
      ? `<button type="button" class="secondary directions" data-url="${escape(directionsUrl(pinned[0].name, pinned[0].address, pinned[0].lat, pinned[0].lng))}">${PIN} Directions</button>`
      : "";
  const line = placesLine(story);
  return `<article class="card story">${LOGO}<div class="body">${art(story.imageUrl, story.show, "art")}<div class="info">`
    + `<p class="meta">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p><h2>${escape(story.title)}</h2>`
    + (line ? `<p class="line">${escape(line)}</p>` : "")
    + `<div class="actions"><button type="button" class="primary play" data-audio="${escape(story.audioUrl)}">${PLAY} Play episode</button>${secondary}</div>`
    + `</div></div></article>`;
}

/** An article's words: no timeline to play from, so the card says whose words they are and offers the song or the page. */
function articleQuoteView(story: Story, first: Passage, contentType: "premiere" | "session"): string {
  const action = contentType === "premiere" && story.song?.audioUrl
    ? `<button type="button" class="primary play" data-audio="${escape(story.song.audioUrl)}">${PLAY} Play song</button>`
    : story.permalink ? `<button type="button" class="primary details" data-url="${escape(story.permalink)}">Read it on radiomilwaukee.org</button>` : "";
  return `<article class="card quote"><div class="top">${LOGO}<div class="source">${art(story.imageUrl, story.show, "thumb")}<span>${escape(story.show)} · ${escape(story.title)}</span></div></div>`
    + `<div class="said"><p class="meta">From ${escape(ARTICLE_SOURCE[contentType])}</p>`
    + `<blockquote${first.text.length > 180 ? ' class="q-long"' : first.text.length > 90 ? ' class="q-mid"' : ""}>“${escape(first.text)}”</blockquote></div>`
    + `<div class="actions">${action}</div></article>`;
}

function quoteView(story: Story, passages: Passage[]): string {
  const [first, ...rest] = passages;
  if (!first) return storyView(story);
  if (story.contentType !== "episode") return articleQuoteView(story, first, story.contentType);
  const audio = escape(story.audioUrl);
  const from = (p: Passage, cls: string, label: string) => `<button type="button" class="${cls} play-from" data-start="${Math.floor(p.startMs / 1000)}" data-audio="${audio}">${PLAY} ${label}</button>`;
  const others = rest.length
    ? `<ul class="moments">${rest.map((p) => `<li>${from(p, "secondary", clock(p.startMs))}<span>“${escape(p.text)}”</span></li>`).join("")}</ul>`
    : "";
  return `<article class="card quote"><div class="top">${LOGO}<div class="source">${art(story.imageUrl, story.show, "thumb")}<span>${escape(story.show)} · ${escape(story.title)}</span></div></div>`
    + `<div class="said"><p class="meta">From the episode · ${clock(first.startMs)}${first.speaker ? ` · ${escape(first.speaker)}` : ""}</p>`
    // Long quotes get smaller type so "Play from …" stays on the card.
    + `<blockquote${first.text.length > 180 ? ' class="q-long"' : first.text.length > 90 ? ' class="q-mid"' : ""}>“${escape(first.text)}”</blockquote></div>${others}`
    + `<div class="actions">${from(first, "primary", `Play from ${clock(first.startMs)}`)}<button type="button" class="secondary play" data-audio="${audio}">Whole episode</button></div></article>`;
}

function storiesView(matches: StoryCardMatch[]): string {
  const tiles = matches.slice(0, 5).map((m, i) =>
    `<button type="button" class="tile ask" data-ask="${escape(`Tell me about the story "${m.title}"`)}">${art(m.imageUrl, m.show, "tile-art")}`
    + `<span class="badge">${i + 1}</span><span class="tile-title">${escape(m.title)}</span><span class="tile-date">${escape(m.show)} · ${escape(dayMonth(m.publishedAt))}</span></button>`).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

/** A place row: its number on the map, name, street; tapping asks the host for directions. */
export function placeRows(story: Story, limit: number): string {
  return pinnedPlaces(story).slice(0, limit).map((p, i) => {
    const street = streetAddress(p.address, p.name);
    const row = `<button type="button" class="row directions" data-url="${escape(directionsUrl(p.name, p.address, p.lat, p.lng))}" aria-label="Directions to ${escape(p.name)}">`
      + `<span class="num">${i + 1}</span><span class="what"><b>${escape(p.name)}</b><small>${escape(street ?? p.category)}</small></span></button>`;
    // Reserve sits beside the row (a button can't hold a button), only where an editor saved a booking link.
    return p.reservationUrl
      ? `<div class="row-wrap">${row}<button type="button" class="secondary reserve" data-url="${escape(p.reservationUrl)}" aria-label="Reserve at ${escape(p.name)}">Reserve</button></div>`
      : row;
  }).join("");
}

function placesView(story: Story, map: MapData): string {
  const total = pinnedPlaces(story).length;
  const pins = map.badges.map((b) => `<span class="pin" style="left:${Math.round(b.x)}px;top:${Math.round(b.y)}px">${escape(b.label)}</span>`).join("");
  return `<article class="card places"><div class="top">${LOGO}<span class="meta">${escape(story.show)} · ${escape(story.title)}</span></div>`
    + `<div class="split"><div class="mapbox" style="width:${map.w}px;height:${map.h}px"><img data-themed src="${escape(map.url)}" width="${map.w}" height="${map.h}" alt="Map of the places from this story, numbered to match the list">${pins}</div>`
    + `<div class="list">${placeRows(story, 3)}${total > 3 ? `<button type="button" class="secondary fullscreen">See all ${total} on the map</button>` : ""}</div></div></article>`;
}

const CAL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

/** "Free", "$15", "$15–25", or nothing when the guide doesn't say. */
function price(e: PublicEvent): string {
  if (e.isFree) return "Free";
  if (e.priceMin === null) return "";
  return e.priceMax !== null && e.priceMax !== e.priceMin ? `$${e.priceMin}–${e.priceMax}` : `$${e.priceMin}`;
}
const badge = (e: PublicEvent) => (e.pick ? "Staff pick" : e.isStationEvent ? "Radio Milwaukee" : "");
const eventButtons = (e: PublicEvent) =>
  `<button type="button" class="secondary calendar" data-url="${escape(e.calendarUrl)}">${CAL} Add to calendar</button>`
  + `<button type="button" class="secondary details" data-url="${escape(e.url)}">Details</button>`;

function eventsView(items: EventItem[]): string {
  const tiles = items.slice(0, 5).map(({ event: e, when }, i) => {
    const tag = badge(e);
    const cost = price(e);
    // No photo, no empty block: the category sits beside the number so the buttons stay on the card.
    // No outside photos: event images live on many other sites, which a real Alexa+ screen would block.
    return `<article class="tile event">`
      + `<div class="ev-head"><span class="badge">${i + 1}</span><span class="ev-cat">${escape(e.category ?? "event")}</span>${tag ? `<span class="tag">${tag}</span>` : ""}</div>`
      + `<span class="tile-title">${escape(e.title)}</span>`
      + `<span class="tile-date">${escape(when)}${e.venue ? ` · ${escape(e.venue.name)}` : ""}${cost ? ` · <b>${cost}</b>` : ""}</span>`
      + `<span class="tile-actions">${eventButtons(e)}</span></article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

function eventsMapView(items: EventItem[], map: MapData): string {
  const pins = map.badges.map((b) => `<span class="pin" style="left:${Math.round(b.x)}px;top:${Math.round(b.y)}px">${escape(b.label)}</span>`).join("")
    // The star is dropped where it would cover a numbered pin (events at the story's own place).
    + (map.anchor && !map.badges.some((b) => Math.hypot(b.x - map.anchor!.x, b.y - map.anchor!.y) < 36) ? `<span class="pin anchor" style="left:${Math.round(map.anchor.x)}px;top:${Math.round(map.anchor.y)}px" title="${escape(map.anchor.name)}">★</span>` : "");
  const rows = items.slice(0, 3).map(({ event: e, when }, i) =>
    `<div class="row event-row"><span class="num">${i + 1}</span><span class="what"><b>${escape(e.title)}</b>`
    + `<small>${escape(when)}${e.venue ? ` · ${escape(e.venue.name)}` : ""}${e.distanceMiles !== undefined ? ` · ${e.distanceMiles} mi` : ""}</small></span>`
    + `<button type="button" class="secondary calendar small" data-url="${escape(e.calendarUrl)}" aria-label="Add ${escape(e.title)} to calendar">${CAL}</button></div>`).join("");
  return `<article class="card places"><div class="top">${LOGO}<span class="meta">${map.anchor ? `Near ★ ${escape(map.anchor.name)}` : "Nearby"}</span></div>`
    + `<div class="split"><div class="mapbox" style="width:${map.w}px;height:${map.h}px"><img data-themed src="${escape(map.url)}" width="${map.w}" height="${map.h}" alt="Map of nearby events, numbered to match the list">${pins}</div>`
    + `<div class="list">${rows}</div></div></article>`;
}

/** The fullscreen map's frame: the pan-and-zoom map fills the screen; header and list float over it. */
export function fullPlacesView(story: Story): string {
  const total = pinnedPlaces(story).length;
  return `<div class="full"><div id="fullmap" role="img" aria-label="Map of the places from this story"></div>`
    + `<header class="overlay bar"><span class="meta">${escape(story.show)}</span>${LOGO}<button type="button" class="secondary close" aria-label="Close the map">Close</button></header>`
    + `<aside class="overlay side"><p class="side-title">${total} places from this episode</p>${placeRows(story, total)}</aside></div>`;
}

/** The card's HTML for one view, made on the server so every piece of story text is escaped in one tested place. */
/** A song from the playlist: artwork, when it played, credits, the 30-second preview, and Save. */
function songView(song: SongCard): string {
  const preview = song.previewUrl ? `<button type="button" class="primary play" data-audio="${escape(song.previewUrl)}">${PLAY} Play preview</button>` : "";
  const save = `<button type="button" class="${preview ? "secondary" : "primary"} ask" data-ask="Save it">Save it</button>`;
  return `<article class="card story music">${LOGO}<div class="body">${art(song.artworkUrl, song.artist, "art")}<div class="info">`
    + (song.meta ? `<p class="meta">${escape(song.meta)}</p>` : "")
    + `<h2>${escape(song.title)}</h2><p class="line">${escape(song.artist)}</p>`
    + song.lines.map((line) => `<p class="line">${escape(line)}</p>`).join("")
    + `<div class="actions">${preview}${save}</div></div></div></article>`;
}

/** Several songs as numbered tiles, so "save number 2" by voice matches the screen; each tile has its own preview. */
function songsView(songs: SongCard[]): string {
  const tiles = songs.slice(0, 10).map((song, i) => {
    const number = i + 1;
    const preview = song.previewUrl ? `<button type="button" class="secondary row-play" data-audio="${escape(song.previewUrl)}">${PLAY} Preview</button>` : "";
    const save = `<button type="button" class="secondary ask" data-ask="${escape(`Save number ${number}, "${song.title}" by ${song.artist}`)}" data-save="${escape(JSON.stringify({ title: song.title, artist: song.artist }))}">Save</button>`;
    return `<article class="tile song">${art(song.artworkUrl, song.artist, "tile-art")}<span class="badge">${number}</span>`
      + `<span class="tile-title">${escape(song.title)}</span><span class="tile-date">${escape(song.artist)}${song.meta ? ` · ${escape(song.meta)}` : ""}</span>`
      + `<span class="tile-actions">${preview}${save}</span></article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

const shortDay = (ms: number) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }).format(ms).replace(",", "");
const stationLabel = (slug: string) => STATION_NAMES[slug as keyof typeof STATION_NAMES] ?? slug;

const monthDay = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(ms);
const ticketsButton = (url: string | null | undefined, venue: string) => {
  const clean = cleanTicketUrl(url);
  return clean ? `<button type="button" class="secondary tickets" data-url="${escape(clean)}" aria-label="Get tickets at ${escape(venue)}">Get tickets</button>` : "";
};
/** Icon-only, so it fits beside Get tickets on a tile; the label says which show. */
const showCalendarButton = (show: CalendarShow) =>
  `<button type="button" class="secondary calendar small" data-url="${escape(showCalendarUrl(show))}" aria-label="${escape(`Add ${show.artist} at ${show.venue} to calendar`)}">${CAL}</button>`;
// not_linked and failed get no chip: nothing the listener can do from this screen.
const APPLE_CHIPS: Record<string, string> = { added: "In Apple Music", pending: "Adding…", expired: "Reconnect Apple Music" };

/** Saved songs as numbered tiles (the label is the number the voice reads), each with its preview and a follow-up ask. */
function findsView(finds: FindRow[]): string {
  const tiles = finds.slice(0, 10).map((find) => {
    const chip = APPLE_CHIPS[find.appleMusic.status];
    const preview = find.previewUrl ? `<button type="button" class="secondary row-play" data-audio="${escape(find.previewUrl)}">${PLAY} Preview</button>` : "";
    const more = `<button type="button" class="secondary ask" data-ask="${escape(`Tell me about "${find.title}" by ${find.artist}`)}">Tell me more</button>`;
    return `<article class="tile song find">${art(sizedArtwork(find.artworkUrl), find.artist, "tile-art")}<span class="badge">${escape(find.label)}</span>`
      + (chip ? `<span class="chip${find.appleMusic.status === "expired" ? " warn" : ""}">${chip}</span>` : "")
      + `<span class="tile-title">${escape(find.title)}</span>`
      + `<span class="tile-date">${escape(find.artist)}<br>${escape(stationLabel(find.stationSlug))} · ${escape(monthDay(find.savedAt))}</span>`
      + `<span class="tile-actions">${preview}${more}</span></article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

function nextShowRow(show: NonNullable<SavedOk["nextShow"]>, artist: string): string {
  return `<div class="next"><p class="meta">Next show</p><div class="row-wrap"><div class="row show-row">${art(show.imageUrl ?? null, artist, "thumb")}`
    + `<span class="what"><b>${escape(show.venue)} · ${escape(show.city)}</b><small>${escape(shortDay(show.startsAtMs))} · ${escape(localClock(show.startsAtMs))}</small></span></div>`
    + `${ticketsButton(show.ticketUrl, show.venue)}${showCalendarButton({ ...show, artist })}</div></div>`;
}

/** The save, confirmed on screen: the song, where it went (Finds, Apple Music), and what comes with it (show, story, follow). */
function savedView(saved: SavedOk, artworkUrl: string | null, previewUrl: string | null): string {
  const apple = saved.appleMusic === "pending" ? "Adding to Apple Music" : "Connect Apple Music to add songs to your library";
  const preview = previewUrl ? `<button type="button" class="primary play" data-audio="${escape(previewUrl)}">${PLAY} Play preview</button>` : "";
  const story = saved.story
    ? `<button type="button" class="secondary ask" data-ask="${escape(`Play the ${saved.story.show} story about ${saved.artistName}`)}">${PLAY} Their ${escape(saved.story.show)} story</button>`
    : "";
  return `<article class="card story music saved">${LOGO}<div class="body">${art(artworkUrl, saved.artist, "art")}<div class="info">`
    + `<p class="meta done">${saved.alreadySaved ? "✓ Already in your Finds" : "✓ Saved to your Finds"}</p>`
    + `<h2>${escape(saved.title)}</h2><p class="line">${escape(saved.artist)}</p>`
    + `<p class="line small">${apple}${saved.firstFollow ? ` · Following ${escape(saved.artistName)} ✓` : ""}</p>`
    + (preview || story ? `<div class="actions">${preview}${story}</div>` : "")
    + `</div></div>${saved.nextShow ? nextShowRow(saved.nextShow, saved.artistName) : ""}</article>`;
}

function digestLine(item: DigestItem): string {
  switch (item.kind) {
    case "spins": return `Played ${item.total}× on ${item.byStation.map((s) => stationLabel(s.station)).join(", ")}`;
    case "show": return `${item.venue} · ${shortDay(item.startsAtMs)}`;
    case "story": return `New: ${item.show} story`;
    case "apple": return "";
  }
}

/** One tile per followed artist that has news, plus Apple Music status as a closing text line. */
function digestView(artists: Digest["artists"], items: DigestItem[]): string {
  const tiles = artists.flatMap((artist) => {
    const mine = items.filter((item) => "artistId" in item && item.artistId === artist.artistId);
    if (mine.length === 0) return [];
    const story = mine.find((item): item is Extract<DigestItem, { kind: "story" }> => item.kind === "story");
    const show = mine.find((item): item is Extract<DigestItem, { kind: "show" }> => item.kind === "show");
    const ask = story ? `<button type="button" class="secondary ask" data-ask="${escape(`Play the ${story.show} story about ${artist.name}`)}">Play story</button>` : "";
    const actions = ask + (show ? ticketsButton(show.ticketUrl, show.venue) + showCalendarButton(show) : "");
    // The show's photo says "they're coming" better than the album cover does.
    return [`<article class="tile digest">${art(show?.imageUrl ?? artist.artworkUrl, artist.name, "tile-art")}<span class="tile-title">${escape(artist.name)}</span>`
      + `<span class="tile-date">${mine.map((item) => escape(digestLine(item))).join("<br>")}</span>${actions ? `<span class="tile-actions">${actions}</span>` : ""}</article>`];
  }).join("");
  const apple = items.flatMap((item) => (item.kind === "apple" ? [
    ...(item.added > 0 ? [`${item.added} of your saved songs ${item.added === 1 ? "is" : "are"} in Apple Music.`] : []),
    ...(item.expired > 0 ? [`Apple Music needs reconnecting at ${new URL(SITE).host}/connect/apple-music.`] : []),
  ] : []));
  const note = apple.length ? `<p class="line small">${escape(apple.join(" "))}</p>` : "";
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div>${note}</article>`;
}

/** Artists the station plays with shows coming up, as digest-style tiles: the event photo, where, when, and tickets. */
function stationShowsView(shows: StationShow[]): string {
  const tiles = shows.slice(0, 10).map((show) => {
    const day = showCalendarDay(show, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
    const when = show.dateOnly ? day : `${day} · ${localClock(show.startsAtMs)}`;
    const actions = ticketsButton(show.ticketUrl, show.venueName) + showCalendarButton({ ...show, artist: show.artistName, venue: show.venueName });
    return `<article class="tile digest">${art(show.imageUrl ?? null, show.artistName, "tile-art")}<span class="tile-title">${escape(show.artistName)}</span>`
      + `<span class="tile-date">${escape(show.venueName)} · ${escape(show.city)}<br>${escape(when)}</span><span class="tile-actions">${actions}</span></article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

/** "What can you do?": one tile per capability, each with a phrase the listener can tap to ask. */
function capabilitiesView(): string {
  const tiles = CAPABILITIES.map(({ title, description, example }) =>
    `<article class="tile cap"><span class="tile-title">${escape(title)}</span><span class="cap-what">${escape(description)}</span>`
    + `<button type="button" class="secondary ask say" data-ask="${escape(example)}">“${escape(example)}”</button></article>`).join("");
  return `<article class="card caps">${LOGO}<div class="cap-grid">${tiles}</div></article>`;
}

/** "Midday Show with Erin Wolf": the host line under a station's name. */
const showLine = (show: { name: string; hosts: string[] }) => `${withoutStationName(show.name)}${show.hosts.length ? ` with ${show.hosts.join(" & ")}` : ""}`;

/** Plays the stream in the card with the same one-at-a-time player as previews; reads "❚❚ Stop" while it plays. */
const listenLive = (station: Station, cls: string) =>
  `<button type="button" class="${cls} row-play live" data-audio="${escape(LIVE_STREAMS[station])}" data-playing="❚❚ Stop">▶ Listen live</button>`;
// The station rides along so save_find reads that station's current song instead of searching every play.
const saveSong = (song: RecentSong, station: Station) =>
  `<button type="button" class="secondary ask" data-ask="${escape(`Save "${song.title}" by ${song.artist} from ${STATION_NAMES[station]}`)}" data-save="${escape(JSON.stringify({ title: song.title, artist: song.artist, station }))}">Save this song</button>`;

/** One station, large: the song on air (or just "Live now"), Listen live and Save. */
function onAirStationView({ station, song, show }: OnAirTile): string {
  const name = STATION_NAMES[station];
  const what = song
    ? `<h2>${escape(song.title)}</h2><p class="line">${escape(song.artist)}</p><p class="line small">${escape(song.when)}</p>`
    : `<h2>${escape(name)}</h2><p class="line">Live now</p>`;
  return `<article class="card story music">${LOGO}<div class="body">${art(sizedArtwork(song?.artworkUrl ?? null), song?.artist ?? name, "art")}<div class="info">`
    + `<p class="meta">On air now · ${escape(name)}${show ? ` · ${escape(showLine(show))}` : ""}</p>${what}`
    + `<div class="actions">${listenLive(station, "primary")}${song ? saveSong(song, station) : ""}</div></div></div></article>`;
}

/** Every station as a row (four tiles with two buttons each don't fit the screen); no recent play is a plain "Live now" row. */
function onAirView(tiles: OnAirTile[]): string {
  if (tiles.length === 1) return onAirStationView(tiles[0]);
  const rows = tiles.map(({ station, song, show }) => {
    const name = STATION_NAMES[station];
    const badge = `<span class="station">${escape(name)}</span>${show ? ` · ${escape(showLine(show))}` : ""}`;
    const what = song
      ? `<b>${escape(song.title)}</b><small>${badge} · ${escape(song.artist)} · ${escape(song.when)}</small>`
      : `<b>${escape(name)}</b><small>${badge} · Live now</small>`;
    return `<div class="row onair-row">${art(sizedArtwork(song?.artworkUrl ?? null), song?.artist ?? name, "thumb")}<span class="what">${what}</span>`
      + `${listenLive(station, "primary")}${song ? saveSong(song, station) : ""}</div>`;
  }).join("");
  return `<article class="card">${LOGO}<div class="list">${rows}</div></article>`;
}

// Schedule links come from the playlist's data; only https pages may open.
const httpsUrl = (url: string | null | undefined) => (url && url.startsWith("https://") ? url : null);
const scheduleImage = (item: { imageUrl?: string | null; hostProfiles?: HostCard[] }) =>
  httpsUrl(item.hostProfiles?.find((host) => host.imageUrl)?.imageUrl ?? item.imageUrl);

/** The host's newest pieces as link buttons (headline as the label); opened with openLink like Details. */
function latestButtons(hosts: HostCard[] = [], limit: number): string {
  return hosts.flatMap((host) => host.latest.flatMap((piece) => {
    const url = httpsUrl(piece.url);
    return url ? [`<button type="button" class="secondary details latest" data-url="${escape(url)}" aria-label="${escape(`Latest from ${host.name}: ${piece.title}`)}">${escape(piece.title)}</button>`] : [];
  })).slice(0, limit).join("");
}

/** On now, large: the host's photo (or the show's, or a plain tile), show, hosts, until when, Listen live, the latest piece, and up next. */
function onNowView(onNow: ScheduleSlot | null, next: ScheduleSlot | null): string {
  const main = onNow ?? next!;
  const hosts = main.hosts.length ? `<p class="line">${escape(main.hosts.join(" & "))}</p>` : "";
  const when = onNow ? `until ${clockWords(onNow.endsAt)}` : `at ${clockWords(main.startsAt)}`;
  const latest = latestButtons(main.hostProfiles, 1);
  const upNext = onNow && next
    ? `<div class="next"><p class="meta">Up next</p><div class="row sched-row">${art(scheduleImage(next), next.name, "thumb")}`
      + `<span class="what"><b>${escape(next.name)}</b><small>${escape([next.hosts.join(" & "), clockWords(next.startsAt)].filter(Boolean).join(" · "))}</small></span></div></div>`
    : "";
  return `<article class="card story music schedule">${LOGO}<div class="body">${art(scheduleImage(main), main.name, "art")}<div class="info">`
    + `<p class="meta">${onNow ? "On now" : "Up next"} · 88Nine</p><h2>${escape(main.name)}</h2>${hosts}<p class="line small">${escape(when)}</p>`
    + `<div class="actions">${listenLive("88nine", "primary")}${latest}</div></div></div>${upNext}</article>`;
}

/** Shows that match a show or host name: photo (or plain tile), name, hosts, weekly times, "On now", and the host's latest piece. */
function programsView(matches: ScheduleProgram[]): string {
  const tiles = matches.slice(0, 5).map((program) => {
    const latest = latestButtons(program.hostProfiles, 1);
    const times = weeklyTimes(program.airtimes);
    return `<article class="tile digest sched">${art(scheduleImage(program), program.name, "tile-art")}${program.airingNow ? '<span class="chip">On now</span>' : ""}`
      + `<span class="tile-title">${escape(program.name)}</span>`
      + `<span class="tile-date">${program.hosts.length ? `${escape(program.hosts.join(" & "))}<br>` : ""}${escape(times ? times[0].toUpperCase() + times.slice(1) : "")}</span>`
      + (latest ? `<span class="tile-actions">${latest}</span>` : "") + `</article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
}

function scheduleView(onNow: ScheduleSlot | null, next: ScheduleSlot | null, matches: ScheduleProgram[]): string {
  return matches.length || !(onNow || next) ? programsView(matches) : onNowView(onNow, next);
}

function briefingView(date: string, items: BriefingItem[]): string {
  const rows = items.slice(0, 6).map((item, i) => {
    const { action } = item;
    const button = action.kind === "story"
      ? `<button type="button" class="primary ask" data-ask="${escape(`Tell me about the story "${action.title}"`)}">${PLAY} Play</button>`
      : action.kind === "picks"
        ? '<button type="button" class="secondary ask" data-ask="What is Radio Milwaukee recommending?">Picks</button>'
        : `<button type="button" class="secondary details" data-url="${escape(action.url)}">Read</button>`;
    return `<div class="row-wrap"><div class="row"><span class="num">${i + 1}</span><span class="what"><b>${escape(item.heading)}</b><small>${escape(item.summary)}</small></span></div>${button}</div>`;
  }).join("");
  return `<article class="card briefing">${LOGO}<span class="meta">From the ${escape(date)} newsletter</span><div class="list">${rows}</div></article>`;
}

const GIVE_DEMO = "DEMO · Amazon Pay sandbox · no real money";
const giveTiers = (kind: GiveKind, links: Record<string, string>, selected?: string) =>
  `<div class="give-grid ${kind}">${LEVELS.map((level) => {
    const id = `${level.slug}-${kind}`;
    const url = links[id];
    return url ? `<button type="button" class="${id === selected ? "primary" : "secondary"} details give-tier" data-url="${escape(url)}"><b>${escape(dollars(level[kind]))}${kind === "monthly" ? "/mo" : ""}</b><small>${escape(level.name)}</small><i>${escape(PREMIUMS[level.slug].line)}</i></button>` : "";
  }).join("")}</div>`;

/** Support Radio Milwaukee: Monthly | One-time (CSS radios, no script), four levels each opening /give, and a QR for screens that can't open a browser. */
function giveView(links: Record<string, string>, qrSvg: string, shortUrl: string, selected?: string): string {
  const once = selected?.endsWith("-once");
  return `<article class="card give"><div class="top">${LOGO}<span class="demo">${GIVE_DEMO}</span></div><div class="give-body"><div class="give-main">`
    + `<h2>Support Radio Milwaukee</h2>`
    + `<input type="radio" name="give-kind" id="give-monthly"${once ? "" : " checked"}><input type="radio" name="give-kind" id="give-once"${once ? " checked" : ""}>`
    + `<div class="switch"><label for="give-monthly">Monthly</label><label for="give-once">One-time</label></div>`
    + giveTiers("monthly", links, selected) + giveTiers("once", links, selected)
    + `<p class="line small">More levels on radiomilwaukee.org</p></div>`
    + `<aside class="give-qr">${qrSvg}<p class="line small">Or open ${escape(shortUrl)} on your phone</p></aside></div></article>`;
}

/** "Am I a member?": the membership's facts, with Upgrade (when there's a level above) and Cancel as spoken asks. */
function membershipView(m: MembershipFacts): string {
  const row = (label: string, value: string | null) => (value ? `<p class="line"><small>${label}</small> ${escape(value)}</p>` : "");
  const upgrade = m.upgradeTo ? `<button type="button" class="primary ask" data-ask="${escape(`Upgrade me to ${m.upgradeTo}`)}">Upgrade to ${escape(m.upgradeTo)}</button>` : "";
  return `<article class="card give membership"><div class="top">${LOGO}<span class="demo">${GIVE_DEMO}</span></div>`
    + `<h2>${escape(m.level)} member</h2>`
    + row("Amount", m.amount) + row("Member since", m.since) + row("Next charge", m.nextCharge) + row("Gift", m.gift) + row("Includes", m.perks)
    + `<div class="actions">${upgrade}<button type="button" class="secondary ask" data-ask="Cancel my Radio Milwaukee membership">Cancel membership</button></div></article>`;
}

const songCount = (n: number) => `${n} song${n === 1 ? "" : "s"}`;
const cardCall = (name: string, args: Record<string, unknown>) => escape(JSON.stringify({ name, arguments: args }));

/** One playlist: each song can be removed from the card (no ChatGPT turn); the chat message is the fallback. */
function playlistView(playlistId: string, name: string, items: PlaylistItem[]): string {
  const rows = items.map((item) => `<div class="row-wrap"><div class="row">`
    + (item.artworkUrl ? `<img class="thumb" src="${escape(sizedArtwork(item.artworkUrl) ?? item.artworkUrl)}" alt="${escape(item.artist)} artwork">` : `<span class="thumb ph"></span>`)
    + `<span class="what"><b>${escape(item.title)}</b><small>${escape(item.artist)} · ${escape(stationLabel(item.stationSlug))}</small></span></div>`
    + `<button type="button" class="secondary small remove" data-ask="${escape(`Remove "${item.title}" from my playlist ${name}`)}" data-call="${cardCall("remove_from_playlist", { playlist: playlistId, itemId: item.itemId })}">Remove</button></div>`).join("");
  return `<article class="card playlist"><p class="meta">Playlist · ${songCount(items.length)}</p><h2>${escape(name)}</h2>`
    + (items.length ? `<div class="list">${rows}</div>` : `<p class="line">No songs yet. Add one: "Add that song to ${escape(name)}".</p>`)
    + `</article>`;
}

/** The listener's playlists; a row opens its playlist from the card. */
function playlistsView(playlists: PlaylistSummary[]): string {
  if (!playlists.length) return `<article class="card playlists"><p class="line">You don't have any playlists yet. Try "Make a playlist called Road Trip".</p></article>`;
  const rows = playlists.map((pl) => `<div class="row-wrap"><div class="row"><span class="what"><b>${escape(pl.name)}</b><small>${songCount(pl.itemCount)}</small></span></div>`
    + `<button type="button" class="secondary open" data-ask="${escape(`Show my playlist ${pl.name}`)}" data-call="${cardCall("show_playlists", { playlist: pl.playlistId })}">Open</button></div>`).join("");
  return `<article class="card playlists"><p class="meta">Your playlists</p><div class="list">${rows}</div></article>`;
}

/** The station home: what's on, this week, and your Finds, stacked; each section is the card it already is elsewhere. */
function homeView(tiles: OnAirTile[], episodes: StoryCardMatch[] | null, briefing: { date: string; items: BriefingItem[] } | null, finds: FindRow[] | null): string {
  const section = (title: string, body: string) => `<section class="home-section"><h3 class="home-title">${escape(title)}</h3>${body}</section>`;
  const yours = finds === null
    ? `<article class="card home-hint"><p class="line">Sign in to see your Finds here: ask "What's in my Finds?"</p></article>`
    : finds.length ? findsView(finds) : `<article class="card home-hint"><p class="line">No Finds yet. Save songs from any song card.</p></article>`;
  // ponytail: storiesView shows the 5 newest, so of 6 shows the one with the oldest episode waits for its next one.
  return `<div class="home">${section("On air now", onAirView(tiles))}${episodes && episodes.length ? section("New episodes", storiesView(episodes)) : ""}${briefing && briefing.items.length ? section("This week", briefingView(briefing.date, briefing.items)) : ""}${section("Your Finds", yours)}</div>`;
}

const REQUEST_KIND: Record<StationRequest["kind"], string> = { song_request: "Song request", five_oclock_shadow: "5 O'Clock Shadow suggestion" };

/** Exactly what the station will receive; nothing sends until the listener taps Send (the token is the only way). */
function requestView(r: StationRequest, token: string): string {
  const lines = r.kind === "five_oclock_shadow" ? [`Cover by ${r.coverArtist}`, `Originally by ${r.artist}`] : [r.artist];
  const send = `<button type="button" class="primary send" data-ask="Send my request to Radio Milwaukee" data-call="${escape(JSON.stringify({ name: "send_station_request", arguments: { token } }))}">Send to Radio Milwaukee</button>`;
  return `<article class="card story request"><div class="info"><p class="meta">${escape(REQUEST_KIND[r.kind])} · to Radio Milwaukee</p><h2>${escape(r.song)}</h2>`
    + lines.map((line) => `<p class="line">${escape(line)}</p>`).join("")
    + (r.note ? `<p class="line note">“${escape(r.note)}”</p>` : "")
    + `<p class="line from">From: ${escape(r.fromName ?? "name not given")}</p>`
    + `<div class="actions">${send}</div></div></article>`;
}

function requestStatusView(ok: boolean, title: string, detail: string): string {
  return `<article class="card story request-status${ok ? " ok" : ""}"><div class="info"><h2>${escape(title)}</h2><p class="line">${escape(detail)}</p></div></article>`;
}

export function renderView(card: CardView): string {
  switch (card.view) {
    case "story": return storyView(card.story, card.releaseEvent ?? null);
    case "quote": return quoteView(card.story, card.passages);
    case "stories": return storiesView(card.matches);
    case "places": return placesView(card.story, card.map);
    case "events": return eventsView(card.items);
    case "events-map": return eventsMapView(card.items, card.map);
    case "song": return songView(card.song);
    case "songs": return songsView(card.songs);
    case "briefing": return briefingView(card.date, card.items);
    case "digest": return digestView(card.artists, card.items);
    case "finds": return findsView(card.finds);
    case "saved": return savedView(card.saved, card.artworkUrl, card.previewUrl);
    case "station-shows": return stationShowsView(card.shows);
    case "capabilities": return capabilitiesView();
    case "on-air": return onAirView(card.tiles);
    case "schedule": return scheduleView(card.onNow, card.next, card.matches);
    case "give": return giveView(card.links, card.qrSvg, card.shortUrl, card.selected);
    case "membership": return membershipView(card);
    case "request": return requestView(card.request, card.token);
    case "request-status": return requestStatusView(card.ok, card.title, card.detail);
    case "home": return homeView(card.tiles, card.episodes ?? null, card.briefing, card.finds);
    case "playlist": return playlistView(card.playlistId, card.name, card.items);
    case "playlists": return playlistsView(card.playlists);
  }
}
