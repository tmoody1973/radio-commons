import { createHash } from "node:crypto";
import type { createMcpHandler } from "mcp-handler";
import { AUTH_TOOLS, OAUTH_SCOPES } from "@/lib/listenerAuth";

// Everything the ChatGPT door (/api/chatgpt/mcp) does differently from the Alexa+ door; see decision 010.
// The Alexa+ door never calls anything in this file.

type McpServerLike = Parameters<Parameters<typeof createMcpHandler>[0]>[0];
type ToolResultLike = { structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown>; [key: string]: unknown };

const SIGNED_IN_TOOLS = new Set<string>([...AUTH_TOOLS, "send_station_request", "send_feedback", "create_playlist", "add_to_playlist", "show_playlists", "remove_from_playlist", "delete_playlist"]);
const SIGNED_IN = [{ type: "oauth2", scopes: [...OAUTH_SCOPES] }];
const EITHER = [{ type: "noauth" }, ...SIGNED_IN];

// Voice-only instructions ChatGPT doesn't need (it shows the whole list and writes its own reply). Trust rules stay.
const VOICE_ONLY: [RegExp | string, string][] = [
  [/ Speaks three at a time;.*?Numbers keep counting across pages\./, ""],
  [" Speak the answer as given.", ""],
  [" Speak the reply as given.", ""],
  [" Speak the summary as given.", ""],
  [" (on devices with a screen)", ""],
  ["Speak only from this record", "Answer only from this record"],
];
export const chatDescription = (description: string) => VOICE_ONLY.reduce((text, [from, to]) => text.replace(from, to), description);

// Shown in ChatGPT while each tool runs (openai/toolInvocation/invoking, 64 characters at most).
const STATUS: Record<string, string> = {
  find_station_story: "Searching Radio Milwaukee stories…",
  latest_station_stories: "Getting the newest stories…",
  get_station_story: "Opening the story…",
  ask_station_story: "Checking what was said in the episode…",
  find_events: "Finding events in Milwaukee…",
  station_artist_shows: "Finding shows by artists we play…",
  station_picks: "Getting this week's picks…",
  station_briefing: "Reading this week's newsletter…",
  what_can_you_do: "Getting what Radio Milwaukee can do…",
  find_song_played: "Searching the playlist…",
  search_playlist: "Searching the playlist…",
  recent_songs: "Getting the latest songs…",
  on_air_now: "Checking what's on the air…",
  station_schedule: "Checking 88Nine's schedule…",
  get_track_story: "Looking up the song…",
  save_find: "Saving to your Finds…",
  list_finds: "Opening your Finds…",
  delete_my_finds: "Deleting your Finds…",
  follow_artist: "Following the artist…",
  unfollow_artist: "Unfollowing the artist…",
  whats_new_for_me: "Checking what's new for you…",
  send_station_request: "Preparing your request…",
  station_home: "Opening Radio Milwaukee…",
  create_playlist: "Making your playlist…",
  add_to_playlist: "Adding to your playlist…",
  show_playlists: "Opening your playlists…",
  remove_from_playlist: "Removing the song…",
  delete_playlist: "Deleting the playlist…",
  read_article: "Opening the article…",
  send_feedback: "Preparing your feedback…",
};

// The model reads structuredContent verbatim; these are only for drawing the card, so they go in _meta (hidden
// from the model, forwarded to the card). About half of each card result is HTML.
const RENDER_ONLY = ["cardHtml", "fullHtml", "mapPlaces"];
export function chatResult<T extends ToolResultLike>(input: T): T {
  const result = inChatWords(withPlacesBehindTheMap(input));
  const content = result.structuredContent;
  if (!content || !RENDER_ONLY.some((key) => key in content)) return result;
  const kept = Object.fromEntries(Object.entries(content).filter(([key]) => !RENDER_ONLY.includes(key)));
  const moved = Object.fromEntries(Object.entries(content).filter(([key]) => RENDER_ONLY.includes(key)));
  return { ...result, structuredContent: kept, _meta: { ...result._meta, ...moved } };
}

