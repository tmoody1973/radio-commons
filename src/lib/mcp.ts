import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { PlaylistUnavailable, type Digest, type PlaylistClient, type RecallMatch, type RecentSong, type SavedFind, type Station } from "@/lib/playlist";
import { listenerIdFrom } from "@/lib/listenerAuth";
import { CAPABILITIES, CAPABILITIES_SPEECH } from "@/lib/capabilities";
import { FieldGuideUnavailable, type FieldGuideClient, type PublicEvent } from "@/lib/fieldGuide";
import { fullPlacesView, renderView, type CardView, type EventItem } from "@/lib/card";
import { sizedArtwork, songCardFromFacts, songCardFromMatch, songCardFromRecent, songCardFromSearch, STATION_NAMES } from "@/lib/card/song";
import { bestRecentMatch } from "@/lib/songMatch";
import { SITE } from "@/lib/card/tokens";
import { clusterPins, mapFrame, pinPositions } from "@/lib/map/geo";
import { createHash } from "node:crypto";
import { eventMapPoints, MAP_H, MAP_W, pinnedEvents, pinnedPlaces } from "@/lib/map/staticMap";
import {
  directAudioUrl, eventTime, EVENTS_UNAVAILABLE_SPEECH, NO_PLACES_FOR_EVENTS_SPEECH, NO_PLACES_SPEECH, spokenEvents, spokenPicks, NOT_ALLOWED_SPEECH, NOT_FOUND_SPEECH, EMPTY_DIGEST_SPEECH, EMPTY_DIGEST_NO_PICKS_SPEECH, LINK_ACCOUNT_SPEECH, PLAYLIST_UNAVAILABLE_SPEECH, spokenDigest, spokenFinds, spokenLatest, spokenMatches, spokenPassages,
  spokenOnAir, spokenPlaces, spokenRecall, spokenRecent, spokenSearch, spokenStationShows, spokenDeleted, spokenFollowed, spokenSaved, spokenUnfollowed, WHICH_ARTIST_TO_FOLLOW_SPEECH, WHICH_ARTIST_TO_UNFOLLOW_SPEECH, spokenStory, spokenTrackFacts, UNAVAILABLE_SPEECH,
} from "@/lib/speech";
import { localWindow } from "@/lib/stationTime";
import { getStation } from "@/lib/stations";
import { STREAM_HOST } from "@/lib/streams";

