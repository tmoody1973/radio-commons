import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { PlaylistUnavailable, type PlaylistClient } from "@/lib/playlist";
import { listenerIdFrom } from "@/lib/listenerAuth";
import { FieldGuideUnavailable, type FieldGuideClient, type PublicEvent } from "@/lib/fieldGuide";
import { fullPlacesView, renderView, type CardView, type EventItem } from "@/lib/card";
import { SITE } from "@/lib/card/tokens";
import { clusterPins, mapFrame, pinPositions } from "@/lib/map/geo";
import { createHash } from "node:crypto";
import { eventMapPoints, MAP_H, MAP_W, pinnedEvents, pinnedPlaces } from "@/lib/map/staticMap";
import {
  directAudioUrl, eventTime, EVENTS_UNAVAILABLE_SPEECH, NO_PLACES_FOR_EVENTS_SPEECH, NO_PLACES_SPEECH, spokenEvents, spokenPicks, NOT_ALLOWED_SPEECH, NOT_FOUND_SPEECH, LINK_ACCOUNT_SPEECH, PLAYLIST_UNAVAILABLE_SPEECH, spokenFinds, spokenLatest, spokenMatches, spokenPassages,
  spokenPlaces, spokenRecall, spokenDeleted, spokenSaved, spokenStory, spokenTrackFacts, UNAVAILABLE_SPEECH,
} from "@/lib/speech";
import { localWindow } from "@/lib/stationTime";
import { getStation } from "@/lib/stations";

export const CARD_URI = "ui://radio-commons/story-card.html";
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STORY_ID = /^[a-z0-9]{1,64}$/;
// Show artwork on f.prxu.org, audio on Dovetail, our logo and map pictures, fonts, and the fullscreen map (library + Amazon tiles).
const CARD_CSP = {
  resourceDomains: [
    "https://f.prxu.org", "https://dovetail.prxu.org", "https://dovetail-cdn.prxu.org", SITE,
    "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://unpkg.com",
  ],
  connectDomains: ["https://maps.geo.us-east-1.amazonaws.com", "https://unpkg.com"],
};
const INLINE_PLACES = 3;
const CARD = { _meta: { ui: { resourceUri: CARD_URI } } };

interface Deps {
  backstory: () => BackstoryClient;
  fieldGuide: () => FieldGuideClient;
  playlist: () => PlaylistClient;
  now?: () => Date;
  cardHtml: () => string;
}

interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const text = (t: string) => [{ type: "text" as const, text: t }];
const unavailable = (): ToolResult => ({ content: text(UNAVAILABLE_SPEECH), isError: true });
const playlistUnavailable = (): ToolResult => ({ content: text(PLAYLIST_UNAVAILABLE_SPEECH), isError: true });
const ACCOUNT_LINKING_REQUIRED = { error: "account_linking_required" };
const accountLinkingRequired = (): ToolResult => ({ content: text(LINK_ACCOUNT_SPEECH), isError: true, structuredContent: ACCOUNT_LINKING_REQUIRED });
const eventsUnavailable = (): ToolResult => ({ content: text(EVENTS_UNAVAILABLE_SPEECH), isError: true });
const WHEN = ["tonight", "today", "this-weekend", "this-week"] as const;
const clean = (story: Story): Story => {
  const audioUrl = directAudioUrl(story.audioUrl);
  // Premiere audio plays (Tarik, 2026-10-04) unless PLAY_PREMIERE_AUDIO=off; then the card links to the article.
  const off = process.env.PLAY_PREMIERE_AUDIO === "off" && story.contentType === "premiere";
  const song = story.song && off ? { ...story.song, audioUrl: null } : story.song;
  return { ...story, audioUrl: off ? "" : audioUrl, song };
};

const chicagoDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));

/**
 * The premiere's release show as a Field Guide event (same Milwaukee day, venue named), for Add to calendar; null when
 * there is none or the guide can't be reached. ponytail: the guide's default window is this week, so a release show
 * further out isn't found yet; a date range in the public API if that matters before the show week.
 */
