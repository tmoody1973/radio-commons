import type { StoryCardMatch } from "@/lib/backstory";
import type { BriefingItem } from "@/lib/briefing";
import type { FindRow, PlaylistSummary, Station } from "@/lib/playlist";
import { withoutStationName } from "@/lib/speech";
import { sizedArtwork, STATION_NAMES } from "./song";
import { SITE } from "./tokens";
import { art, briefingButton, cardCall, escape, listenLive, saveSong, showLine, type OnAirTile } from "./views";

/**
 * The station home as a fullscreen page: what ChatGPT's sidebar (and "Open Radio Milwaukee") shows. Board A of the
 * mockups Tarik approved on 2026-10-08, after Canva's ChatGPT home: a bold prompt, prompts to tap, what the app does,
 * then the live station. Fullscreen only: the inline home stays within ChatGPT's inline card rules (views.ts).
 */
export interface HomeData {
  tiles: OnAirTile[];
  episodes: StoryCardMatch[] | null;
  briefing: { date: string; items: BriefingItem[] } | null;
  /** null when the listener isn't signed in. */
  finds: FindRow[] | null;
  playlists: PlaylistSummary[] | null;
}

/**
 * Deep links (openai/mcp-extensions): chatgpt.com/plugins/<plugin id>/app/station_home?path=/on-air/hyfin opens the
 * sidebar home and scrolls to that part of it. Path → element id; the card page (page.ts) follows them.
 */
export const DEEP_LINKS: Record<string, string> = {
  "/on-air": "on-air",
  ...Object.fromEntries(Object.keys(STATION_NAMES).map((station) => [`/on-air/${station}`, `on-air-${station}`])),
  "/stories": "stories",
  "/this-week": "this-week",
  "/finds": "finds",
  "/explore": "explore",
};