export const CARD_URI = "ui://radio-commons/story-card.html";
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Playlist play ids are long lowercase ids; a list number like "1" fails here so Alexa retries with the real one.
const DEFAULT_RECENT_SONGS = 5;
const SEARCH_RESULTS_SHOWN = 5;
const MUSIC_STATIONS = ["88nine", "hyfin", "rhythmlab", "414music"] as const;
const STATION_SLUG = z.enum(MUSIC_STATIONS);
const MAX_RECENT_SONGS = 10;
// ponytail: a play older than this is not "on air"; songs rarely run past it, and a long DJ break just reads "Live now".
const ON_AIR_MAX_AGE_MS = 20 * 60_000;
const PLAY_ID = z.string().regex(/^[a-z0-9_]{6,64}$/, "Use the playId from find_song_played; use the number field for list numbers.");
const STORY_ID = /^[a-z0-9]{1,64}$/;
// Show artwork on f.prxu.org, audio on Dovetail, our logo and map pictures, fonts, and the fullscreen map (library + Amazon tiles).
const CARD_CSP = {
  resourceDomains: [
    "https://f.prxu.org", "https://dovetail.prxu.org", "https://dovetail-cdn.prxu.org", SITE,
    "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://unpkg.com",
    // Song cards: Apple album artwork and 30-second previews.
    "https://*.mzstatic.com", "https://audio-ssl.itunes.apple.com",
    // On air now: the stations' live streams.
    STREAM_HOST,
    // Finds and digest cards: event photos from Ticketmaster and AXS listings.
    "https://s1.ticketm.net", "https://images.discovery-prod.axs.com",
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
  /** Runs work after the reply is sent (Next's `after`); the default just starts it. */
  defer?: (task: () => Promise<unknown>) => void;
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
const WHEN = ["tonight", "today", "tomorrow", "this-weekend", "this-week"] as const;
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
const minutesAgo = (playedAt: number, at: number) => {
  const minutes = Math.max(0, Math.round((at - playedAt) / 60_000));
  return minutes === 0 ? "Just now" : `${minutes} min ago`;
};
const onAirSong = (play: RecentSong | null, at: number) =>
  play && at - play.playedAt <= ON_AIR_MAX_AGE_MS ? { ...play, when: minutesAgo(play.playedAt, at) } : null;

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
  // Memory writes never block or fail a reply; a failure logs a fixed event name (never the listener id).
  const defer = (task: () => Promise<unknown>) => {
      const logFailure = () => console.error(JSON.stringify({ event: "deferred_task_failed" }));
      try {
        (deps.defer ?? ((run) => void run()))(() => task().catch(logFailure));
      } catch {
        logFailure(); // e.g. after() outside a request scope: never fail the reply
      }
    };
  // The station's picks as spoken text and an events card; shared by station_picks and an empty digest.
  const picksReply = async () => {
    const at = now();
    const events = (await deps.fieldGuide().picks()).slice(0, 3);
    return {
      speech: spokenPicks(events, at),
      ...(events.length ? { structuredContent: card({ view: "events", items: events.map((event) => ({ event, when: eventTime(event.startAt, at) })) }, { events }) } : {}),
    };
  };
  const digestReply = async (digest: Digest): Promise<ToolResult> => {
    if (digest.items.length > 0) {
      return { content: text(spokenDigest(digest.items)), structuredContent: card({ view: "digest", artists: digest.artists, items: digest.items }) };
    }
    try {
      const { speech, structuredContent } = await picksReply();
      if (!structuredContent) return { content: text(EMPTY_DIGEST_NO_PICKS_SPEECH) };
      return { content: text(`${EMPTY_DIGEST_SPEECH} ${speech}`), structuredContent };
    } catch (error) {
      if (!(error instanceof FieldGuideUnavailable)) throw error;
      return { content: text(EMPTY_DIGEST_NO_PICKS_SPEECH) };
    }
  };
  // A lost screen list only matters when the number is all we have; a playId or title still names the song.
  const screenPlayOrNull = async (listenerId: string, number: number, hasOtherName: boolean) => {
    try {
      return await deps.playlist().screenPlay(listenerId, number);
    } catch (error) {
      if (hasOtherName && error instanceof PlaylistUnavailable) return null;
      throw error;
    }
  };
  // So "save number 2" works later: remember the numbered list exactly as the listener sees it.
  const rememberScreen = (context: { http?: Parameters<typeof listenerIdFrom>[0] }, playIds: string[]) => {
    const listenerId = listenerIdFrom(context.http ?? {});
    if (listenerId && playIds.length) defer(() => deps.playlist().rememberScreen(listenerId, playIds));
  };
  // One station's newest play; a station the playlist can't reach still gets its "Live now" tile.
  const latestPlay = async (where: Station): Promise<RecentSong | null> => {
    try {
      return (await deps.playlist().recentSongs(where, 1))[0] ?? null;
    } catch (error) {
      if (!(error instanceof PlaylistUnavailable)) throw error;
      return null;
    }
  };
  // One guess gets the full song card; several become a numbered list so "save number 2" matches the screen.
  const recallCard = (matches: RecallMatch[], slug: Station) =>
    matches.length === 0 ? {}
      : matches.length === 1 ? card({ view: "song", song: songCardFromMatch(matches[0], slug) })
        : card({ view: "songs", songs: matches.map((match) => songCardFromMatch(match, slug)) });
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
            "Find upcoming events from Radio Milwaukee's event guide (the MKE Field Guide): by words (\"live music\"), time (tonight, today, tomorrow, this weekend, this week), free only, or near a place from a story the listener is looking at (nearStoryId, optionally nearPlace by name). Use only these results; never invent an event. For general events not tied to the station's artists; for concerts by artists a station plays (\"88Nine artists with shows\"), use station_artist_shows.",
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
        "station_artist_shows",
        {
          title: "Shows by artists Radio Milwaukee plays",
          description: "Upcoming concerts by artists Radio Milwaukee's stations have been playing, Milwaukee-area shows first. Use for \"88Nine artists with concerts coming up\", \"artists you play\", \"artists on HYFIN\", \"who's touring\", \"which artists from the station have concerts\". Pass station when the listener names one; omit it for all of Radio Milwaukee. No linked account needed. Not for the artists the listener follows (whats_new_for_me) or general events tonight or this weekend (find_events). Use only these results; never invent a show.",
          inputSchema: z.object({ station: STATION_SLUG.optional() }),
          ...CARD,
        },
        async ({ station: slug }) =>
          timed("station_artist_shows", async () => {
            const { shows } = await deps.playlist().stationArtistShows(slug);
            return {
              content: text(spokenStationShows(shows, slug)),
              ...(shows.length ? { structuredContent: card({ view: "station-shows", shows }, { shows }) } : {}),
            };
          }, playlistUnavailable),
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
            const { speech, structuredContent } = await picksReply();
            return { content: text(speech), ...(structuredContent ? { structuredContent } : {}) };
          }, eventsUnavailable),
      );

      registerAppTool(
        server,
        "what_can_you_do",
        {
          title: "What Radio Milwaukee can do",
          description: "A short summary of what Radio Milwaukee can do here, with a tile and an example to tap for each. Use for \"what can you do\", \"help\", \"what can Radio Milwaukee do\", \"how do I use this\". Speak the summary as given. If the listener then says \"tell me more\", describe the capabilities from this result two at a time, each with its example. No linked account needed.",
          inputSchema: z.object({}),
          ...CARD,
        },
        async () => ({
          // The list rides along for "tell me more"; the voice reads only the short summary.
          content: [...text(CAPABILITIES_SPEECH), ...text(JSON.stringify({ capabilities: CAPABILITIES }))],
          structuredContent: card({ view: "capabilities" }),
        }),
      );

      registerAppTool(
        server,
        "find_song_played",
        {
          title: "Find a song Radio Milwaukee played",
          description:
            "Find a song Radio Milwaukee played on one of its stations, by station and time window, optionally with descriptive cues like 'horns'. Returns numbered matches with playIds; pass a playId to save_find or get_track_story. Use for 'what was that song on 88Nine this morning?' and 'the one before that'; for 'what's playing now' use on_air_now; for 'the last 5 songs', use recent_songs instead (beforePlayId; pass the same window again). Times are Milwaukee local time, 24-hour HH:MM. Map 'this morning' to 06:00-12:00, 'this afternoon' 12:00-17:00, 'tonight'/'this evening' 17:00-23:59, 'around 8:15' to 08:00-08:30. day is 'today' (default) or 'yesterday'. Use afterPlayId for 'the one after that'. If endTime is earlier than startTime, the window crosses midnight.",
          inputSchema: z.object({
            station: z.enum(["hyfin", "88nine", "414music", "rhythmlab"]),
            day: z.enum(["today", "yesterday"]).optional(),
            startTime: z.string().regex(CLOCK_TIME),
            endTime: z.string().regex(CLOCK_TIME),
            cues: z.array(z.string().max(30)).max(5).optional(),
            beforePlayId: PLAY_ID.optional(),
            afterPlayId: PLAY_ID.optional(),
          }),
          ...CARD,
        },
        async ({ day, startTime, endTime, ...rest }, context) =>
          timed("find_song_played", async () => {
            const window = localWindow({ day: day ?? "today", startTime, endTime }, now());
            const result = await deps.playlist().findSongPlayed({ ...rest, ...window });
            // One id per song: extra ids (trackId, list labels) led Alexa to save with the wrong one.
            const matches = result.matches.map(({ playId, artist, title, playedAt }) => ({ playId, artist, title, playedAt }));
            // A single match is spoken by title and needs no number.
            if (matches.length >= 2) rememberScreen(context, matches.map((match) => match.playId));
            return {
              content: [...text(spokenRecall(result)), ...text(JSON.stringify({ matches }))],
              structuredContent: {
                ...recallCard(result.matches, rest.station),
                stationId: station.stationId, matches, status: result.status,
              },
            };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "search_playlist",
        {
          title: "Search Radio Milwaukee's playlists",
          description: "Search what Radio Milwaukee's stations played over about the last two weeks, by artist or song title. Use for 'when did you last play Nas?', 'have you played the new Thao song?', 'what Kendrick have you played?'. Searches every station unless one is named. Returns numbered songs, newest first, with playIds for save_find and get_track_story.",
          inputSchema: z.object({ query: z.string().min(2).max(100), station: STATION_SLUG.optional() }),
          ...CARD,
        },
        async ({ query, station: slug }, context) =>
          timed("search_playlist", async () => {
            const hits = (await deps.playlist().searchPlaysIndexed(slug, query)).slice(0, SEARCH_RESULTS_SHOWN);
            rememberScreen(context, hits.map((hit) => hit.playId));
            const songs = hits.map(({ playId, artist, title, playedAt, station: where }, i) => ({ number: i + 1, playId, artist, title, playedAt, station: where }));
            const top = hits[0] && { ...hits[0], stationName: STATION_NAMES[hits[0].station] };
            return {
              content: [...text(spokenSearch(query, top, now())), ...text(JSON.stringify({ songs }))],
              structuredContent: {
                ...(hits.length ? card({ view: "songs", songs: hits.map((hit) => songCardFromSearch(hit, hit.station)) }) : {}),
                stationId: station.stationId, songs,
              },
            };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "recent_songs",
        {
          title: "Latest songs Radio Milwaukee played",
          description:
            "The most recent songs on a Radio Milwaukee station, newest first, numbered. Use for 'what did you just play?', 'what just played?', 'the last 5 songs on 88Nine'. For what's on or playing right now, or to listen, use on_air_now. save_find takes the `number` field for 'save number 2'; get_track_story takes the playId. For a song at a past time ('around 2 pm'), use find_song_played.",
          inputSchema: z.object({
            station: z.enum(["hyfin", "88nine", "414music", "rhythmlab"]),
            count: z.number().int().min(1).max(MAX_RECENT_SONGS).optional(),
          }),
          ...CARD,
        },
        async ({ station: slug, count }, context) =>
          timed("recent_songs", async () => {
            const songs = await deps.playlist().recentSongs(slug, count ?? DEFAULT_RECENT_SONGS);
            rememberScreen(context, songs.map((song) => song.playId));
            const numbered = songs.map(({ playId, artist, title, playedAt }, i) => ({ number: i + 1, playId, artist, title, playedAt }));
            return {
              content: [...text(spokenRecent(STATION_NAMES[slug], songs)), ...text(JSON.stringify({ songs: numbered }))],
              structuredContent: {
                ...(songs.length ? card({ view: "songs", songs: songs.map(songCardFromRecent) }) : {}),
                stationId: station.stationId, songs: numbered,
              },
            };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "on_air_now",
        {
          title: "On air now on Radio Milwaukee",
          description: "What's on Radio Milwaukee's stations right now, with a Listen live button that plays each station's live stream on screen. Use for \"what's on now\", \"what's on Radio Milwaukee right now\", \"what's playing right now on HYFIN\", \"listen to 88Nine\", \"play HYFIN\", \"put on Rhythm Lab\". Pass station when the listener names one; omit it for all four stations. No linked account needed. Not for 'the last 5 songs' or 'what did you just play' (recent_songs). Speak the answer as given.",
          inputSchema: z.object({ station: STATION_SLUG.optional() }),
          ...CARD,
        },
        async ({ station: slug }) =>
          timed("on_air_now", async () => {
            const at = now().getTime();
            const tiles = await Promise.all((slug ? [slug] : MUSIC_STATIONS).map(async (where) => ({ station: where, song: onAirSong(await latestPlay(where), at) })));
            const stations = tiles.map(({ station: where, song }) => ({ station: where, song: song && { playId: song.playId, title: song.title, artist: song.artist, playedAt: song.playedAt } }));
            return { content: text(spokenOnAir(tiles)), structuredContent: card({ view: "on-air", tiles }, { stations }) };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "get_track_story",
        {
          title: "More about a song Radio Milwaukee played",
          description: "Tell the listener more about a song Radio Milwaukee played: credits, album, year, upcoming local shows. Pass its playId if you have it, and always also its title and artist (and station if known) so it is found even without an id. Use for 'what are the credits on that?', 'tell me about Groove Thang'. Speak only from this record.",
          inputSchema: z.object({
            playId: PLAY_ID.optional(),
            title: z.string().max(200).optional(),
            artist: z.string().max(200).optional(),
            station: STATION_SLUG.optional(),
          }),
          ...CARD,
        },
        async ({ playId, title, artist, station: slug }) =>
          timed("get_track_story", async () => {
            let facts = playId ? await deps.playlist().getTrackFacts({ playId }) : { status: "not_found" as const };
            if (facts.status === "not_found" && (title || artist)) {
              const found = bestRecentMatch(await deps.playlist().searchPlaysIndexed(slug, (title ?? artist)!), { title, artist });
              if (found) facts = await deps.playlist().getTrackFacts({ playId: found });
            }
            const songCard = facts.status === "ok" ? card({ view: "song", song: songCardFromFacts(facts) }) : {};
            return { content: text(spokenTrackFacts(facts)), structuredContent: { ...facts, ...songCard } };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "save_find",
        {
          title: "Save a song to 88Nine Finds",
          description: "Save a song the listener heard on Radio Milwaukee to their 88Nine Finds (and Apple Music if connected). Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Pass number (1-10) only when the listener says a number (\"save number 3\"). Otherwise pass the playId from recent_songs, find_song_played or search_playlist if you have it, and always also pass the song's title and artist (and station if known) so the right play is found even without an id. Use for 'save it', 'save number 3', 'save the song by Thao'.",
          inputSchema: z.object({
            number: z.number().int().min(1).max(10).optional(),
            playId: PLAY_ID.optional(),
            title: z.string().max(200).optional(),
            artist: z.string().max(200).optional(),
            station: STATION_SLUG.optional(),
          }),
          annotations: { idempotentHint: true },
          ...CARD,
        },
        async ({ number, playId, title, artist, station: slug }, context) =>
          timed("save_find", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            // A named song always beats a number: the remembered list can be 30 minutes stale.
            const onScreen = number === undefined || title ? null : await screenPlayOrNull(listenerId, number, Boolean(playId || title));
            const firstId = onScreen ?? playId;
            let saved: SavedFind = firstId ? await deps.playlist().saveFind(listenerId, firstId) : { status: "not_found" };
            let hit: RecentSong | undefined;
            // Hosts lose ids between turns; the title and artist the listener heard still name the song.
            if (saved.status === "not_found" && (title || artist)) {
              const hits = await deps.playlist().searchPlaysIndexed(slug, (title ?? artist)!);
              const found = bestRecentMatch(hits, { title, artist });
              if (found) saved = await deps.playlist().saveFind(listenerId, found);
              hit = hits.find((song) => song.playId === found);
            }
            if (saved.status !== "ok") return { content: text(spokenSaved(saved)), structuredContent: { ...saved } };
            // The save result's own artwork wins; older playlist deploys omit it, so a search hit's is the fallback, then a plain tile.
            const view = { view: "saved" as const, saved, artworkUrl: sizedArtwork(saved.artworkUrl ?? hit?.artworkUrl ?? null), previewUrl: saved.previewUrl ?? hit?.previewUrl ?? null };
            return { content: text(spokenSaved(saved)), structuredContent: { ...saved, ...card(view) } };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "list_finds",
        {
          title: "List my Finds",
          description: "List the listener's saved Radio Milwaukee Finds, newest first, numbered. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Use for 'what's in my Finds?'.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
          ...CARD,
        },
        async ({ limit }, context) =>
          timed("list_finds", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const finds = await deps.playlist().listFinds(listenerId, limit);
            return { content: text(spokenFinds(finds)), structuredContent: { ...(finds.length ? card({ view: "finds", finds }) : {}), finds } };
          }, playlistUnavailable),
      );

      server.registerTool(
        "delete_my_finds",
        {
          title: "Delete my Finds",
          description: "Permanently delete all of the listener's Finds and disconnect Apple Music. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Only call after the listener has clearly confirmed.",
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

      server.registerTool(
        "follow_artist",
        {
          title: "Follow an artist",
          description: "Follow an artist so the listener can later ask what's new from the artists they follow. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Pass the artist's name, or the playId of a song by them. Use for 'follow Thao' and 'follow this artist' (pass the playId of the song that just played).",
          inputSchema: z.object({ artist: z.string().max(100).optional(), playId: PLAY_ID.optional() }),
          annotations: { idempotentHint: true },
        },
        async ({ artist: rawArtist, playId }, context) =>
          timed("follow_artist", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const artist = rawArtist?.trim() || undefined;
            if (!artist && !playId) return { content: text(WHICH_ARTIST_TO_FOLLOW_SPEECH) };
            const followed = await deps.playlist().follow(listenerId, { artist, playId });
            return { content: text(spokenFollowed(followed, artist)), structuredContent: { ...followed } };
          }, playlistUnavailable),
      );

      server.registerTool(
        "unfollow_artist",
        {
          title: "Unfollow an artist",
          description: "Stop following an artist. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Use for 'stop following Thao' and 'unfollow Thao'.",
          inputSchema: z.object({ artist: z.string().max(100) }),
          annotations: { idempotentHint: true },
        },
        async ({ artist: rawArtist }, context) =>
          timed("unfollow_artist", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const artist = rawArtist.trim();
            if (!artist) return { content: text(WHICH_ARTIST_TO_UNFOLLOW_SPEECH) };
            const unfollowed = await deps.playlist().unfollow(listenerId, artist);
            return { content: text(spokenUnfollowed(unfollowed, artist)), structuredContent: { ...unfollowed } };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "whats_new_for_me",
        {
          title: "What's new from my artists",
          description: "What's new since the listener last asked, from the artists the listener follows: upcoming shows, new plays on Radio Milwaukee stations, new stories. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Use ONLY when the listener says me, my or I follow: 'what's new for me?', 'my artists', 'do any artists I follow have concerts?'. Not for \"88Nine artists\", artists a station plays, or who's touring: use station_artist_shows.",
          inputSchema: z.object({}),
          ...CARD,
        },
        async (_args, context) =>
          timed("whats_new_for_me", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return accountLinkingRequired();
            const digest = await deps.playlist().digest(listenerId);
            // Build the whole reply first: a reply that throws must not mark the digest seen.
            const reply = await digestReply(digest);
            defer(() => deps.playlist().markDigestSeen(listenerId, digest.now));
            return reply;
          }, playlistUnavailable),
      );

      registerAppResource(server, "Story card", CARD_URI, { description: "A Radio Milwaukee story, quote, list or map, in Alexa+ style." }, async () => ({
        contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.cardHtml(), _meta: { ui: { csp: CARD_CSP } } }],
      }));
    },
    { serverInfo: { name: "radio-commons", version: "0.2.0" } },
  );
}
