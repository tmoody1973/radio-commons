import { describe, expect, it } from "vitest";
import { BackstoryUnavailable } from "@/lib/backstory";
import { fakeBackstory, STORY } from "./fixtures";
import { buildMcpHandler } from "@/lib/mcp";
import { INITIALIZE, mcpPost } from "./mcp-wire";

const handlerWith = (backstory = fakeBackstory()) => buildMcpHandler({ backstory: () => backstory, cardHtml: () => "<!doctype html><title>card</title>" });
const call = (name: string, args: Record<string, unknown>) => ({ method: "tools/call", params: { name, arguments: args } });

describe("MCP endpoint (Alexa+ 2025-11-25 Streamable HTTP)", () => {
  it("initializes on protocol 2025-11-25 and lists the three tools", async () => {
    const handler = handlerWith();
    const init = await mcpPost(handler, INITIALIZE);
    expect(init.message.result?.protocolVersion).toBe("2025-11-25");
    const tools = await mcpPost(handler, { method: "tools/list" }, 2);
    expect(tools.message.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["ask_station_story", "find_station_story", "get_station_story"]);
  });

  it("find_station_story returns matches and a spoken shortlist", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_station_story", { description: "art shop in West Allis" }));
    expect(message.result.structuredContent).toMatchObject({ stationId: "radiomilwaukee", matches: [{ storyId: STORY.storyId }] });
    expect(message.result.content[0].text).toMatch(/^I found one Radio Milwaukee story: 414 Art Revival/);
    // Some hosts show the model only the text content, so the ids it needs for get_station_story are there too.
    expect(JSON.parse(message.result.content[1].text)).toEqual({ matches: [{ storyId: STORY.storyId, title: STORY.title, show: STORY.show }] });
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
  it("ask_station_story quotes timed passages and puts them on the card", async () => {
    const handler = handlerWith();
    const tools = await mcpPost(handler, { method: "tools/list" });
    expect(tools.message.result.tools.find((t: { name: string }) => t.name === "ask_station_story")._meta.ui.resourceUri).toBe("ui://radio-commons/story-card.html");
    const { message } = await mcpPost(handler, call("ask_station_story", { storyId: STORY.storyId, question: "what do they sell" }), 2);
    expect(message.result.content[0].text).toBe("At 18:42, Kim Shine says: 'We sell <art> and 'antiques'.' Want to hear that part?");
    expect(message.result.structuredContent.passages).toHaveLength(1);
    expect(message.result.structuredContent.story.audioUrl).toBe("https://dovetail.prxu.org/13497/a.mp3");
    expect(message.result.structuredContent.cardHtml).toContain("From the episode");
    expect(message.result.structuredContent.cardHtml).toContain('data-start="1122"');
  });

  it("ask_station_story: switched off, nothing found, unknown story, Backstory down", async () => {
    const off = fakeBackstory({ askStory: async () => ({ status: "not_allowed", passages: [] }) });
    expect((await mcpPost(handlerWith(off), call("ask_station_story", { storyId: STORY.storyId, question: "q" }))).message.result.content[0].text)
      .toBe("Detailed answers aren't available for this episode.");
    const none = fakeBackstory({ askStory: async () => ({ status: "ok", passages: [] }) });
    expect((await mcpPost(handlerWith(none), call("ask_station_story", { storyId: STORY.storyId, question: "q" }))).message.result.content[0].text)
      .toBe("I couldn't find that in the episode.");
    expect((await mcpPost(handlerWith(), call("ask_station_story", { storyId: "jn7000000000000000000000000000000", question: "q" }))).message.result.content[0].text)
      .toBe("I couldn't find that Radio Milwaukee story.");
    const down = fakeBackstory({ askStory: async () => { throw new BackstoryUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(down), call("ask_station_story", { storyId: STORY.storyId, question: "q" }));
    expect(message.result.isError).toBe(true);
    expect(message.result.structuredContent).toBeUndefined();
  });
});
