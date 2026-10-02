import { describe, expect, it } from "vitest";
import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { buildMcpHandler } from "@/lib/mcp";
import { INITIALIZE, mcpPost } from "./mcp-wire";

const STORY = {
  storyId: "jn7ebag3ecbzcq29j3qm27k4p18fhn0v", show: "Uniquely Milwaukee", title: "414 Art Revival", summary: "An art resale shop.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026",
  audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3", permalink: null, imageUrl: "https://f.prxu.org/um.jpg",
  mentions: [], topics: [], actions: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
} satisfies Story;

export const fakeBackstory = (overrides: Partial<BackstoryClient> = {}): BackstoryClient => ({
  searchStoryCards: async () => [{
    storyId: STORY.storyId, title: STORY.title, show: STORY.show, showSlug: "uniquely-milwaukee",
    attribution: STORY.attribution, publishedAt: STORY.publishedAt, hint: "An art resale shop.", imageUrl: STORY.imageUrl,
  }],
  getStory: async (id) => (id === STORY.storyId ? STORY : null),
  ...overrides,
});
const handlerWith = (backstory = fakeBackstory()) => buildMcpHandler({ backstory: () => backstory, cardHtml: () => "<!doctype html><title>card</title>" });
const call = (name: string, args: Record<string, unknown>) => ({ method: "tools/call", params: { name, arguments: args } });

describe("MCP endpoint (Alexa+ 2025-11-25 Streamable HTTP)", () => {
  it("initializes on protocol 2025-11-25 and lists both tools", async () => {
    const handler = handlerWith();
    const init = await mcpPost(handler, INITIALIZE);
    expect(init.message.result?.protocolVersion).toBe("2025-11-25");
    const tools = await mcpPost(handler, { method: "tools/list" }, 2);
    expect(tools.message.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["find_station_story", "get_station_story"]);
  });

  it("find_station_story returns matches and a spoken shortlist", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_station_story", { description: "art shop in West Allis" }));
    expect(message.result.structuredContent).toMatchObject({ stationId: "radiomilwaukee", matches: [{ storyId: STORY.storyId }] });
    expect(message.result.content[0].text).toMatch(/^I found one Radio Milwaukee story: 414 Art Revival/);
  });

  it("find returns an honest no-match", async () => {
    const { message } = await mcpPost(handlerWith(fakeBackstory({ searchStoryCards: async () => [] })), call("find_station_story", { description: "moon base" }));
    expect(message.result.structuredContent.matches).toEqual([]);
    expect(message.result.content[0].text).toMatch(/^I couldn't find/);
  });

  it("get_station_story speaks with its source and cleans the audio link", async () => {
    const { message } = await mcpPost(handlerWith(), call("get_station_story", { storyId: STORY.storyId }));
    expect(message.result.content[0].text).toMatch(/^From Uniquely Milwaukee, September 2026/);
    expect(message.result.structuredContent.story.audioUrl).toBe("https://dovetail.prxu.org/13497/a.mp3");
  });

  it("an unknown or malformed story id is 'not found', not an error", async () => {
    for (const storyId of ["jn7000000000000000000000000000000", "../etc"]) {
      const { message } = await mcpPost(handlerWith(), call("get_station_story", { storyId }));
      expect(message.result.content[0].text).toBe("I couldn't find that Radio Milwaukee story.");
    }
  });

  it("Backstory down: a plain apology, no partial data", async () => {
    const down = fakeBackstory({ searchStoryCards: async () => { throw new BackstoryUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(down), call("find_station_story", { description: "anything" }));
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toBe("I can't reach Radio Milwaukee's stories right now. Please try again in a minute.");
    expect(message.result.structuredContent).toBeUndefined();
  });

  it("lists the card resource with the MCP Apps mime type and links it from get_station_story", async () => {
    const handler = handlerWith();
    const tools = await mcpPost(handler, { method: "tools/list" });
    const get = tools.message.result.tools.find((t: { name: string }) => t.name === "get_station_story");
    expect(get._meta.ui.resourceUri).toBe("ui://radio-commons/story-card.html");
    const read = await mcpPost(handler, { method: "resources/read", params: { uri: "ui://radio-commons/story-card.html" } }, 2);
    expect(read.message.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    const called = await mcpPost(handler, call("get_station_story", { storyId: STORY.storyId }), 3);
    expect(called.message.result.structuredContent.cardHtml).toContain("414 Art Revival");
  });
});
