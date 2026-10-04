import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { PublicEvent } from "@/lib/fieldGuide";
import type { Badge } from "@/lib/map/geo";
import { pinnedPlaces } from "@/lib/map/staticMap";
import { directionsUrl, streetAddress } from "@/lib/maps";
import { ARTICLE_SOURCE, clock, longDate, monthYear } from "@/lib/speech";
import type { SongCard } from "./song";
import { SITE } from "./tokens";

export interface MapData { url: string; w: number; h: number; badges: Badge[]; anchor?: { x: number; y: number; name: string } }
/** An event with its time already put into words ("tonight at 8 PM"), so rendering stays clock-free. */
export interface EventItem { event: PublicEvent; when: string }
export type CardView =
  | { view: "story"; story: Story; releaseEvent?: PublicEvent | null }
  | { view: "quote"; story: Story; passages: Passage[] }
  | { view: "stories"; matches: StoryCardMatch[] }
  | { view: "places"; story: Story; map: MapData }
  | { view: "events"; items: EventItem[] }
  | { view: "events-map"; items: EventItem[]; map: MapData }
  | { view: "song"; song: SongCard }
  | { view: "songs"; songs: SongCard[] };

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
    ? `<button type="button" class="secondary ask" data-ask="Where are the places from that episode?">${PIN} Places</button>`
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
    const save = `<button type="button" class="secondary ask" data-ask="${escape(`Save number ${number}, "${song.title}" by ${song.artist}`)}">Save</button>`;
    return `<article class="tile song">${art(song.artworkUrl, song.artist, "tile-art")}<span class="badge">${number}</span>`
      + `<span class="tile-title">${escape(song.title)}</span><span class="tile-date">${escape(song.artist)}${song.meta ? ` · ${escape(song.meta)}` : ""}</span>`
      + `<span class="tile-actions">${preview}${save}</span></article>`;
  }).join("");
  return `<article class="card stories">${LOGO}<div class="carousel">${tiles}</div></article>`;
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
  }
}