async function releaseEventFor(story: Story, fieldGuide: () => FieldGuideClient): Promise<PublicEvent | null> {
  const show = story.song?.releaseShow;
  if (!show) return null;
  try {
    const events = await fieldGuide().events({ q: story.song!.artist });
    const venue = show.venue.toLowerCase();
    return events.find((e) => chicagoDay(e.startAt) === show.date && (e.venue?.name ?? "").toLowerCase().includes(venue)) ?? null;
  } catch {
    return null;
  }
}

/** Logs every call's duration (the Alexa+ budget is 500 ms); Backstory failures become a plain apology. */
async function timed(tool: string, run: () => Promise<ToolResult>, fallback: () => ToolResult): Promise<ToolResult> {
  const started = Date.now();
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof BackstoryUnavailable) && !(error instanceof FieldGuideUnavailable) && !(error instanceof PlaylistUnavailable)) throw error;
    console.error(JSON.stringify({ tool, error: error.message }));
    return fallback();
  } finally {
    console.log(JSON.stringify({ tool, ms: Date.now() - started }));
  }
}

/** The places view: Amazon's map of the first places with numbered badges, plus the fullscreen map's data. */
function placesCard(story: Story) {
  const pinned = pinnedPlaces(story);
  const first = pinned.slice(0, INLINE_PLACES);
  const frame = mapFrame(first, MAP_W, MAP_H);
  const badges = clusterPins(pinPositions(first, frame, MAP_W, MAP_H));
  // The version follows the pins: re-pinning a place changes the address, so a cached old map is never shown under new pins.
  const version = createHash("sha256").update(first.map((p) => `${p.lat},${p.lng}`).join(";")).digest("hex").slice(0, 10);
  const url = `${SITE}/api/map?story=${encodeURIComponent(story.storyId)}&w=${MAP_W}&h=${MAP_H}&n=${first.length}&theme=light&v=${version}`;
  const groups = new Map<string, { numbers: number[]; lat: number; lng: number }>();
  pinned.forEach((p, i) => {
    const key = `${p.lat},${p.lng}`;
    const group = groups.get(key) ?? { numbers: [], lat: p.lat, lng: p.lng };
    group.numbers.push(i + 1);
    groups.set(key, group);
  });
  return {
    cardHtml: renderView({ view: "places", story, map: { url, w: MAP_W, h: MAP_H, badges } }),
    fullHtml: fullPlacesView(story),
    mapPlaces: [...groups.values()],
  };
}

