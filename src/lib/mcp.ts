import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { BackstoryUnavailable, type BackstoryClient } from "@/lib/backstory";
import { renderCard } from "@/lib/card";
import { directAudioUrl, NOT_ALLOWED_SPEECH, NOT_FOUND_SPEECH, spokenMatches, spokenPassages, spokenStory, UNAVAILABLE_SPEECH } from "@/lib/speech";
import { getStation } from "@/lib/stations";

export const CARD_URI = "ui://radio-commons/story-card.html";
const STORY_ID = /^[a-z0-9]{1,64}$/;
// Show artwork lives on f.prxu.org; episode audio on Dovetail (tracker hop already removed).
const CARD_CSP = { resourceDomains: ["https://f.prxu.org", "https://dovetail.prxu.org", "https://dovetail-cdn.prxu.org"] };

interface Deps {
  backstory: () => BackstoryClient;
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

/** Logs every call's duration (the Alexa+ budget is 500 ms); Backstory failures become a plain apology. */
async function timed(tool: string, run: () => Promise<ToolResult>, fallback: () => ToolResult): Promise<ToolResult> {
  const started = Date.now();
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof BackstoryUnavailable)) throw error;
    console.error(JSON.stringify({ tool, error: error.message }));
    return fallback();
  } finally {
    console.log(JSON.stringify({ tool, ms: Date.now() - started }));
  }
}

export function buildMcpHandler(deps: Deps) {
  const station = getStation();
  const shows = station.shows.map((s) => s.slug) as [string, ...string[]];
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "find_station_story",
        {
          title: "Find a Radio Milwaukee story",
          description:
            "Find a Radio Milwaukee podcast story a listener remembers, by topic, person, place or neighborhood. Returns up to three published stories. Use only these results; never invent a story.",
          inputSchema: z.object({ description: z.string().min(1).max(200), show: z.enum(shows).optional() }),
        },
        async ({ description, show }) =>
          timed("find_station_story", async () => {
            const matches = (await deps.backstory().searchStoryCards(description, show)).slice(0, 3);
            // The ids also go in text: some hosts give the model only `content`, and it needs them for get_station_story.
            const ids = JSON.stringify({ matches: matches.map(({ storyId, title, show }) => ({ storyId, title, show })) });
            return {
              content: [...text(spokenMatches(matches)), ...text(ids)],
              structuredContent: { stationId: station.stationId, matches },
            };
          }, unavailable),
      );

      registerAppTool(
        server,
        "get_station_story",
        {
          title: "Tell me about a Radio Milwaukee story",
          description:
            "Tell the listener about one Radio Milwaukee story. Speak only from this record, always say the show and month, and describe the summary as Radio Milwaukee's, not your own.",
          inputSchema: z.object({ storyId: z.string().min(1).max(64) }),
          _meta: { ui: { resourceUri: CARD_URI } },
        },
        async ({ storyId }) =>
          timed("get_station_story", async () => {
            const story = STORY_ID.test(storyId) ? await deps.backstory().getStory(storyId) : null;
            if (!story) return { content: text(NOT_FOUND_SPEECH) };
            const clean = { ...story, audioUrl: directAudioUrl(story.audioUrl) };
            return { content: text(spokenStory(clean)), structuredContent: { stationId: station.stationId, story: clean, cardHtml: renderCard(clean) } };
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
          _meta: { ui: { resourceUri: CARD_URI } },
        },
        async ({ storyId, question }) =>
          timed("ask_station_story", async () => {
            if (!STORY_ID.test(storyId)) return { content: text(NOT_FOUND_SPEECH) };
            const [story, asked] = await Promise.all([deps.backstory().getStory(storyId), deps.backstory().askStory(storyId, question)]);
            if (!story || asked.status === "not_found") return { content: text(NOT_FOUND_SPEECH) };
            if (asked.status === "not_allowed") return { content: text(NOT_ALLOWED_SPEECH) };
            const clean = { ...story, audioUrl: directAudioUrl(story.audioUrl) };
            return {
              content: text(spokenPassages(asked.passages)),
              structuredContent: { stationId: station.stationId, story: clean, passages: asked.passages, cardHtml: renderCard(clean, asked.passages) },
            };
          }, unavailable),
      );

      registerAppResource(server, "Story card", CARD_URI, { description: "A Radio Milwaukee story with its source, places and episode." }, async () => ({
        contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.cardHtml(), _meta: { ui: { csp: CARD_CSP } } }],
      }));
    },
    { serverInfo: { name: "radio-commons", version: "0.1.0" } },
  );
}
