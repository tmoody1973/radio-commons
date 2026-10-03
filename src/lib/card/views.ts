import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import type { Badge } from "@/lib/map/geo";
import { pinnedPlaces } from "@/lib/map/staticMap";
import { directionsUrl, streetAddress } from "@/lib/maps";
import { clock, monthYear } from "@/lib/speech";
import { SITE } from "./tokens";

export interface MapData { url: string; w: number; h: number; badges: Badge[] }
export type CardView =
  | { view: "story"; story: Story }
  | { view: "quote"; story: Story; passages: Passage[] }
  | { view: "stories"; matches: StoryCardMatch[] }
  | { view: "places"; story: Story; map: MapData };

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

function storyView(story: Story): string {
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

function quoteView(story: Story, passages: Passage[]): string {
  const [first, ...rest] = passages;
  if (!first) return storyView(story);
  const audio = escape(story.audioUrl);
  const from = (p: Passage, cls: string, label: string) => `<button type="button" class="${cls} play-from" data-start="${Math.floor(p.startMs / 1000)}" data-audio="${audio}">${PLAY} ${label}</button>`;
  const others = rest.length
    ? `<ul class="moments">${rest.map((p) => `<li>${from(p, "secondary", clock(p.startMs))}<span>“${escape(p.text)}”</span></li>`).join("")}</ul>`
    : "";
  return `<article class="card quote"><div class="top">${LOGO}<div class="source">${art(story.imageUrl, story.show, "thumb")}<span>${escape(story.show)} · ${escape(story.title)}</span></div></div>`
    + `<div class="said"><p class="meta">From the episode · ${clock(first.startMs)}${first.speaker ? ` · ${escape(first.speaker)}` : ""}</p>`
    + `<blockquote>“${escape(first.text)}”</blockquote></div>${others}`
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
    return `<button type="button" class="row directions" data-url="${escape(directionsUrl(p.name, p.address, p.lat, p.lng))}" aria-label="Directions to ${escape(p.name)}">`
      + `<span class="num">${i + 1}</span><span class="what"><b>${escape(p.name)}</b><small>${escape(street ?? p.category)}</small></span></button>`;
  }).join("");
}

function placesView(story: Story, map: MapData): string {
  const total = pinnedPlaces(story).length;
  const pins = map.badges.map((b) => `<span class="pin" style="left:${Math.round(b.x)}px;top:${Math.round(b.y)}px">${escape(b.label)}</span>`).join("");
  return `<article class="card places"><div class="top">${LOGO}<span class="meta">${escape(story.show)} · ${escape(story.title)}</span></div>`
    + `<div class="split"><div class="mapbox" style="width:${map.w}px;height:${map.h}px"><img data-themed src="${escape(map.url)}" width="${map.w}" height="${map.h}" alt="Map of the places from this story, numbered to match the list">${pins}</div>`
    + `<div class="list">${placeRows(story, 3)}${total > 3 ? `<button type="button" class="secondary fullscreen">See all ${total} on the map</button>` : ""}</div></div></article>`;
}

/** The fullscreen map's frame: the pan-and-zoom map fills the screen; header and list float over it. */
export function fullPlacesView(story: Story): string {
  const total = pinnedPlaces(story).length;
  return `<div class="full"><div id="fullmap" role="img" aria-label="Map of the places from this story"></div>`
    + `<header class="overlay bar"><span class="meta">${escape(story.show)}</span>${LOGO}<button type="button" class="secondary close" aria-label="Close the map">Close</button></header>`
    + `<aside class="overlay side"><p class="side-title">${total} places from this episode</p>${placeRows(story, total)}</aside></div>`;
}

/** The card's HTML for one view, made on the server so every piece of story text is escaped in one tested place. */
export function renderView(card: CardView): string {
  switch (card.view) {
    case "story": return storyView(card.story);
    case "quote": return quoteView(card.story, card.passages);
    case "stories": return storiesView(card.matches);
    case "places": return placesView(card.story, card.map);
  }
}
