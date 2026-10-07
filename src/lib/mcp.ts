import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { PlaylistUnavailable, type Digest, type PlaylistClient, type RecallMatch, type RecentSong, type SavedFind, type Station } from "@/lib/playlist";
import { listenerIdFrom } from "@/lib/listenerAuth";
import { chatWidgetMeta, patchChatServer } from "@/lib/chatDoor";
import { cleanRequest, milwaukeeDay, openRequest, requestEmail, REQUESTS_PER_DAY, requestsFromEnv, sealRequest, type Requests } from "@/lib/requests";
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
  directAudioUrl, eventTime, EVENTS_UNAVAILABLE_SPEECH, NO_PLACES_FOR_EVENTS_SPEECH, NO_PLACES_SPEECH, spokenEvents, spokenPicks, NOT_ALLOWED_SPEECH, NOT_FOUND_SPEECH, EMPTY_DIGEST_SPEECH, EMPTY_DIGEST_NO_PICKS_SPEECH, LINK_ACCOUNT_SPEECH, LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH, PLAYLIST_UNAVAILABLE_SPEECH, spokenDigest, spokenFinds, spokenLatest, spokenMatches, spokenPassages,
  NEWSLETTER_UNAVAILABLE_SPEECH, NO_NEWSLETTER_SPEECH, spokenBriefing, spokenOnAir, spokenPlaces, spokenRecall, spokenRecent, spokenSearch, spokenStationShows, spokenDeleted, spokenFollowed, spokenSaved, spokenUnfollowed, noSongOnAirSpeech, whichOnAirSpeech, WHICH_ARTIST_TO_FOLLOW_SPEECH, WHICH_ARTIST_TO_UNFOLLOW_SPEECH, spokenStory, spokenTrackFacts, UNAVAILABLE_SPEECH,
} from "@/lib/speech";
import { localWindow } from "@/lib/stationTime";
import { noScheduleSpeech, programsFrom, SCHEDULE_UNAVAILABLE_SPEECH, spokenOnNow, spokenPrograms, withFreshLatest } from "@/lib/schedule";
import { getStation } from "@/lib/stations";
import { linkItems } from "@/lib/briefing";
import { NewsletterUnavailable, newsletterFromEnv, type NewsletterClient } from "@/lib/newsletter";
import { STREAM_HOST } from "@/lib/streams";
import QRCode from "qrcode";
import {
  CANCEL_FAILED_SPEECH, CANCELLED_SPEECH, CARD_LINK_TTL_MS, confirmCancelSpeech, GIVE_SPEECH, GIVE_UNAVAILABLE_SPEECH, giveFromEnv, levelSpeech, memberLine, MEMBERSHIP_CANCELLED_SPEECH,
  MEMBERSHIP_READ_FAILED_SPEECH, membershipFacts, membershipSpeech, NO_MEMBERSHIP_SPEECH, NOT_A_MEMBER_SPEECH, type Give,
} from "@/lib/give";
import { cancelMembership } from "@/lib/give/amazonPay";
import { sealListener } from "@/lib/give/token";
import { LEVELS, tierById, TIERS } from "@/lib/give/tiers";

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
    // Station logos the playlist uses when a song has no Apple artwork.
    "https://rm-playlist-v2-embed.pages.dev",
    // On air now: the stations' live streams.
    STREAM_HOST,
    // Finds and digest cards: event photos from Ticketmaster and AXS listings.
    "https://s1.ticketm.net", "https://images.discovery-prod.axs.com",
    // Station schedule: host and show photos from radiomilwaukee.org's image CDN.
    "https://npr.brightspotcdn.com",
  ],
  connectDomains: ["https://maps.geo.us-east-1.amazonaws.com", "https://unpkg.com"],
};
const INLINE_PLACES = 3;
const LIST_PAGE = 3;
// A speaker can't show the rest of a list, so lists are spoken three at a time and the listener asks for more.
const PAGE = z.number().int().min(1).max(4).optional();
const PAGING = " Speaks three at a time; when the reply offers the next ones and the listener says yes, more, the next ones or keep going, call this tool again with the same arguments and page 2 (then 3). Numbers keep counting across pages.";
const CARD = { _meta: { ui: { resourceUri: CARD_URI } } };
// "Thanks for being a member" is a nicety: past this, the digest goes out without it.
const MEMBER_LINE_BUDGET_MS = 300;
const LEVEL_SLUG = z.enum(LEVELS.map((level) => level.slug) as [string, ...string[]]);

