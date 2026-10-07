import type { createMcpHandler } from "mcp-handler";
import { AUTH_TOOLS, OAUTH_SCOPES } from "@/lib/listenerAuth";

// Everything the ChatGPT door (/api/chatgpt/mcp) does differently from the Alexa+ door; see decision 010.
// The Alexa+ door never calls anything in this file.

type McpServerLike = Parameters<Parameters<typeof createMcpHandler>[0]>[0];
type ToolResultLike = { structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown>; [key: string]: unknown };

const SIGNED_IN_TOOLS = new Set<string>(AUTH_TOOLS);
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
};

// The model reads structuredContent verbatim; these are only for drawing the card, so they go in _meta (hidden
// from the model, forwarded to the card). About half of each card result is HTML.
const RENDER_ONLY = ["cardHtml", "fullHtml", "mapPlaces"];
export function chatResult<T extends ToolResultLike>(result: T): T {
  const content = result.structuredContent;
  if (!content || !RENDER_ONLY.some((key) => key in content)) return result;
  const kept = Object.fromEntries(Object.entries(content).filter(([key]) => !RENDER_ONLY.includes(key)));
  const moved = Object.fromEntries(Object.entries(content).filter(([key]) => RENDER_ONLY.includes(key)));
  return { ...result, structuredContent: kept, _meta: { ...result._meta, ...moved } };
}

/**
 * Every tool registered on the chat door goes through here: chat descriptions, sign-in schemes, a status line, and
 * results with the card HTML moved to _meta. ponytail: patches this request's server instance (mcp-handler builds one
 * per request), so the 24 registrations in mcp.ts stay shared with Alexa+ untouched.
 */
export function patchChatServer(server: McpServerLike) {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: { description?: string; _meta?: Record<string, unknown> }, callback: (...args: unknown[]) => Promise<ToolResultLike>) =>
    register(
      name,
      {
        ...config,
        ...(config.description ? { description: chatDescription(config.description) } : {}),
        _meta: {
          ...config._meta,
          securitySchemes: SIGNED_IN_TOOLS.has(name) ? SIGNED_IN : EITHER,
          ...(STATUS[name] ? { "openai/toolInvocation/invoking": STATUS[name] } : {}),
        },
      } as never,
      (async (...args: unknown[]) => chatResult(await callback(...args))) as never,
    )) as typeof server.registerTool;
}

/** Extra card-resource metadata for ChatGPT: its own CSP key (it may ignore ui.csp) and a note against re-narrating. */
export const chatWidgetMeta = (csp: { resourceDomains: string[]; connectDomains: string[] }) => ({
  "openai/widgetCSP": { resource_domains: csp.resourceDomains, connect_domains: csp.connectDomains },
  "openai/widgetDescription":
    "Shows Radio Milwaukee's answer as a card: stories, songs, events, maps or what's on the air, with Play, Listen live and Save. The card already shows the details; reply in one or two sentences and don't repeat the list.",
});