// Tools the card calls itself (Save, Places, the live refresh): OpenAI requires openai/widgetAccessible on each.
const CARD_CALLABLE = new Set(["save_find", "get_station_story", "on_air_now", "send_station_request", "show_playlists", "remove_from_playlist"]);
// Chat-only routing hints. ChatGPT answered "what restaurants were discussed" from memory instead of showing the map.
const CHAT_EXTRA: Record<string, string> = {
  find_song_played: " Here, without cues it lists every song played in the window (up to 12, newest first) on a card the listener can save from.",
  get_station_story: ' When the listener asks about the places, restaurants, venues or stops in a story (what they were or where they are), call this with view "places"; the card maps them. Don\'t list them from memory.',
};
// On card tools, per-tool guidance against re-listing what the card shows (ChatGPT repeated events as a table).
const CARD_NOTE = " The card shows these results; reply in one or two sentences and don't list them again.";
const hasCard = (config: { _meta?: Record<string, unknown> }) => Boolean((config._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri);

// Replies are written to be spoken. In a chat the card shows the whole list and its buttons, so the speaker-only
// phrases go; the facts don't change. Alexa's replies never pass through here.
const CHAT_WORDS: [RegExp, string][] = [
  [/ ?Say 'Alexa, play [^']+' to keep listening\./g, ""],
  [/ Want the next (one|two|three)\?/g, ""],
  [/ ?Want to add one to your calendar\?/g, ""],
  [/After I name a song, say 'save it'\./g, "Save songs from any song card, or ask me to save one."],
  [/Say tell me more for examples\./g, 'Ask "tell me more" for examples.'],
];
function inChatWords<T extends ToolResultLike>(result: T): T {
  if (!Array.isArray(result.content)) return result;
  const content = (result.content as { type: string; text?: string }[]).map((part) =>
    part.type === "text" && part.text ? { ...part, text: CHAT_WORDS.reduce((text, [from, to]) => text.replace(from, to), part.text).trim() } : part);
  return { ...result, content };
}

type StoryLike = { places?: unknown[]; [key: string]: unknown };
/**
 * ChatGPT answered "what restaurants were discussed?" from the story record it already had, so the map never showed.
 * Outside the map view, a story keeps its summary but carries a place count and a pointer instead of the names.
 */
function withPlacesBehindTheMap<T extends ToolResultLike>(result: T): T {
  const content = result.structuredContent;
  const story = content?.story as StoryLike | undefined;
  if (!content || content.view === "places" || !Array.isArray(story?.places) || story.places.length < 2) return result;
  const { places, ...rest } = story;
  const pointer = `This story mentions ${places.length} places. To list or map them, call get_station_story with this storyId and view "places".`;
  const text = Array.isArray(result.content) ? (result.content as unknown[]) : [];
  return { ...result, structuredContent: { ...content, story: { ...rest, placeCount: places.length } }, content: [...text, { type: "text", text: pointer }] };
}

/**
 * Every tool registered on the chat door goes through here: chat descriptions, sign-in schemes, a status line, and
 * results with the card HTML moved to _meta. ponytail: patches this request's server instance (mcp-handler builds one
 * per request), so the 24 registrations in mcp.ts stay shared with Alexa+ untouched.
 */
/**
 * The ChatGPT card's address, versioned by its content: ChatGPT keeps its own copy of a card page by address and
 * didn't refetch it on Refresh tools (2026-10-08), so a changed card needs a new address. Alexa keeps CARD_URI.
 */
export const chatCardUri = (html: string) => `ui://radio-commons/chat-card-${createHash("sha256").update(html).digest("hex").slice(0, 10)}.html`;

export function patchChatServer(server: McpServerLike, cardUri?: string) {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: { description?: string; _meta?: Record<string, unknown> }, callback: (...args: unknown[]) => Promise<ToolResultLike>) =>
    register(
      name,
      {
        ...config,
        ...(config.description ? { description: chatDescription(config.description) + (CHAT_EXTRA[name] ?? "") + (hasCard(config) ? CARD_NOTE : "") } : {}),
        _meta: {
          ...config._meta,
          // Every card tool points at the versioned card, under both keys the Apps library writes.
          ...(cardUri && hasCard(config) ? { ui: { ...(config._meta?.ui as object), resourceUri: cardUri }, "ui/resourceUri": cardUri } : {}),
          securitySchemes: SIGNED_IN_TOOLS.has(name) ? SIGNED_IN : EITHER,
          ...(STATUS[name] ? { "openai/toolInvocation/invoking": STATUS[name] } : {}),
          // OpenAI: must be true for any tool the card calls itself (Save from the card).
          ...(CARD_CALLABLE.has(name) ? { "openai/widgetAccessible": true } : {}),
          // The live stream floats in picture-in-picture; ChatGPT wants the modes declared before the card loads.
          ...(hasCard(config) ? { "openai/ui": { ...(config._meta?.["openai/ui"] as Record<string, unknown> | undefined), availableDisplayModes: ["inline", "fullscreen", "pip"] } } : {}),
        },
      } as never,
      (async (...args: unknown[]) => chatResult(await callback(...args))) as never,
    )) as typeof server.registerTool;
}

/** Extra card-resource metadata for ChatGPT: its own CSP key (it may ignore ui.csp) and a note against re-narrating. */
// Episode audio on NPR's own servers (Radio Milwaukee Artist Interviews); the Alexa list is pinned until after Oct 23.
const CHAT_RESOURCE_DOMAINS = ["https://cpa.ds.npr.org"];
export const chatWidgetMeta = (base: { resourceDomains: string[]; connectDomains: string[] }) => {
  const csp = { ...base, resourceDomains: [...base.resourceDomains, ...CHAT_RESOURCE_DOMAINS] };
  return {
  ui: { csp },
  "openai/widgetCSP": { resource_domains: csp.resourceDomains, connect_domains: csp.connectDomains },
  "openai/widgetDescription":
    "Shows Radio Milwaukee's answer as a card: stories, songs, events, maps or what's on the air, with Play, Listen live and Save. The card already shows the details; reply in one or two sentences and don't repeat the list.",
  };
};