const icon = (paths: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const WAVES = '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="2"/>';
const BOOKMARK = '<path d="M6 3h12v18l-6-4-6 4z"/>';
const CALENDAR = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>';
const HEADPHONES = '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>';
const PLAYLIST = '<path d="M3 6h13M3 12h13M3 18h8"/><path d="M19 15v6M16 18h6"/>';
const HELP = '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>';
const MESSAGE = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';

/** A button that sends its prompt as the listener's own message. label is trusted markup (an icon and escaped text). */
const ask = (cls: string, prompt: string, label: string) => `<button type="button" class="${cls} ask" data-ask="${escape(prompt)}">${label}</button>`;
const shortDate = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(ms);
const stationName = (slug: string) => STATION_NAMES[slug as Station] ?? slug;
// "Radio Milwaukee Artist Interviews" reads as "Artist Interviews" on a Radio Milwaukee page.
const showLabel = (show: string) => withoutStationName(show).replace(/^Radio Milwaukee /, "");

const PROMPTS: [paths: string, label: string, prompt: string][] = [
  [HELP, "What can I do here?", "What can I do with the Radio Milwaukee app?"],
  [WAVES, "What's on HYFIN?", "What's on HYFIN right now?"],
  [CALENDAR, "Free events this weekend", "What free events are happening in Milwaukee this weekend?"],
  [HEADPHONES, "Newest This Bites", "What's the newest This Bites episode?"],
  [PLAYLIST, "Make a playlist", "I'd like to make a playlist"],
];

function hero(): string {
  const chips = PROMPTS.map(([paths, label, prompt]) => ask("hf-chip", prompt, `${icon(paths)}${escape(label)}`)).join("");
  return `<header class="hf-hero"><img class="hf-logo" src="${SITE}/brand/rm-logo.png" alt="Radio Milwaukee">`
    + `<h1>What do you want to <em>hear</em> today?</h1>`
    + `<p>88Nine, HYFIN, Rhythm Lab Radio and 414Music, live inside ChatGPT. Ask in your own words, or start with one of these.</p>`
    + `<div class="hf-chips">${chips}</div></header>`;
}

/** One "Start here" card: what the app does, in a sentence, with the button that does it. */
const startCard = (paths: string, title: string, text: string, cta: string, visual: string) =>
  `<article class="hf-start"><div class="hf-start-text"><span class="hf-badge">${icon(paths, 22)}</span><h3>${title}</h3><p>${text}</p>${cta}</div>`
  + `<div class="hf-start-art">${visual}</div></article>`;
const caption = (kicker: string, line: string) => `<span class="hf-caption"><b>${escape(kicker)}</b>${escape(line)}</span>`;

function startHere(tiles: OnAirTile[], episodes: StoryCardMatch[], finds: FindRow[] | null): string {
  const live = tiles.find((t) => t.song?.artworkUrl) ?? tiles[0];
  const liveArt = live ? art(sizedArtwork(live.song?.artworkUrl ?? null), live.song?.artist ?? stationName(live.station), "hf-cover") : "";
  const liveCaption = live?.song ? caption(`On air · ${stationName(live.station)}`, `${live.song.title} · ${live.song.artist}`) : "";
  const saved = finds?.find((f) => f.artworkUrl) ?? null;
  const other = tiles.find((t) => t !== live && t.song?.artworkUrl);
  const savedArt = saved ? art(sizedArtwork(saved.artworkUrl), saved.artist, "hf-cover") : art(sizedArtwork(other?.song?.artworkUrl ?? null), other?.song?.artist ?? "Radio Milwaukee", "hf-cover");
  const story = episodes.find((m) => m.imageUrl) ?? episodes[0];
  return `<section class="hf-section"><h2>Start here</h2><div class="hf-row hf-starts">`
    + startCard(WAVES, "Hear what's on, right now.", "Four stations, one tap. The stream keeps playing in a mini player while you chat.",
      live ? listenLive(live.station, "primary") : "", `${liveArt}${liveCaption}`)
    + startCard(BOOKMARK, "Save the song you just heard.", "Say “save that song.” It lands in your Finds and your Apple Music library, ready for any playlist you make.",
      ask("primary", "What's in my Finds?", "Your Finds"), `${savedArt}<span class="hf-saved">${icon('<path d="M5 12l5 5L20 7"/>', 14)}Saved to Finds</span>`)
    + startCard(CALENDAR, "Find something to do this weekend.", "Staff concert picks and the MKE Field Guide, on a map, one tap from your calendar.",
      ask("primary", "What's happening in Milwaukee this weekend?", "This weekend"),
      `<div class="hf-weekend"><b>This weekend</b><span>Concerts, festivals and free things to do</span>${icon(CALENDAR, 28)}</div>`)
    + (story ? startCard(HEADPHONES, "Go deeper on a story.", "Ask what was said in an episode, even half-remembered, and see every place it mentions on a map.",
      ask("primary", "What are the newest Radio Milwaukee stories?", "New stories"),
      `${art(story.imageUrl, story.show, "hf-cover")}${caption(`${showLabel(story.show)} · ${shortDate(story.publishedAt)}`, story.title)}`) : "")
    + `</div></section>`;
}

function onAir(tiles: OnAirTile[]): string {
  const cards = tiles.map(({ station, song, show }) => {
    const name = stationName(station);
    return `<article class="hf-station" id="on-air-${escape(station)}">${art(sizedArtwork(song?.artworkUrl ?? null), song?.artist ?? name, "hf-cover")}`
      + `<b class="hf-kicker">${escape(name)}${show ? ` · ${escape(showLine(show))}` : ""}</b>`
      + `<span class="hf-title">${escape(song?.title ?? "Live now")}</span>${song ? `<span class="hf-sub">${escape(song.artist)}</span>` : ""}`
      + `<div class="hf-actions">${listenLive(station, "secondary")}${song ? saveSong(song, station) : ""}</div></article>`;
  }).join("");
  return `<section class="hf-section" id="on-air"><div class="hf-head"><h2>On air now</h2><span class="hf-live"><i></i>Live</span></div><div class="hf-grid">${cards}</div></section>`;
}

const STORY_ASKS: [label: string, prompt: string][] = [
  ["More interviews", "What are the newest Radio Milwaukee artist interviews?"],
  ["More podcasts", "What are the newest Radio Milwaukee podcast episodes?"],
  ["Uniquely Milwaukee", "What's new from Uniquely Milwaukee?"],
];

function latestStories(episodes: StoryCardMatch[]): string {
  const asks = STORY_ASKS.map(([label, prompt]) => ask("secondary", prompt, escape(label))).join("");
  // A tap opens the story straight from our server (the card calls get_station_story): asked in words, ChatGPT
  // searched the web for the headline instead (2026-10-08). The message is the fallback if the call fails.
  const cards = episodes.slice(0, 6).map((m) =>
    `<button type="button" class="hf-story ask" data-ask="${escape(`Tell me about the Radio Milwaukee story "${m.title}"`)}" data-call="${cardCall("get_station_story", { storyId: m.storyId, view: "story" })}">`
    + `${art(m.imageUrl, m.show, "hf-cover")}<b class="hf-kicker">${escape(showLabel(m.show))} · ${escape(shortDate(m.publishedAt))}</b><span class="hf-title">${escape(m.title)}</span></button>`).join("");
  return `<section class="hf-section" id="stories"><div class="hf-head"><h2>Latest stories</h2><div class="hf-actions">${asks}</div></div><div class="hf-row">${cards}</div></section>`;
}

function thisWeek(briefing: NonNullable<HomeData["briefing"]>): string {
  const rows = briefing.items.slice(0, 4).map((item, i) =>
    `<div class="hf-week-row"><span class="hf-num">${i + 1}</span><span class="hf-what"><b>${escape(item.heading)}</b><span>${escape(item.summary)}</span></span>${briefingButton(item)}</div>`).join("");
  return `<section class="hf-week" id="this-week"><div class="hf-head"><h2>This week</h2><span>From the ${escape(briefing.date)} newsletter</span></div>${rows}</section>`;
}

function yourFinds(finds: FindRow[] | null, playlists: PlaylistSummary[] | null): string {
  const head = `<div class="hf-head"><h2>Your Finds</h2>${finds?.length ? ask("hf-link", "What's in my Finds?", "See all") : ""}</div>`;
  if (finds === null) {
    return `<section class="hf-finds" id="finds">${head}<p>Sign in to see your Finds and playlists: the songs you save from any station.</p>${ask("secondary", "What's in my Finds?", "Sign in")}</section>`;
  }
  const rows = finds.length
    ? finds.slice(0, 4).map((f) => `<div class="hf-find">${art(sizedArtwork(f.artworkUrl), f.artist, "hf-thumb")}`
      + `<span class="hf-what"><b>${escape(f.title)}</b><span>${escape(f.artist)} · ${escape(stationName(f.stationSlug))}</span></span>`
      + `<button type="button" class="hf-icon ask" aria-label="${escape(`Add ${f.title} to a playlist`)}" data-ask="${escape(`Add "${f.title}" by ${f.artist} to a playlist`)}">${icon(PLUS)}</button></div>`).join("")
    : `<p>No Finds yet. Save a song from any song card, or say “save that song.”</p>`;
  const lists = playlists?.length
    ? playlists.slice(0, 3).map((pl) => ask("hf-playlist", `Show my playlist ${pl.name}`,
      `<span class="hf-pl-icon">${icon(PLAYLIST, 22)}</span><span class="hf-what"><b>${escape(pl.name)}</b><span>Playlist · ${pl.itemCount} song${pl.itemCount === 1 ? "" : "s"}</span></span>`)).join("")
    : ask("hf-playlist", "I'd like to make a playlist", `<span class="hf-pl-icon">${icon(PLAYLIST, 22)}</span><span class="hf-what"><b>Make a playlist</b><span>From songs you've heard</span></span>`);
  return `<section class="hf-finds" id="finds">${head}${rows}${lists}</section>`;
}

const EXPLORE: [label: string, prompt: string, paths: string][] = [
  ["Stations", "What's on Radio Milwaukee right now?", WAVES],
  ["Stories & podcasts", "What are the newest Radio Milwaukee stories?", HEADPHONES],
  ["Concerts & events", "What concerts are coming up in Milwaukee this weekend?", CALENDAR],
  ["Your Finds", "What's in my Finds?", BOOKMARK],
  ["Playlists", "Show my playlists", PLAYLIST],
  ["Requests & feedback", "I'd like to request a song", MESSAGE],
];

function explore(): string {
  const tiles = EXPLORE.map(([label, prompt, paths]) => ask("hf-tile", prompt, `${escape(label)}<span class="hf-badge">${icon(paths, 24)}</span>`)).join("");
  return `<section class="hf-section" id="explore"><h2>Explore</h2><div class="hf-explore">${tiles}</div></section>`;
}

const footer = () =>
  `<footer class="hf-foot"><span>Listener-supported Radio Milwaukee · <button type="button" class="details" data-url="https://radiomilwaukee.org">radiomilwaukee.org</button></span>`
  + `<span>Beta: ${ask("", "I'd like to send feedback about the Radio Milwaukee app", "tell us what's broken")}</span></footer>`;

// Display headlines in Barlow Condensed (it echoes the logo's lettering); body text stays ChatGPT's system font.
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap">';

export function homeFullView({ tiles, episodes, briefing, finds, playlists }: HomeData): string {
  const stories = episodes ?? [];
  return `${FONT}<div class="hf">${hero()}${startHere(tiles, stories, finds)}${onAir(tiles)}${stories.length ? latestStories(stories) : ""}`
    + `<div class="hf-split">${briefing && briefing.items.length ? thisWeek(briefing) : ""}${yourFinds(finds, playlists)}</div>`
    + `${explore()}${footer()}</div>`;
}

/** Scoped to .hf, after the chat card styles; theme colors come from them. Orange as text darkens in light mode (contrast). */
export const HOME_FULL_STYLE = `
.hf{--display:"Barlow Condensed",ui-sans-serif,system-ui,sans-serif;--accent-text:#A85A00;max-width:1200px;margin:0 auto;padding:40px 24px 64px;box-sizing:border-box;display:flex;flex-direction:column;gap:56px}
html[data-theme=dark] .hf{--accent-text:var(--accent)}
.hf h1,.hf h2,.hf h3{margin:0;font-family:var(--display);letter-spacing:-.2px}
.hf p{margin:0}
.hf button{font-family:inherit}
.hf-hero{display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.hf-logo{height:24px;width:auto;mix-blend-mode:multiply}
html[data-theme=dark] .hf-logo{filter:invert(1);mix-blend-mode:screen}
.hf h1{font-weight:700;font-size:clamp(40px,6vw,72px);line-height:1}
.hf h1 em{font-style:normal;color:var(--accent-text)}
.hf-hero p{max-width:620px;font-size:17px;line-height:26px;color:var(--text-2)}
.hf-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.hf-chip{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:9999px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;font-weight:500;white-space:nowrap}
.hf-chip:hover{background:var(--soft)}
.hf-section{display:flex;flex-direction:column;gap:18px;min-width:0}
.hf [id]{scroll-margin-top:24px}
.hf-target{animation:hf-flash 2.4s ease-out}
@keyframes hf-flash{0%,35%{box-shadow:0 0 0 3px var(--accent);border-radius:16px}100%{box-shadow:0 0 0 3px transparent;border-radius:16px}}
@media (prefers-reduced-motion:reduce){.hf-target{animation:none;box-shadow:0 0 0 3px var(--accent);border-radius:16px}}
.hf-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.hf h2{font-weight:600;font-size:32px;line-height:36px}
.hf-row{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px}
.hf-row::-webkit-scrollbar{display:none}
.hf-start{flex:none;width:min(560px,86vw);scroll-snap-align:start;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:20px;align-items:center;padding:20px;border-radius:24px;background:var(--inner);border:1px solid var(--border)}
.hf-start-text{flex:1 1 200px;display:flex;flex-direction:column;gap:14px;align-items:flex-start}
.hf-badge{width:44px;height:44px;flex:none;border-radius:9999px;background:var(--accent);color:var(--on-accent);display:inline-flex;align-items:center;justify-content:center}
.hf-start h3{font-weight:600;font-size:30px;line-height:32px}
.hf-start p{font-size:15px;line-height:22px;color:var(--text-2)}
.hf-start .primary{height:44px;padding:0 20px;font-size:15px;font-weight:600}
.hf-start-art{flex:0 1 236px;position:relative}
.hf-cover{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;display:block;background:var(--soft)}
.hf-caption{position:absolute;left:10px;right:10px;bottom:10px;box-sizing:border-box;padding:8px 10px;border-radius:12px;background:rgba(11,14,19,.86);color:#F4F5F7;font-size:12px;line-height:16px}
.hf-caption b{display:block;color:var(--accent);font-size:11px;letter-spacing:.6px;text-transform:uppercase}
.hf-saved{position:absolute;left:10px;top:10px;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:9999px;background:#F4F5F7;color:#14181E;font-size:12px;font-weight:600}
.hf-weekend{aspect-ratio:1/1;box-sizing:border-box;border-radius:16px;background:var(--text);color:var(--card);padding:18px;display:flex;flex-direction:column;gap:8px}
.hf-weekend b{font-family:var(--display);font-size:34px;line-height:34px}
.hf-weekend span{font-size:14px;line-height:20px;flex:1}
.hf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.hf-station{display:flex;flex-direction:column;gap:8px;min-width:0}
.hf-kicker{font-size:12px;line-height:16px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:var(--accent-text)}
.hf-title{font-size:16px;line-height:22px;font-weight:600}
.hf-sub{font-size:14px;line-height:20px;color:var(--text-2);margin-top:-6px}
.hf-actions{display:flex;flex-wrap:wrap;gap:6px}
.hf-actions .primary,.hf-actions .secondary{height:32px;padding:0 12px;font-size:13px}
.hf-live{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2)}
.hf-live i{width:8px;height:8px;border-radius:9999px;background:#1F9D61}
.hf-story{all:unset;cursor:pointer;flex:none;width:220px;scroll-snap-align:start;display:flex;flex-direction:column;gap:8px}
.hf-story .hf-cover{width:220px;height:220px}
.hf-story:focus-visible,.hf-playlist:focus-visible,.hf-tile:focus-visible{outline:2px solid var(--focus);outline-offset:4px;border-radius:16px}
.hf-split{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
.hf-week{flex:999 1 560px;min-width:0;box-sizing:border-box;padding:28px;border-radius:24px;background:var(--accent);color:#14181E;display:flex;flex-direction:column;gap:4px}
.hf-week h2{font-weight:700;font-size:40px;line-height:42px}
.hf-week .hf-head span{font-size:13px;font-weight:600}
.hf-week-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid rgba(20,24,30,.18)}
.hf-num{font-family:var(--display);font-weight:700;font-size:32px;line-height:32px;width:28px;flex:none}
.hf-what{display:flex;flex-direction:column;min-width:0;flex:1}
.hf-week .hf-what b{font-size:17px;line-height:24px}
.hf-week .hf-what span{font-size:14px;line-height:20px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hf-week .primary,.hf-week .secondary{height:36px;padding:0 14px;font-size:14px;background:#14181E;color:#F4F5F7;flex:none}
.hf-finds{flex:1 1 340px;min-width:0;box-sizing:border-box;padding:24px;border-radius:24px;background:var(--inner);border:1px solid var(--border);display:flex;flex-direction:column;gap:14px;align-items:stretch}
.hf-finds p{font-size:14px;line-height:20px;color:var(--text-2)}
.hf-finds > .secondary{align-self:flex-start}
.hf-find{display:flex;align-items:center;gap:12px}
.hf-thumb{width:52px;height:52px;border-radius:10px;object-fit:cover;flex:none;background:var(--soft)}
.hf-find .hf-what b{font-size:15px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hf-find .hf-what span,.hf-playlist .hf-what span{font-size:13px;line-height:18px;color:var(--text-2)}
.hf-icon{width:44px;height:44px;flex:none;border-radius:9999px;background:var(--soft);color:var(--text);display:inline-flex;align-items:center;justify-content:center}
.hf-playlist{all:unset;cursor:pointer;display:flex;align-items:center;gap:12px;padding-top:14px;border-top:1px solid var(--border)}
.hf-playlist .hf-what b{font-size:15px;line-height:20px}
.hf-pl-icon{width:52px;height:52px;flex:none;border-radius:10px;background:var(--accent);color:var(--on-accent);display:inline-flex;align-items:center;justify-content:center}
.hf-link{background:none;padding:0;color:var(--accent-text);font-size:14px;font-weight:500}
.hf-explore{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.hf-tile{display:flex;align-items:center;justify-content:space-between;gap:12px;height:84px;padding:0 12px 0 20px;border-radius:16px;background:var(--inner);color:var(--text);font-size:16px;font-weight:600;text-align:left}
.hf-tile:nth-child(odd){background:#FCE3C4;color:#14181E}
.hf-tile .hf-badge{width:56px;height:56px;border-radius:12px}
.hf-foot{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;font-size:13px;line-height:20px;color:var(--text-2);text-align:center}
.hf-foot button{background:none;padding:0;color:var(--accent-text);font-size:13px;text-decoration:underline}
@media (min-width:901px){.hf-starts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.hf-starts .hf-start{width:auto}}
@media (max-width:600px){
.hf{padding:28px 16px 48px;gap:40px}
.hf h2{font-size:28px;line-height:32px}
.hf-chips{flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;width:100%;scrollbar-width:none}
.hf-start{width:300px;flex-direction:column;align-items:stretch;padding:16px}
.hf-start-art{flex-basis:auto;order:-1}
.hf-start h3{font-size:26px;line-height:28px}
.hf-story{width:168px}.hf-story .hf-cover{width:168px;height:168px}
.hf-week{padding:20px}.hf-week h2{font-size:32px;line-height:34px}
.hf-week-row{flex-wrap:wrap}
.hf-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.hf-station .hf-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:15px;line-height:20px}
.hf-explore{grid-template-columns:repeat(2,minmax(0,1fr))}
.hf-tile{height:72px;padding:0 14px;font-size:15px}.hf-tile .hf-badge{display:none}
}`;