export function buildMcpHandler(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const station = getStation();
  const shows = station.shows.map((s) => s.slug) as [string, ...string[]];
  const card = (view: CardView, extra: Record<string, unknown> = {}) => ({ stationId: station.stationId, view: view.view, cardHtml: renderView(view), ...extra });
  return createMcpHandler(
    (server) => {
      registerAppTool(
        server,
        "find_station_story",
        {
          title: "Find a Radio Milwaukee story",
          description:
            "Find a Radio Milwaukee podcast story a listener remembers, by topic, person, place, neighborhood or something said in it. Returns up to three published stories. Use only these results; never invent a story.",
          inputSchema: z.object({ description: z.string().min(1).max(200), show: z.enum(shows).optional() }),
          ...CARD,
        },
        async ({ description, show }) =>
          timed("find_station_story", async () => {
            const matches = (await deps.backstory().searchStoryCards(description, show)).slice(0, 3);
            // The ids also go in text: some hosts give the model only `content`, and it needs them for the next tool.
            const ids = JSON.stringify({ matches: matches.map(({ storyId, title, show }) => ({ storyId, title, show })) });
            return {
              content: [...text(spokenMatches(matches)), ...text(ids)],
              structuredContent: matches.length ? card({ view: "stories", matches }, { matches }) : { stationId: station.stationId, matches },
            };
          }, unavailable),
      );

      registerAppTool(
        server,
        "latest_station_stories",
        {
          title: "The newest Radio Milwaukee stories",
          description: "List the newest published Radio Milwaukee stories, optionally for one show, numbered so the listener can pick one. Use for 'what's new' or 'the latest episode'.",
          inputSchema: z.object({ show: z.enum(shows).optional() }),
          ...CARD,
        },
        async ({ show }) =>
          timed("latest_station_stories", async () => {
            const matches = (await deps.backstory().latestStoryCards(show)).slice(0, 3);
            const ids = JSON.stringify({ matches: matches.map(({ storyId, title, show }) => ({ storyId, title, show })) });
            return {
              content: [...text(spokenLatest(matches)), ...text(ids)],
              structuredContent: matches.length ? card({ view: "stories", matches }, { matches }) : { stationId: station.stationId, matches },
            };
          }, unavailable),
      );

      registerAppTool(
        server,
        "get_station_story",
        {
          title: "Tell me about a Radio Milwaukee story",
          description:
            "Tell the listener about one Radio Milwaukee story. Speak only from this record, always say the show and month, and describe the summary as Radio Milwaukee's, not your own. Use view \"places\" when the listener asks where the story's places are; it shows them on a map.",
          inputSchema: z.object({ storyId: z.string().min(1).max(64), view: z.enum(["story", "places"]).optional() }),
          ...CARD,
        },
        async ({ storyId, view }) =>
          timed("get_station_story", async () => {
            const found = STORY_ID.test(storyId) ? await deps.backstory().getStory(storyId) : null;
            if (!found) return { content: text(NOT_FOUND_SPEECH) };
            const story = clean(found);
            if (view === "places") {
              const pinned = pinnedPlaces(story);
              const names = pinned.map((p) => p.name);
              // Mention booking for a place the listener can see on screen (the first three) that has a link.
              const reservable = pinned.slice(0, 3).find((p) => p.reservationUrl)?.name;
              if (names.length === 0) return { content: text(NO_PLACES_SPEECH), structuredContent: card({ view: "story", story }, { story }) };
              return { content: text(spokenPlaces(names, reservable)), structuredContent: { stationId: station.stationId, view: "places", story, ...placesCard(story) } };
            }
            const releaseEvent = story.contentType === "premiere" ? await releaseEventFor(story, deps.fieldGuide) : null;
            return { content: text(spokenStory(story)), structuredContent: card({ view: "story", story, releaseEvent }, { story }) };
          }, unavailable),
      );

      registerAppTool(
        server,
        "ask_station_story",
        {
          title: "Answer a detail question about a Radio Milwaukee story",
          description:
            "Answer a listener's detail question about one Radio Milwaukee story using the station's own words. Quote the passages exactly, say when in the episode each is heard, and never add facts. If detailed answers aren't available or nothing matches, say so.",
          inputSchema: z.object({ storyId: z.string().min(1).max(64), question: z.string().min(1).max(200) }),
          ...CARD,
        },
        async ({ storyId, question }) =>
          timed("ask_station_story", async () => {
            if (!STORY_ID.test(storyId)) return { content: text(NOT_FOUND_SPEECH) };
            const [found, asked] = await Promise.all([deps.backstory().getStory(storyId), deps.backstory().askStory(storyId, question)]);
            if (!found || asked.status === "not_found") return { content: text(NOT_FOUND_SPEECH) };
            if (asked.status === "not_allowed") return { content: text(NOT_ALLOWED_SPEECH) };
            const story = clean(found);
            const view: CardView = asked.passages.length ? { view: "quote", story, passages: asked.passages } : { view: "story", story };
            return { content: text(spokenPassages(asked.passages, story.contentType)), structuredContent: card(view, { story, passages: asked.passages }) };
          }, unavailable),
      );

      registerAppTool(
        server,
        "find_events",
        {
          title: "Find events in Milwaukee",
          description:
            "Find upcoming events from Radio Milwaukee's event guide (the MKE Field Guide): by words (\"live music\"), time (tonight, today, this weekend, this week), free only, or near a place from a story the listener is looking at (nearStoryId, optionally nearPlace by name). Use only these results; never invent an event.",
          inputSchema: z.object({
            query: z.string().min(1).max(120).optional(),
            when: z.enum(WHEN).optional(),
            freeOnly: z.boolean().optional(),
            nearStoryId: z.string().min(1).max(64).optional(),
            nearPlace: z.string().min(1).max(80).optional(),
          }),
          ...CARD,
        },
        async ({ query, when, freeOnly, nearStoryId, nearPlace }) =>
          timed("find_events", async () => {
            const now = new Date();
            const base = { ...(query ? { q: query } : {}), ...(when ? { when } : {}), ...(freeOnly ? { free: true } : {}) };
            const items = (events: PublicEvent[]): EventItem[] => events.map((event) => ({ event, when: eventTime(event.startAt, now) }));
            if (!nearStoryId) {
              const events = (await deps.fieldGuide().events({ ...base, limit: 5 })).slice(0, 5);
              return {
                content: text(spokenEvents(events, { now, when })),
                ...(events.length ? { structuredContent: card({ view: "events", items: items(events) }, { events }) } : {}),
              };
            }
            const story = STORY_ID.test(nearStoryId) ? await deps.backstory().getStory(nearStoryId) : null;
            if (!story) return { content: text(NOT_FOUND_SPEECH) };
            const pinned = pinnedPlaces(story);
            if (pinned.length === 0) return { content: text(NO_PLACES_FOR_EVENTS_SPEECH) };
            // The place the listener named, else the story's first pinned place.
            const wanted = nearPlace?.toLowerCase();
            const index = Math.max(0, wanted ? pinned.findIndex((p) => p.name.toLowerCase().includes(wanted) || wanted.includes(p.name.toLowerCase())) : 0);
            const place = pinned[index];
            const near = { lat: place.lat, lng: place.lng };
            // One call out to 3 miles (nearest first): within a mile if anything is, else say we looked farther.
            let events = pinnedEvents(await deps.fieldGuide().events({ ...base, near, radiusMiles: 3, limit: 3 }));
            const widened = events.length > 0 && (events[0].distanceMiles ?? 0) > 1;
            if (!widened) events = events.filter((e) => (e.distanceMiles ?? 0) <= 1);
            events = events.slice(0, 3);
            const speech = spokenEvents(events, { now, near: place.name, widened, when });
            if (events.length === 0) return { content: text(speech) };
            // One frame for the picture and the badges: the events in order, then the starred place.
            const points = eventMapPoints(events, near);
            const frame = mapFrame(points, MAP_W, MAP_H);
            const positions = pinPositions(points, frame, MAP_W, MAP_H);
            const badges = clusterPins(positions.slice(0, events.length));
            const star = positions[events.length];
            // Versioned by the points, like story maps: a moved pin changes the address, so a cached old map never shows.
            const version = createHash("sha256").update(points.map((p) => `${p.lat},${p.lng}`).join(";")).digest("hex").slice(0, 10);
            const url = `${SITE}/api/map?events=${events.map((e) => e.id).join(",")}&anchor=${encodeURIComponent(story.storyId)}&ai=${index}&w=${MAP_W}&h=${MAP_H}&theme=light&v=${version}`;
            return {
              content: text(speech),
              structuredContent: card({ view: "events-map", items: items(events), map: { url, w: MAP_W, h: MAP_H, badges, anchor: { ...star, name: place.name } } }, { events }),
            };
          }, eventsUnavailable),
      );

      registerAppTool(
        server,
        "station_picks",
        {
          title: "What Radio Milwaukee recommends",
          description: "This week's Radio Milwaukee staff picks, in the curator's own words, plus upcoming Radio Milwaukee events. Use for 'what is Radio Milwaukee recommending?'.",
          inputSchema: z.object({}),
          ...CARD,
        },
        async () =>
          timed("station_picks", async () => {
            const now = new Date();
            const events = (await deps.fieldGuide().picks()).slice(0, 3);
            return {
              content: text(spokenPicks(events, now)),
              ...(events.length ? { structuredContent: card({ view: "events", items: events.map((event) => ({ event, when: eventTime(event.startAt, now) })) }, { events }) } : {}),
            };
          }, eventsUnavailable),
      );

      server.registerTool(
        "find_song_played",
        {
          title: "Find a song Radio Milwaukee played",
          description:
            "Find a song Radio Milwaukee played on one of its stations, by station and time window, optionally with descriptive cues like 'horns'. Returns numbered matches with playIds; pass a playId to save_find or get_track_story. Use for 'what was that song on 88Nine this morning?' and 'the one before that' (beforePlayId; pass the same window again). Times are Milwaukee local time, 24-hour HH:MM. Map 'this morning' to 06:00-12:00, 'this afternoon' 12:00-17:00, 'tonight'/'this evening' 17:00-23:59, 'around 8:15' to 08:00-08:30. day is 'today' (default) or 'yesterday'. Use afterPlayId for 'the one after that'. If endTime is earlier than startTime, the window crosses midnight.",
          inputSchema: z.object({
            station: z.enum(["hyfin", "88nine", "414music", "rhythmlab"]),
            day: z.enum(["today", "yesterday"]).optional(),
            startTime: z.string().regex(CLOCK_TIME),
            endTime: z.string().regex(CLOCK_TIME),
            cues: z.array(z.string().max(30)).max(5).optional(),
            beforePlayId: z.string().max(64).optional(),
            afterPlayId: z.string().max(64).optional(),
          }),
        },
        async ({ day, startTime, endTime, ...rest }) =>
          timed("find_song_played", async () => {
            const window = localWindow({ day: day ?? "today", startTime, endTime }, now());
            const result = await deps.playlist().findSongPlayed({ ...rest, ...window });
            const matches = result.matches.map(({ label, playId, trackId, artist, title, playedAt }) => ({ label, playId, trackId, artist, title, playedAt }));
            return {
              content: [...text(spokenRecall(result)), ...text(JSON.stringify({ matches }))],
              structuredContent: { stationId: station.stationId, matches, status: result.status },
            };
          }, playlistUnavailable),
      );

      server.registerTool(
        "get_track_story",
        {
          title: "More about a song Radio Milwaukee played",
          description: "Tell the listener more about a song Radio Milwaukee played, by trackId or playId from find_song_played. Speak only from this record.",
          inputSchema: z.object({ trackId: z.string().max(64).optional(), playId: z.string().max(64).optional() }),
        },
        async (args) =>
          timed("get_track_story", async () => {
            const facts = await deps.playlist().getTrackFacts(args);
            return { content: text(spokenTrackFacts(facts)), structuredContent: { ...facts } };
          }, playlistUnavailable),
      );

      server.registerTool(
        "save_find",
        {
          title: "Save a song to 88Nine Finds",
          description: "Save a song the listener heard on Radio Milwaukee to their 88Nine Finds (and Apple Music if connected). Requires a linked account. Pass the playId from find_song_played. Use for 'save it', 'save that song'.",
          inputSchema: z.object({ playId: z.string().min(1).max(64) }),
          annotations: { idempotentHint: true },
        },
        async ({ playId }, context) =>
          timed("save_find", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const saved = await deps.playlist().saveFind(listenerId, playId);
            return { content: text(spokenSaved(saved)), structuredContent: { ...saved } };
          }, playlistUnavailable),
      );

      server.registerTool(
        "list_finds",
        {
          title: "List my Finds",
          description: "List the listener's saved Radio Milwaukee Finds, newest first, numbered. Requires a linked account. Use for 'what's in my Finds?'.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
        },
        async ({ limit }, context) =>
          timed("list_finds", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const finds = await deps.playlist().listFinds(listenerId, limit);
            return { content: text(spokenFinds(finds)), structuredContent: { finds } };
          }, playlistUnavailable),
      );

      server.registerTool(
        "delete_my_finds",
        {
          title: "Delete my Finds",
          description: "Permanently delete all of the listener's Finds and disconnect Apple Music. Requires a linked account. Only call after the listener has clearly confirmed.",
          inputSchema: z.object({}),
          annotations: { destructiveHint: true, idempotentHint: true },
        },
        async (_args, context) =>
          timed("delete_my_finds", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const deleted = await deps.playlist().deleteFinds(listenerId);
            return { content: text(spokenDeleted(deleted)), structuredContent: { ...deleted } };
          }, playlistUnavailable),
      );

      registerAppResource(server, "Story card", CARD_URI, { description: "A Radio Milwaukee story, quote, list or map, in Alexa+ style." }, async () => ({
        contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.cardHtml(), _meta: { ui: { csp: CARD_CSP } } }],
      }));
    },
    { serverInfo: { name: "radio-commons", version: "0.2.0" } },
  );
}
