import { describe, expect, it } from "vitest";
import { BackstoryUnavailable } from "@/lib/backstory";
import { FieldGuideUnavailable, type EventQuery } from "@/lib/fieldGuide";
import { PlaylistUnavailable } from "@/lib/playlist";
import { EVENT, fakeBackstory, fakeFieldGuide, fakePlaylist, STORY } from "./fixtures";
import { buildMcpHandler } from "@/lib/mcp";
import { localWindow } from "@/lib/stationTime";
import { INITIALIZE, mcpPost } from "./mcp-wire";

const NOW = new Date("2026-10-04T20:00:00Z");
const handlerWith = (backstory = fakeBackstory(), fieldGuide = fakeFieldGuide(), playlist = fakePlaylist()) =>
  buildMcpHandler({ backstory: () => backstory, fieldGuide: () => fieldGuide, playlist: () => playlist, now: () => NOW, cardHtml: () => "<!doctype html><title>card</title>" });
const call = (name: string, args: Record<string, unknown>) => ({ method: "tools/call", params: { name, arguments: args } });

describe("MCP endpoint (Alexa+ 2025-11-25 Streamable HTTP)", () => {
  it("initializes on protocol 2025-11-25 and lists the eight tools", async () => {
    const handler = handlerWith();
    const init = await mcpPost(handler, INITIALIZE);
    expect(init.message.result?.protocolVersion).toBe("2025-11-25");
    const tools = await mcpPost(handler, { method: "tools/list" }, 2);
    expect(tools.message.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["ask_station_story", "find_events", "find_song_played", "find_station_story", "get_station_story", "get_track_story", "latest_station_stories", "station_picks"]);
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

  it("every tool shows the one Radio Milwaukee card", async () => {
    const tools = (await mcpPost(handlerWith(), { method: "tools/list" })).message.result.tools;
    for (const tool of tools) expect(tool._meta?.ui?.resourceUri).toBe("ui://radio-commons/story-card.html");
  });

  it("find_station_story shows the matches as a numbered carousel", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_station_story", { description: "art shop in West Allis" }));
    expect(message.result.structuredContent.view).toBe("stories");
    expect(message.result.structuredContent.cardHtml).toContain('<span class="badge">1</span>');
  });

  it("a match found in a transcript says where it's mentioned", async () => {
    const hinted = fakeBackstory({ searchStoryCards: async () => [{ ...(await fakeBackstory().searchStoryCards("x"))[0], hint: 'Mentioned at 10:45: "They call them stromboli."' }] });
    const { message } = await mcpPost(handlerWith(hinted), call("find_station_story", { description: "stromboli" }));
    expect(message.result.content[0].text).toContain('Mentioned at 10:45: "They call them stromboli."');
  });

  it("latest_station_stories reads the newest stories and shows them as a carousel", async () => {
    const { message } = await mcpPost(handlerWith(), call("latest_station_stories", { show: "this-bites" }));
    expect(message.result.content[0].text).toBe("The newest Radio Milwaukee stories: 1, Newest, from This Bites, October 2026; 2, Older, from This Bites, September 2026. Which one?");
    expect(message.result.structuredContent.view).toBe("stories");
  });

  it("get_station_story with view places shows the map with matching numbers, and the fullscreen map's data", async () => {
    const { message } = await mcpPost(handlerWith(), call("get_station_story", { storyId: STORY.storyId, view: "places" }));
    const data = message.result.structuredContent;
    expect(message.result.content[0].text).toBe("That story mentions one mapped place: 414 Art Revival. Want directions?");
    expect(data.view).toBe("places");
    expect(data.cardHtml).toContain("/api/map?story=" + STORY.storyId);
    expect(data.cardHtml).toContain("data-themed");
    // A version from the pins' locations: re-pinning a place changes the address, so a cached old map can't show.
    expect(data.cardHtml).toMatch(/&amp;v=[a-z0-9]{6,}/);
    expect(data.fullHtml).toContain('id="fullmap"');
    expect(data.mapPlaces).toEqual([{ numbers: [1], lat: 43.01, lng: -88.01 }]);
  });

  it("asking for places when none are mapped says so and shows the story", async () => {
    const none = fakeBackstory({ getStory: async () => ({ ...STORY, places: [] }) });
    const { message } = await mcpPost(handlerWith(none), call("get_station_story", { storyId: STORY.storyId, view: "places" }));
    expect(message.result.content[0].text).toBe("Radio Milwaukee hasn't mapped places for that story.");
    expect(message.result.structuredContent.view).toBe("story");
  });

  it("ask_station_story shows the quote view", async () => {
    const { message } = await mcpPost(handlerWith(), call("ask_station_story", { storyId: STORY.storyId, question: "what do they sell" }));
    expect(message.result.structuredContent.view).toBe("quote");
    expect(message.result.structuredContent.cardHtml).toContain("<blockquote>");
  });
  it("find_events near a story: the place's pin, a map card with the place starred, and a spoken list", async () => {
    let asked: EventQuery = {};
    const fg = fakeFieldGuide({ events: async (q) => { asked = q; return [EVENT]; } });
    const { message } = await mcpPost(handlerWith(fakeBackstory(), fg), call("find_events", { nearStoryId: STORY.storyId, when: "tonight" }));
    expect(asked).toMatchObject({ near: { lat: 43.01, lng: -88.01 }, radiusMiles: 3, when: "tonight" });
    expect(message.result.content[0].text).toMatch(/^Near 414 Art Revival: 1, Jazz Jam at Jazz Gallery, /);
    const data = message.result.structuredContent;
    expect(data.view).toBe("events-map");
    expect(data.cardHtml).toContain("/api/map?events=" + EVENT.id);
    expect(data.cardHtml).toMatch(/\/api\/map\?events=[^"]*&amp;v=[a-z0-9]{6,}/); // versioned by the pins, like story maps
  });

  it("find_events asks once (3 miles, nearest first) and says when the nearest is beyond a mile", async () => {
    const radii: unknown[] = [];
    const fg = fakeFieldGuide({ events: async (q) => { radii.push(q.radiusMiles); return [{ ...EVENT, distanceMiles: 2.4 }]; } });
    const { message } = await mcpPost(handlerWith(fakeBackstory(), fg), call("find_events", { nearStoryId: STORY.storyId }));
    expect(radii).toEqual([3]);
    expect(message.result.content[0].text).toMatch(/^Nothing within a mile of 414 Art Revival, but within three miles:/);
  });

  it("find_events near a story with no mapped places asks where", async () => {
    const none = fakeBackstory({ getStory: async () => ({ ...STORY, places: [] }) });
    const { message } = await mcpPost(handlerWith(none), call("find_events", { nearStoryId: STORY.storyId }));
    expect(message.result.content[0].text).toBe("Radio Milwaukee hasn't mapped places for that story. Where should I look?");
  });

  it("find_events by words or time shows a carousel with Add to calendar", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_events", { query: "live music", when: "this-weekend", freeOnly: true }));
    expect(message.result.structuredContent.view).toBe("events");
    expect(message.result.structuredContent.cardHtml).toContain('class="secondary calendar"');
  });

  it("station_picks reads picks in the curator's words", async () => {
    const { message } = await mcpPost(handlerWith(), call("station_picks", {}));
    expect(message.result.content[0].text).toMatch(/^1, Tarik Moody picks Samara Joy at Jazz Gallery, .*: "A voice for the ages\."/);
    expect(message.result.structuredContent.view).toBe("events");
  });

  it("Field Guide down: the event-guide apology, no partial card", async () => {
    const down = fakeFieldGuide({ events: async () => { throw new FieldGuideUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(fakeBackstory(), down), call("find_events", { query: "jazz" }));
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toBe("I can't reach Radio Milwaukee's event guide right now.");
  });
  it("lists the recall tools alongside the story tools", async () => {
    const tools = await mcpPost(handlerWith(), { method: "tools/list" }, 2);
    const names = tools.message.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["find_song_played", "get_track_story"]));
  });
  it("find_song_played returns playIds Alexa can save and speaks the top match with its local time", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }));
    expect(message.result.structuredContent.matches[0]).toMatchObject({ playId: "play_1", label: "1" });
    expect(message.result.content[0].text).toBe('That was likely "Victory Dance" by Ezra Collective, at 1:00 p.m.');
  });
  it("find_song_played turns local times into the epoch window the playlist expects", async () => {
    const seen: { from: number; to: number }[] = [];
    const spy = fakePlaylist({ findSongPlayed: async ({ from, to }) => { seen.push({ from, to }); return { status: "ok", matches: [] }; } });
    await mcpPost(handlerWith(undefined, undefined, spy), call("find_song_played", { station: "88nine", day: "yesterday", startTime: "08:00", endTime: "08:30" }));
    expect(seen).toEqual([localWindow({ day: "yesterday", startTime: "08:00", endTime: "08:30" }, NOW)]);
  });
  it("find_song_played turns a playlist outage into a plain apology", async () => {
    const down = fakePlaylist({ findSongPlayed: async () => { throw new PlaylistUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(undefined, undefined, down), call("find_song_played", { station: "88nine", startTime: "08:00", endTime: "09:00" }));
    expect(message.result.isError).toBe(true);
  });
  it("get_track_story speaks the facts", async () => {
    const facts = fakePlaylist({ getTrackFacts: async () => ({ status: "ok", title: "Victory Dance", artist: "Ezra Collective", year: 2024, label: "Partisan" }) });
    const { message } = await mcpPost(handlerWith(undefined, undefined, facts), call("get_track_story", { trackId: "track_1" }));
    expect(message.result.content[0].text).toBe('"Victory Dance" by Ezra Collective, released in 2024, on Partisan.');
  });
});