interface Deps {
  backstory: () => BackstoryClient;
  fieldGuide: () => FieldGuideClient;
  playlist: () => PlaylistClient;
  /** The weekly newsletter (station_briefing); defaults to the live Mailchimp reader. */
  newsletter?: () => NewsletterClient;
  now?: () => Date;
  /** Runs work after the reply is sent (Next's `after`); the default just starts it. */
  defer?: (task: () => Promise<unknown>) => void;
  cardHtml: () => string;
  /** Sandbox giving (support_radio_milwaukee, cancel_membership); null when Amazon Pay isn't configured. Defaults to the env. */
  give?: () => Give | null;
  /** Which door: "voice" is Alexa+ at /api/mcp (default, unchanged); "chat" is ChatGPT at /api/chatgpt/mcp. */
  surface?: "voice" | "chat";
  /** ChatGPT door: song requests and 5 O'Clock Shadow by email; null when unavailable. Defaults to the env. */
  requests?: () => Requests | null;
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
const accountLinkingRequired = (speech = LINK_ACCOUNT_SPEECH): ToolResult => ({ content: text(speech), isError: true, structuredContent: ACCOUNT_LINKING_REQUIRED });
const REQUESTS_UNAVAILABLE = "Requests to Radio Milwaukee aren't available right now.";
const REQUEST_PREVIEW = "Here's your request. Tap Send on the card to send it to Radio Milwaukee; nothing is sent until you do.";
const REQUEST_QUESTIONS = {
  missing_song: "Which song would you like to request?",
  missing_artist: "Who's the artist?",
  missing_cover_artist: "Whose cover should 88Nine play for 5 O'Clock Shadow?",
} as const;
export const CHAT_RESOURCE_PATH = "/api/chatgpt/mcp";
export const CHAT_SIGN_IN_TEXT = "Sign in to Radio Milwaukee to save songs, follow artists and see what's new for you.";
// ChatGPT shows its own sign-in screen when a tool error carries this challenge with both error and error_description.
const chatSignInRequired = (): ToolResult => ({
  content: text(CHAT_SIGN_IN_TEXT),
  isError: true,
  structuredContent: ACCOUNT_LINKING_REQUIRED,
  _meta: {
    "mcp/www_authenticate": [
      `Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource${CHAT_RESOURCE_PATH}", error="insufficient_scope", error_description="${CHAT_SIGN_IN_TEXT}"`,
    ],
  },
});

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
    if (!(error instanceof BackstoryUnavailable) && !(error instanceof FieldGuideUnavailable) && !(error instanceof PlaylistUnavailable) && !(error instanceof NewsletterUnavailable)) throw error;
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
  const give = deps.give ?? giveFromEnv;
  const chat = deps.surface === "chat";
  const signInRequired = (speech?: string): ToolResult => (chat ? chatSignInRequired() : accountLinkingRequired(speech));
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
      // chat: the card HTML moves to _meta, so the model still needs the items to answer "the 4th one".
      return { content: text(spokenDigest(digest.items)), structuredContent: card({ view: "digest", artists: digest.artists, items: digest.items }, chat ? { artists: digest.artists, items: digest.items } : {}) };
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
  // Extras that never fail or slow their tool beyond the playlist timeout: a failure is logged and reads as "unknown".
  const orNull = async <T>(event: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch {
      console.error(JSON.stringify({ event }));
      return null;
    }
  };
  const scheduleNow = () => orNull("schedule_read_failed", () => deps.playlist().stationSchedule({ station: "88nine", at: now().getTime() }));
  // What each station is playing now, in MUSIC_STATIONS order: on_air_now's tiles, and save_find's cheap first look.
  const onAirTiles = async (stations: readonly Station[]) => (await onAirRows(stations)).map(({ station: where, song }) => ({ station: where, song }));
  // `latest` is the station's newest play even when it is too old to be "on air"; screen memory needs it for that row.
  const onAirRows = (stations: readonly Station[]) => {
    const at = now().getTime();
    return Promise.all(stations.map(async (where) => {
      const latest = await latestPlay(where);
      return { station: where, song: onAirSong(latest, at), latest };
    }));
  };
  /**
   * The on-air screen keeps one slot per card row. A row with no song holds the station's last (old) play, so the numbers
   * after it don't shift; this spots that slot. ponytail: an on-air screen is the only list of exactly four whose slot N is
   * station N's latest, stale play; a 4-song list ending on an idle 414 Music's last play would read as "no song" too.
   */
  const idleOnAirRow = async (listenerId: string, number: number, playId: string): Promise<Station | null> => {
    const where = MUSIC_STATIONS[number - 1];
    if (!where) return null;
    const latest = await latestPlay(where);
    if (latest?.playId !== playId || onAirSong(latest, now().getTime())) return null;
    // Only now (rare) look for a fifth slot: a longer list is a song list, where an old play is a real choice.
    return (await screenPlayOrNull(listenerId, MUSIC_STATIONS.length + 1, true)) === null ? where : null;
  };
  // One guess gets the full song card; several become a numbered list so "save number 2" matches the screen.
  const recallCard = (matches: RecallMatch[], slug: Station) =>
    matches.length === 0 ? {}
      : matches.length === 1 ? card({ view: "song", song: songCardFromMatch(matches[0], slug) })
        : card({ view: "songs", songs: matches.map((match) => songCardFromMatch(match, slug)) });
  // The give card: every tier's /give link (sealed listener token when linked) and a QR of the short page for screens without a browser.
  const giveCard = async (setup: Give, listenerId: string | undefined, selected?: string) => {
    const token = listenerId ? sealListener(listenerId, setup.tokenSecret, CARD_LINK_TTL_MS, now().getTime()) : null;
    const giveUrl = (tier?: string) => {
      const url = new URL("/give", SITE);
      if (tier) url.searchParams.set("tier", tier);
      if (token) url.searchParams.set("t", token);
      return url.toString();
    };
    const links = Object.fromEntries(TIERS.map((tier) => [tier.id, giveUrl(tier.id)]));
    // A chosen level's QR opens that level's page, so a phone continues where the listener left off.
    const qrSvg = await QRCode.toString(giveUrl(selected), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return card({ view: "give", links, qrSvg, shortUrl: `${new URL(SITE).host}/give`, selected }, { links, ...(selected ? { selected } : {}) });
  };
  // Null on any failure or after the budget: a membership lookup must never slow or break the digest.
  const activeMembership = async (listenerId: string) => {
    const store = give()?.memberships;
    if (!store) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), MEMBER_LINE_BUDGET_MS); });
    try {
      const membership = await Promise.race([store.get(listenerId), late]);
      return membership?.status === "active" ? membership : null;
    } catch {
      console.error(JSON.stringify({ event: "membership_read_failed" }));
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  return createMcpHandler(
    (server) => {
      if (chat) patchChatServer(server);
      registerAppTool(
        server,
        "find_station_story",
        {
          title: "Find a Radio Milwaukee story",
          description:
            "Find a Radio Milwaukee podcast story a listener remembers, by topic, person, place, neighborhood or something said in it: Milwaukee people, places, nonprofits, food and music. Returns up to three published stories; when none match, the reply names the shows covered. Use only these results; never invent a story.",
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
          description: "List the newest published Radio Milwaukee stories, optionally for one show, numbered so the listener can pick one. Use for 'the latest episode' or 'any new episodes of This Bites'; for what's new at the station this week, use station_briefing.",
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
            "Find upcoming events from Radio Milwaukee's event guide (the MKE Field Guide): by words (\"live music\"), time (tonight, today, tomorrow, this weekend, this week), free only, or near a place from a story the listener is looking at (nearStoryId, optionally nearPlace by name). Use only these results; never invent an event. For general events not tied to the station's artists; for concerts by artists a station plays (\"88Nine artists with shows\"), use station_artist_shows." + PAGING,
          inputSchema: z.object({
            query: z.string().min(1).max(120).optional(),
            when: z.enum(WHEN).optional(),
            freeOnly: z.boolean().optional(),
            nearStoryId: z.string().min(1).max(64).optional(),
            nearPlace: z.string().min(1).max(80).optional(),
            page: PAGE,
          }),
          ...CARD,
        },
        async ({ query, when, freeOnly, nearStoryId, nearPlace, page = 1 }) =>
          timed("find_events", async () => {
            const now = new Date();
            const base = { ...(query ? { q: query } : {}), ...(when ? { when } : {}), ...(freeOnly ? { free: true } : {}) };
            const items = (events: PublicEvent[]): EventItem[] => events.map((event) => ({ event, when: eventTime(event.startAt, now) }));
            if (!nearStoryId) {
              // One past this page, so the reply knows whether to offer more; the card shows every event so far.
              const limit = Math.max(5, page * LIST_PAGE + 1);
              const events = (await deps.fieldGuide().events({ ...base, limit })).slice(0, limit);
              return {
                content: text(spokenEvents(events, { now, when, page })),
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
          description: "Upcoming concerts by artists Radio Milwaukee's stations have been playing, Milwaukee-area shows first. Use for \"88Nine artists with concerts coming up\", \"artists you play\", \"artists on HYFIN\", \"who's touring\", \"which artists from the station have concerts\". Pass station when the listener names one; omit it for all of Radio Milwaukee. No linked account needed. Not for the artists the listener follows (whats_new_for_me) or general events tonight or this weekend (find_events). Use only these results; never invent a show." + PAGING,
          inputSchema: z.object({ station: STATION_SLUG.optional(), page: PAGE }),
          ...CARD,
        },
        async ({ station: slug, page }) =>
          timed("station_artist_shows", async () => {
            const { shows } = await deps.playlist().stationArtistShows(slug);
            return {
              content: text(spokenStationShows(shows, slug, page)),
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
        "station_briefing",
        {
          title: "This week at Radio Milwaukee",
          description: "A short briefing from Radio Milwaukee's newest weekly newsletter: up to four items in the station's own words, each opening its story, Concert Picks or page. Use for 'what's new at Radio Milwaukee this week?'.",
          inputSchema: z.object({}),
          ...CARD,
        },
        async () =>
          timed("station_briefing", async () => {
            const issue = await (deps.newsletter ?? newsletterFromEnv)().latest();
            if (issue && issue.items.length === 0) console.error(JSON.stringify({ tool: "station_briefing", weekly: issue.title, items: 0 })); // layout changed?
            if (!issue || issue.items.length === 0) return { content: text(NO_NEWSLETTER_SPEECH) };
            const items = await linkItems(issue.items, deps.backstory());
            return {
              content: text(spokenBriefing(issue.date, items)),
              structuredContent: card({ view: "briefing", date: issue.date, items }, { newsletter: issue.title, items }),
            };
          }, () => ({ content: text(NEWSLETTER_UNAVAILABLE_SPEECH), isError: true })),
      );

      registerAppTool(
        server,
        "what_can_you_do",
        {
          title: "What Radio Milwaukee can do",
          description: "A short summary of what Radio Milwaukee can do here, with an example phrase for each. Use for \"what can you do\", \"help\", \"what can Radio Milwaukee do\", \"how do I use this\". Speak the summary as given. If the listener then says \"tell me more\", describe the capabilities from this result two at a time, each with its example. No linked account needed.",
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
            "The most recent songs on a Radio Milwaukee station, newest first, numbered. Use for 'what did you just play?', 'what just played?', 'the last 5 songs on 88Nine'. For what's on or playing right now, or to listen, use on_air_now. save_find takes the `number` field for 'save number 2'; get_track_story takes the playId. For a song at a past time ('around 2 pm'), use find_song_played." + PAGING,
          inputSchema: z.object({
            station: z.enum(["hyfin", "88nine", "414music", "rhythmlab"]),
            count: z.number().int().min(1).max(MAX_RECENT_SONGS).optional(),
            page: PAGE,
          }),
          ...CARD,
        },
        async ({ station: slug, count, page }, context) =>
          timed("recent_songs", async () => {
            const songs = await deps.playlist().recentSongs(slug, count ?? DEFAULT_RECENT_SONGS);
            rememberScreen(context, songs.map((song) => song.playId));
            const numbered = songs.map(({ playId, artist, title, playedAt }, i) => ({ number: i + 1, playId, artist, title, playedAt }));
            return {
              content: [...text(spokenRecent(STATION_NAMES[slug], songs, page)), ...text(JSON.stringify({ songs: numbered }))],
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
          description: "What's on Radio Milwaukee's stations right now, with a Listen live button (on devices with a screen) that plays each station's live stream. Use for \"what's on now\", \"what's on Radio Milwaukee right now\", \"what's playing right now on HYFIN\", \"listen to 88Nine\", \"play HYFIN\", \"put on Rhythm Lab\". Pass station when the listener names one; omit it for all four stations. No linked account needed. Not for 'the last 5 songs' or 'what did you just play' (recent_songs), or who's hosting or when a show is on (station_schedule). Speak the answer as given.",
          inputSchema: z.object({ station: STATION_SLUG.optional() }),
          ...CARD,
        },
        async ({ station: slug }, context) =>
          timed("on_air_now", async () => {
            const [rows, schedule] = await Promise.all([onAirRows(slug ? [slug] : MUSIC_STATIONS), !slug || slug === "88nine" ? scheduleNow() : null]);
            // Only 88Nine has a schedule: its row also names who's hosting.
            const show = schedule?.onNow ? { name: schedule.onNow.name, hosts: schedule.onNow.hosts } : null;
            const tiles = rows.map(({ station: where, song }) => ({ station: where, song, ...(where === "88nine" && show ? { show } : {}) }));
            // One slot per card row, so "number 3" is the third row. A station with no play at all ends the list: later
            // numbers then find nothing and ask, instead of shifting onto the wrong row. One station alone isn't numbered.
            const gap = rows.findIndex(({ latest }) => !latest);
            const slots = (gap === -1 ? rows : rows.slice(0, gap)).map(({ latest }) => latest!.playId);
            if (!slug) rememberScreen(context, slots);
            const stations = tiles.map(({ station: where, song, ...rest }) => ({ station: where, ...rest, song: song && { playId: song.playId, title: song.title, artist: song.artist, playedAt: song.playedAt } }));
            return { content: text(spokenOnAir(tiles)), structuredContent: card({ view: "on-air", tiles }, { stations }) };
          }, playlistUnavailable),
      );

      registerAppTool(
        server,
        "station_schedule",
        {
          title: "Who's on 88Nine, and when",
          description: "88Nine's on-air schedule: who's on now (host and show) and who's next, when a show or host is on, and whether a show already aired this week. Use for \"who's on 88Nine\", \"who's on right now\", \"who's the DJ\", \"who's hosting\", \"when is Rhythm Lab on\", \"when is Erin Wolf on\", \"did I miss Audio Taste Test\", \"what's on tonight on 88Nine\". Pass query with the show or host the listener names; omit it for who's on now. Rhythm Lab Radio is an 88Nine show: for it pass query \"rhythm lab\". Only 88Nine has a schedule. Not for what song is playing (on_air_now). No linked account needed. Speak the answer as given." + PAGING,
          inputSchema: z.object({ station: STATION_SLUG.optional(), query: z.string().trim().min(2).max(100).optional(), page: PAGE }),
          ...CARD,
        },
        async ({ station: slug, query, page }) =>
          timed("station_schedule", async () => {
            // A named show or host on the Rhythm Lab stream is looked up on 88Nine, where Rhythm Lab Radio airs.
            if (slug && slug !== "88nine" && !(slug === "rhythmlab" && query)) return { content: text(noScheduleSpeech(slug)) };
            const at = now();
            const [rawSchedule, rawProfile] = await Promise.all([
              deps.playlist().stationSchedule({ station: "88nine", ...(query ? { query } : {}), at: at.getTime() }),
              // ponytail: alexa:hostProfile ships in a later playlist deploy; until then this is null and the schedule answers alone.
              query ? orNull("host_profile_failed", () => deps.playlist().hostProfile(query)) : null,
            ]);
            const { schedule, profile } = withFreshLatest(rawSchedule, rawProfile ?? null, at);
            if (!query) {
              const { onNow, next } = schedule;
              return { content: text(spokenOnNow(schedule)), ...(onNow || next ? { structuredContent: card({ view: "schedule", onNow, next, matches: [] }, { onNow, next }) } : {}) };
            }
            const matches = programsFrom(schedule, profile);
            return {
              content: text(spokenPrograms(query, matches, at, page)),
              ...(matches.length ? { structuredContent: card({ view: "schedule", onNow: null, next: null, matches }, { matches }) } : {}),
            };
          }, () => ({ content: text(SCHEDULE_UNAVAILABLE_SPEECH), isError: true })),
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
          description: "Save a song the listener heard on Radio Milwaukee to their 88Nine Finds (and Apple Music if connected). Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Pass number (1-10) only when the listener says a number (\"save number 3\"). Otherwise pass the playId from recent_songs, find_song_played or search_playlist if you have it, and always also pass the song's title and artist (and station if known) so the right play is found even without an id. Use for 'save it', 'save number 3', 'save the song by Thao'. After on_air_now, pass station when the listener names one (\"save the HYFIN song\"); if several stations were named and the listener doesn't say which, call with no song details and the tool asks which station. Never guess a station.",
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
            if (!listenerId) return signInRequired();
            // "Save that song" with nothing named: ask which station's song rather than guess.
            if (number === undefined && !playId && !title && !artist && !slug) {
              const which = whichOnAirSpeech(await onAirTiles(MUSIC_STATIONS));
              return { content: text(which ?? spokenSaved({ status: "not_found" })), structuredContent: { status: which ? "which_station" : "not_found" } };
            }
            // A named song always beats a number: the remembered list can be 30 minutes stale.
            const onScreen = number === undefined || title ? null : await screenPlayOrNull(listenerId, number, Boolean(playId || title || slug));
            const idle = onScreen && number !== undefined ? await idleOnAirRow(listenerId, number, onScreen) : null;
            if (idle) return { content: text(noSongOnAirSpeech(STATION_NAMES[idle])), structuredContent: { status: "no_song", station: idle } };
            const firstId = onScreen ?? playId;
            let saved: SavedFind = firstId ? await deps.playlist().saveFind(listenerId, firstId) : { status: "not_found" };
            let hit: RecentSong | undefined;
            // Hosts lose ids between turns; the station or the title and artist the listener heard still name the song.
            // What's on air now is one cheap read per station, so it goes before the slow search of every play.
            if (saved.status === "not_found" && (title || artist || slug)) {
              const named = title || artist ? { title, artist } : null;
              let songs: RecentSong[] = (await onAirTiles(slug ? [slug] : MUSIC_STATIONS)).flatMap(({ song }) => (song ? [song] : []));
              let found = named ? bestRecentMatch(songs, named) : songs[0]?.playId ?? null;
              if (!found && named) {
                songs = await deps.playlist().searchPlaysIndexed(slug, (title ?? artist)!);
                found = bestRecentMatch(songs, named);
              }
              if (found) saved = await deps.playlist().saveFind(listenerId, found);
              hit = songs.find((song) => song.playId === found);
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
          description: "List the listener's saved Radio Milwaukee Finds, newest first, numbered. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Use for 'what's in my Finds?'." + PAGING,
          inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional(), page: PAGE }),
          ...CARD,
        },
        async ({ limit, page }, context) =>
          timed("list_finds", async () => {
            const listenerId = listenerIdFrom(context.http ?? {});
            if (!listenerId) return signInRequired();
            const finds = await deps.playlist().listFinds(listenerId, limit);
            return { content: text(spokenFinds(finds, page)), structuredContent: { ...(finds.length ? card({ view: "finds", finds }) : {}), finds } };
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
            if (!listenerId) return signInRequired();
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
            if (!listenerId) return signInRequired();
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
            if (!listenerId) return signInRequired();
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
            if (!listenerId) return signInRequired();
            const [digest, membership] = await Promise.all([deps.playlist().digest(listenerId), activeMembership(listenerId)]);
            // Build the whole reply first: a reply that throws must not mark the digest seen.
            const reply = await digestReply(digest);
            defer(() => deps.playlist().markDigestSeen(listenerId, digest.now));
            if (!membership) return reply;
            const [first, ...rest] = reply.content;
            return { ...reply, content: [{ ...first, text: `${first.text} ${memberLine(membership)}` }, ...rest] };
          }, playlistUnavailable),
      );

      // OpenAI's plugin rules forbid showing membership levels, starting subscriptions or linking to checkout.
      if (!chat) {
      registerAppTool(
        server,
        "support_radio_milwaukee",
        {
          title: "Support Radio Milwaukee",
          description: "Become a Radio Milwaukee member (monthly) or make a one-time gift, with Amazon Pay. This is a sandbox demo: no real money moves, and the reply says so. Shows a card with the station's membership levels; each opens a secure Amazon Pay page. Use for \"I want to support Radio Milwaukee\", \"donate\", \"become a member\", \"give to the station\". For one level (\"upgrade me to Front Row\", \"I want the VIP membership\", \"what do VIP members get\"), pass level (ga, main-floor, front-row or vip) and kind \"once\" only for a one-time gift: the card opens on that level. Not for checking the listener's own membership (my_membership). No linked account needed. Speak the reply as given.",
          inputSchema: z.object({ level: LEVEL_SLUG.optional(), kind: z.enum(["monthly", "once"]).optional() }),
          ...CARD,
        },
        async ({ level, kind }, context) => {
          const setup = give();
          if (!setup) return { content: text(GIVE_UNAVAILABLE_SPEECH) };
          const tier = level ? tierById(`${level}-${kind ?? "monthly"}`) : undefined;
          return { content: text(tier ? levelSpeech(tier) : GIVE_SPEECH), structuredContent: await giveCard(setup, listenerIdFrom(context.http ?? {}), tier?.id) };
        },
      );

      registerAppTool(
        server,
        "my_membership",
        {
          title: "My Radio Milwaukee membership",
          description: "The listener's own Radio Milwaukee membership (an Amazon Pay sandbox demo), read only: level, amount, member since, the month of the next charge, their gift and what the level includes. Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. Use for \"am I a member\", \"what's my membership\", \"when does my membership renew\", \"what do I get as a member\". Not for joining, giving or upgrading (support_radio_milwaukee) or cancelling (cancel_membership). Speak the reply as given.",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true },
          ...CARD,
        },
        async (_args, context) => {
          const listenerId = listenerIdFrom(context.http ?? {});
          if (!listenerId) return signInRequired(LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH);
          const setup = give();
          if (!setup?.memberships) return { content: text(GIVE_UNAVAILABLE_SPEECH) };
          try {
            const membership = await setup.memberships.get(listenerId);
            if (membership?.status !== "active") return { content: text(membership ? MEMBERSHIP_CANCELLED_SPEECH : NOT_A_MEMBER_SPEECH), structuredContent: { member: false } };
            return { content: text(membershipSpeech(membership)), structuredContent: card({ view: "membership", ...membershipFacts(membership) }, { member: true }) };
          } catch {
            console.error(JSON.stringify({ event: "membership_read_failed" }));
            return { content: text(MEMBERSHIP_READ_FAILED_SPEECH), isError: true };
          }
        },
      );

      server.registerTool(
        "cancel_membership",
        {
          title: "Cancel my Radio Milwaukee membership",
          description: "Cancel the listener's monthly Radio Milwaukee membership (an Amazon Pay sandbox demo). Always call this tool when the listener asks, even if they may not have linked their account — the tool starts account linking itself. First call it without confirmed: it returns the question to ask. Only after the listener clearly says yes, call it again with confirmed true. Use for \"cancel my membership\", \"stop my monthly donation\".",
          inputSchema: z.object({ confirmed: z.boolean().optional() }),
          annotations: { destructiveHint: true, idempotentHint: true },
        },
        async ({ confirmed }, context) => {
          const listenerId = listenerIdFrom(context.http ?? {});
          if (!listenerId) return signInRequired(LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH);
          const setup = give();
          if (!setup?.memberships) return { content: text(GIVE_UNAVAILABLE_SPEECH) };
          try {
            const membership = await setup.memberships.get(listenerId);
            if (membership?.status !== "active") return { content: text(NO_MEMBERSHIP_SPEECH), structuredContent: { member: false } };
            if (confirmed !== true) return { content: text(confirmCancelSpeech(membership)), structuredContent: { member: true, needsConfirmation: true } };
            await cancelMembership(await setup.pay(), membership.chargePermissionId);
            // Amazon has closed it, which is what matters; a failed note here only costs the "member since" line.
            await setup.memberships.set(listenerId, { ...membership, status: "cancelled" }).catch(() => console.error(JSON.stringify({ event: "membership_write_failed" })));
            return { content: text(CANCELLED_SPEECH), structuredContent: { member: false, cancelled: true } };
          } catch {
            console.error(JSON.stringify({ event: "cancel_membership_failed" }));
            return { content: text(CANCEL_FAILED_SPEECH), isError: true };
          }
        },
      );
      }

      // ChatGPT door only (slice 5): a request or 5 O'Clock Shadow suggestion, sent only by the card's Send button.
      if (chat) {
      registerAppTool(
        server,
        "send_station_request",
        {
          title: "Send Radio Milwaukee a request",
          description: "Send Radio Milwaukee's DJs a song request, or a suggestion for 5 O'Clock Shadow, 88Nine's daily 5 pm cover song. Call with the details to show a preview card; the listener sends it by tapping Send on the card, which is the only way it is sent, so never say it was sent unless a card says so. For 5 O'Clock Shadow pass song (the song's title), artist (the original artist) and coverArtist (who performs the cover). Before the preview, ask the listener what name the DJ should use (for example \"Tarik from Bay View\") and pass it as fromName; if they'd rather not say, leave it out. Sign-in required; up to 3 requests a day.",
          inputSchema: z.object({
            kind: z.enum(["song_request", "five_oclock_shadow"]).optional(),
            song: z.string().max(200).optional(),
            artist: z.string().max(200).optional(),
            coverArtist: z.string().max(200).optional(),
            note: z.string().max(400).optional(),
            fromName: z.string().max(100).optional(),
            token: z.string().max(2000).optional(),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
          ...CARD,
        },
        async ({ kind, song, artist, coverArtist, note, fromName, token }, context) => {
          const listenerId = listenerIdFrom(context.http ?? {});
          if (!listenerId) return signInRequired();
          const setup = (deps.requests ?? requestsFromEnv)();
          if (!setup) return { content: text(REQUESTS_UNAVAILABLE), isError: true };
          const at = now();
          const day = milwaukeeDay(at.getTime());
          const status = (sent: boolean, title: string, detail: string): ToolResult =>
            ({ content: text(`${title} ${detail}`), structuredContent: card({ view: "request-status", ok: sent, title, detail }, { sent }) });
          try {
            if (await setup.counter.countToday(listenerId, day) >= REQUESTS_PER_DAY) return status(false, "That's today's three requests.", "You can send more tomorrow.");
            if (token) {
              const request = openRequest(token, listenerId, setup.secret, at.getTime());
              if (!request) return status(false, "That preview expired.", "Ask again for a new one, then tap Send.");
              const email = requestEmail(request, at);
              await setup.send(email);
              // Sent already: a failed count must not turn into "not sent".
              await setup.counter.record(listenerId, day).catch(() => console.error(JSON.stringify({ event: "station_request_count_failed" })));
              console.log(JSON.stringify({ event: "station_request_sent", kind: request.kind }));
              return status(true, "Sent to Radio Milwaukee ✓", email.subject);
            }
            const request = cleanRequest({ kind: kind ?? "song_request", song, artist, coverArtist, note, fromName });
            if ("error" in request) return { content: text(REQUEST_QUESTIONS[request.error]), structuredContent: { status: request.error } };
            const sealed = sealRequest(listenerId, request, setup.secret, at.getTime());
            return { content: text(REQUEST_PREVIEW), structuredContent: card({ view: "request", request, token: sealed }, { request }) };
          } catch {
            console.error(JSON.stringify({ event: "station_request_failed" }));
            return status(false, "That didn't send.", "Radio Milwaukee's request line isn't answering. Please try again in a minute.");
          }
        },
      );
      }

      registerAppResource(server, "Story card", CARD_URI, { description: chat ? "A Radio Milwaukee card: a story, quote, song list, events, a map or what's on the air." : "A Radio Milwaukee story, quote, list or map, in Alexa+ style." }, async () => ({
        contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.cardHtml(), _meta: { ui: { csp: CARD_CSP }, ...(chat ? chatWidgetMeta(CARD_CSP) : {}) } }],
      }));
    },
    { serverInfo: { name: "radio-commons", version: "0.2.0" } },
  );
}
