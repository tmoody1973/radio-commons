import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { withMcpAuth } from "mcp-handler";
import { gateAuthTools, verifyListenerToken } from "@/lib/listenerAuth";
import { LINK_ACCOUNT_SPEECH, PLAYLIST_UNAVAILABLE_SPEECH } from "@/lib/speech";
import { BackstoryUnavailable } from "@/lib/backstory";
import { FieldGuideUnavailable, type EventQuery } from "@/lib/fieldGuide";
import { PlaylistUnavailable } from "@/lib/playlist";
import { EVENT, fakeBackstory, fakeFieldGuide, fakePlaylist, STORY } from "./fixtures";
import { buildMcpHandler, CARD_URI } from "@/lib/mcp";
import { localWindow } from "@/lib/stationTime";
import { INITIALIZE, mcpPost, mcpPostAs, mcpRequest, send } from "./mcp-wire";

const NOW = new Date("2026-10-04T20:00:00Z");
const handlerWith = (backstory = fakeBackstory(), fieldGuide = fakeFieldGuide(), playlist = fakePlaylist()) =>
  buildMcpHandler({ backstory: () => backstory, fieldGuide: () => fieldGuide, playlist: () => playlist, now: () => NOW, defer: (task) => void task(), cardHtml: () => "<!doctype html><title>card</title>" });
const PLAYLIST_TOOLS = ["find_song_played", "get_track_story", "save_find", "list_finds", "delete_my_finds", "follow_artist", "unfollow_artist", "whats_new_for_me"];
const call = (name: string, args: Record<string, unknown>) => ({ method: "tools/call", params: { name, arguments: args } });

describe("MCP endpoint (Alexa+ 2025-11-25 Streamable HTTP)", () => {
  it("initializes on protocol 2025-11-25 and lists the sixteen tools", async () => {
    const handler = handlerWith();
    const init = await mcpPost(handler, INITIALIZE);
    expect(init.message.result?.protocolVersion).toBe("2025-11-25");
    const tools = await mcpPost(handler, { method: "tools/list" }, 2);
    expect(tools.message.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["ask_station_story", "delete_my_finds", "find_events", "find_song_played", "find_station_story", "follow_artist", "get_station_story", "get_track_story", "latest_station_stories", "list_finds", "recent_songs", "save_find", "search_playlist", "station_picks", "unfollow_artist", "whats_new_for_me"]);
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

  it("every story and events tool shows the one Radio Milwaukee card", async () => {
    const tools = (await mcpPost(handlerWith(), { method: "tools/list" })).message.result.tools;
    for (const tool of tools.filter((t: { name: string }) => !PLAYLIST_TOOLS.includes(t.name))) expect(tool._meta?.ui?.resourceUri).toBe("ui://radio-commons/story-card.html");
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
    expect(message.result.structuredContent.matches[0]).toMatchObject({ playId: "play_1" });
    expect(message.result.content[0].text).toBe('That was likely "Victory Dance" by Ezra Collective, at 1:00 p.m.');
  });
  it("find_song_played hands Alexa exactly one id per song, so it can't save the wrong one", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }));
    const match = message.result.structuredContent.matches[0];
    expect(match).not.toHaveProperty("trackId");
    expect(match).not.toHaveProperty("label");
    expect(message.result.content[1].text).not.toMatch(/trackId|"label"/);
  });
  it("find_song_played and get_track_story are card tools", async () => {
    const tools = await mcpPost(handlerWith(), { method: "tools/list" });
    const meta = (name: string) => tools.message.result.tools.find((t: { name: string }) => t.name === name)._meta;
    expect(meta("find_song_played")).toMatchObject({ ui: { resourceUri: CARD_URI } });
    expect(meta("get_track_story")).toMatchObject({ ui: { resourceUri: CARD_URI } });
  });
  it("find_song_played shows the top match as a song card", async () => {
    const { message } = await mcpPost(handlerWith(), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }));
    expect(message.result.structuredContent.view).toBe("song");
    expect(message.result.structuredContent.cardHtml).toContain("Victory Dance");
    expect(message.result.structuredContent.cardHtml).toContain("on 88Nine");
  });
  it("find_song_played with no match sends no card", async () => {
    const none = fakePlaylist({ findSongPlayed: async () => ({ status: "no_spins", matches: [] }) });
    const { message } = await mcpPost(handlerWith(undefined, undefined, none), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }));
    expect(message.result.structuredContent).not.toHaveProperty("cardHtml");
  });
  it("get_track_story shows credits on the card and names the producer aloud", async () => {
    const facts = fakePlaylist({ getTrackFacts: async () => ({ status: "ok", title: "Victory Dance", artist: "Ezra Collective", year: 2024, label: "Partisan", facts: { producer: [{ value: "Femi Koleoso" }] } }) });
    const { message } = await mcpPost(handlerWith(undefined, undefined, facts), call("get_track_story", { playId: "play_1" }));
    expect(message.result.structuredContent.cardHtml).toContain("Produced by Femi Koleoso");
    expect(message.result.content[0].text).toContain("produced by Femi Koleoso");
  });
  it("recent_songs lists the latest plays newest first, speaks three and shows them all", async () => {
    const asked: unknown[] = [];
    const songs = ["Lauren", "Eddie My Love", "Birdhouse In Your Soul", "Valerie", "Heavy Foot"].map((title, i) => ({
      playId: `play_${i}`, artist: `Artist ${i}`, title, playedAt: Date.UTC(2026, 9, 4, 21, 40 - i * 4), artworkUrl: null, previewUrl: null,
    }));
    const playlist = fakePlaylist({ recentSongs: async (station, count) => { asked.push([station, count]); return songs.slice(0, count); } });
    const { message } = await mcpPost(handlerWith(undefined, undefined, playlist), call("recent_songs", { station: "88nine", count: 5 }));
    expect(asked).toEqual([["88nine", 5]]);
    expect(message.result.content[0].text).toBe('The last 5 on 88Nine, newest first: "Lauren" by Artist 0, "Eddie My Love" by Artist 1, "Birdhouse In Your Soul" by Artist 2, and 2 more on screen.');
    expect(message.result.structuredContent.view).toBe("songs");
    expect(message.result.structuredContent.songs.map((s: { number: number; playId: string }) => [s.number, s.playId])).toEqual([[1, "play_0"], [2, "play_1"], [3, "play_2"], [4, "play_3"], [5, "play_4"]]);
  });
  it("recent_songs defaults to five", async () => {
    const asked: number[] = [];
    const playlist = fakePlaylist({ recentSongs: async (_station, count) => { asked.push(count); return []; } });
    const { message } = await mcpPost(handlerWith(undefined, undefined, playlist), call("recent_songs", { station: "hyfin" }));
    expect(asked).toEqual([5]);
    expect(message.result.content[0].text).toMatch(/haven't logged any songs/i);
  });
  it("find_song_played with several guesses shows them as a list", async () => {
    const two = fakePlaylist({ findSongPlayed: async () => ({ status: "options", matches: [
      { label: "1", playId: "play_1", artist: "A", title: "One", playedAt: Date.UTC(2026, 9, 4, 19), trackId: null, matchReason: null, artworkUrl: null, previewUrl: null, upcomingShows: [] },
      { label: "2", playId: "play_2", artist: "B", title: "Two", playedAt: Date.UTC(2026, 9, 4, 19, 4), trackId: null, matchReason: null, artworkUrl: null, previewUrl: null, upcomingShows: [] },
    ] }) });
    const { message } = await mcpPost(handlerWith(undefined, undefined, two), call("find_song_played", { station: "88nine", startTime: "14:00", endTime: "14:30" }));
    expect(message.result.structuredContent.view).toBe("songs");
  });
  it("search_playlist finds an artist across every station, newest first, and says when it last played", async () => {
    const asked: string[] = [];
    const playlist = fakePlaylist({ searchPlaysIndexed: async (station, query) => {
      asked.push(`${station}:${query}`);
      return [
        { playId: "play_h", artist: "Nas", title: "One Mic", playedAt: Date.UTC(2026, 9, 3, 8, 16), artworkUrl: null, previewUrl: null, station: "hyfin" },
        { playId: "play_n", artist: "Nas", title: "N.Y. State of Mind", playedAt: Date.UTC(2026, 9, 1, 20), artworkUrl: null, previewUrl: null, station: "88nine" },
      ];
    } });
    const { message } = await mcpPost(handlerWith(undefined, undefined, playlist), call("search_playlist", { query: "Nas" }));
    expect(asked).toEqual(["undefined:Nas"]);
    expect(message.result.content[0].text).toBe('"One Mic" by Nas last played on HYFIN, October 3 at 3:16 a.m.');
    expect(message.result.structuredContent.view).toBe("songs");
    expect(message.result.structuredContent.songs.map((s: { playId: string }) => s.playId)).toEqual(["play_h", "play_n"]);
  });
  it("get_track_story finds the song by title when the id is missing or wrong", async () => {
    const asked: unknown[] = [];
    const playlist = fakePlaylist({
      getTrackFacts: async (args) => { asked.push(args); return args.playId === "play_zhane" ? { status: "ok", title: "Groove Thang", artist: "Zhané" } : { status: "not_found" }; },
      searchPlaysIndexed: async () => [{ playId: "play_zhane", artist: "Zhané", title: "Groove Thang", playedAt: Date.UTC(2026, 9, 4, 8, 12), artworkUrl: null, previewUrl: null, station: "hyfin" }],
    });
    const { message } = await mcpPost(handlerWith(undefined, undefined, playlist), call("get_track_story", { playId: "groove_thang", title: "Groove Thang", artist: "Zhane" }));
    expect(asked).toEqual([{ playId: "groove_thang" }, { playId: "play_zhane" }]);
    expect(message.result.content[0].text).toContain('"Groove Thang" by Zhané');
  });
  it("search_playlist says plainly when the station hasn't played it", async () => {
    const { message } = await mcpPost(handlerWith(), call("search_playlist", { query: "Nickelback", station: "88nine" }));
    expect(message.result.content[0].text).toMatch(/haven't played .*Nickelback.* lately/i);
    expect(message.result.structuredContent).not.toHaveProperty("cardHtml");
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
    expect(message.result.content[0].text).toBe(PLAYLIST_UNAVAILABLE_SPEECH);
  });
  it("get_track_story speaks the facts", async () => {
    const facts = fakePlaylist({ getTrackFacts: async () => ({ status: "ok", title: "Victory Dance", artist: "Ezra Collective", year: 2024, label: "Partisan" }) });
    const { message } = await mcpPost(handlerWith(undefined, undefined, facts), call("get_track_story", { playId: "play_1" }));
    expect(message.result.content[0].text).toBe('"Victory Dance" by Ezra Collective, released in 2024, on Partisan.');
  });
  describe("screen memory", () => {
    const songs = ["a", "b", "c"].map((title, i) => ({ playId: `play_${title}_id`, artist: `Artist ${i}`, title, playedAt: Date.UTC(2026, 9, 4, 21 - i), artworkUrl: null, previewUrl: null }));
    const remembering = (extra: Parameters<typeof fakePlaylist>[0] = {}) => {
      const remembered: [string, string[]][] = [];
      return { remembered, playlist: fakePlaylist({ rememberScreen: async (id, ids) => { remembered.push([id, ids]); }, ...extra }) };
    };
    it("recent_songs remembers the on-screen order for a linked listener, and nothing for an anonymous one", async () => {
      const { remembered, playlist } = remembering({ recentSongs: async () => songs });
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("recent_songs", { station: "88nine" }), "user_1");
      expect(remembered).toEqual([["user_1", ["play_a_id", "play_b_id", "play_c_id"]]]);
      await mcpPost(handlerWith(undefined, undefined, playlist), call("recent_songs", { station: "88nine" }));
      expect(remembered).toHaveLength(1);
    });
    it("search_playlist remembers the songs it shows", async () => {
      const { remembered, playlist } = remembering({ searchPlaysIndexed: async () => songs.map((s) => ({ ...s, station: "88nine" as const })) });
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("search_playlist", { query: "artist" }), "user_1");
      expect(remembered).toEqual([["user_1", ["play_a_id", "play_b_id", "play_c_id"]]]);
    });
    it("find_song_played remembers only a list of two or more", async () => {
      const match = (playId: string) => ({ label: "1", playId, artist: "A", title: "T", playedAt: 1, trackId: null, matchReason: null, artworkUrl: null, previewUrl: null, upcomingShows: [] });
      const one = remembering({ findSongPlayed: async () => ({ status: "ok", matches: [match("play_one_id")] }) });
      await mcpPostAs(handlerWith(undefined, undefined, one.playlist), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }), "user_1");
      expect(one.remembered).toEqual([]);
      const two = remembering({ findSongPlayed: async () => ({ status: "options", matches: [match("play_x_id"), match("play_y_id")] }) });
      await mcpPostAs(handlerWith(undefined, undefined, two.playlist), call("find_song_played", { station: "88nine", startTime: "12:00", endTime: "13:00" }), "user_1");
      expect(two.remembered).toEqual([["user_1", ["play_x_id", "play_y_id"]]]);
    });
    it("a failed memory write never fails or changes the reply", async () => {
      const { playlist } = remembering({ recentSongs: async () => songs, rememberScreen: async () => { throw new PlaylistUnavailable("down"); } });
      const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, now: () => NOW, defer: (task) => void task(), cardHtml: () => "" });
      const { message } = await mcpPostAs(handler, call("recent_songs", { station: "88nine" }), "user_1");
      expect(message.result.isError).toBeFalsy();
    });
    it("save_find {number} saves the remembered play; a forgotten number falls to the title, then asks which song", async () => {
      const saved: string[] = [];
      const seen: [string, number][] = [];
      const base = { screenPlay: async (id: string, n: number) => { seen.push([id, n]); return n === 3 ? "play_three_id" : null; },
        saveFind: async (_l: string, id: string) => { saved.push(id); return id === "play_three_id" || id === "play_found_id" ? { status: "ok" as const, findId: "f", appleMusic: "pending" as const, artist: "A", title: "T", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false } : { status: "not_found" as const }; } };
      const playlist = fakePlaylist({ ...base, searchPlaysIndexed: async () => [{ playId: "play_found_id", artist: "Thao", title: "Sick", playedAt: 1, artworkUrl: null, previewUrl: null, station: "88nine" }] });
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { number: 3 }), "user_1");
      expect(seen).toEqual([["user_1", 3]]);
      expect(saved).toEqual(["play_three_id"]);
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { number: 4, title: "Sick", artist: "Thao" }), "user_1");
      expect(saved).toEqual(["play_three_id", "play_found_id"]);
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { number: 5 }), "user_1");
      expect(message.result.content[0].text).toMatch(/which song/i);
      expect(saved).toHaveLength(2);
    });
    it("save_find: a named title beats a number; screenPlay null falls to the playId", async () => {
      const okFind = { status: "ok" as const, findId: "f", appleMusic: "pending" as const, artist: "A", title: "T", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false };
      const saved: string[] = [];
      let screenAsked = 0;
      const playlist = fakePlaylist({
        screenPlay: async () => { screenAsked += 1; return null; },
        saveFind: async (_l, id) => { saved.push(id); return okFind; },
        searchPlaysIndexed: async () => [{ playId: "play_named_id", artist: "Thao", title: "Sick", playedAt: 1, artworkUrl: null, previewUrl: null, station: "88nine" }],
      });
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { number: 2, title: "Sick", artist: "Thao" }), "user_1");
      expect(screenAsked).toBe(0);
      expect(saved).toEqual(["play_named_id"]);
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { number: 2, playId: "play_given_id" }), "user_1");
      expect(screenAsked).toBe(1);
      expect(saved).toEqual(["play_named_id", "play_given_id"]);
    });
    it("a defer that throws synchronously leaves the reply intact", async () => {
      const playlist = fakePlaylist({ recentSongs: async () => songs });
      const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, now: () => NOW, defer: () => { throw new Error("outside request scope"); }, cardHtml: () => "" });
      const { message } = await mcpPostAs(handler, call("recent_songs", { station: "88nine" }), "user_1");
      expect(message.result.isError).toBeFalsy();
      expect(message.result.content[0].text).toMatch(/^The last 3 on 88Nine/);
    });
    it("save_find rejects a number outside 1-10", async () => {
      const { message } = await mcpPostAs(handlerWith(), call("save_find", { number: 11 }), "user_1");
      expect(message.error ?? message.result?.isError).toBeTruthy();
    });
  });
  describe("Finds tools", () => {
    it("save_find saves for the linked listener and confirms by voice", async () => {
      const saved: string[] = [];
      const playlist = fakePlaylist({ saveFind: async (listenerId, playId) => { saved.push(`${listenerId}:${playId}`); return { status: "ok", findId: "f1", appleMusic: "pending", artist: "Ezra Collective", title: "Victory Dance", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false }; } });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { playId: "play_1" }), "user_1");
      expect(saved).toEqual(["user_1:play_1"]);
      expect(message.result.content[0].text).toMatch(/Saved .*Victory Dance.* adding it to Apple Music/);
    });
    it.each([["a list number", "1"], ["a stray word", "it"]])("save_find bounces %s back to Alexa without touching the playlist", async (_case, playId) => {
      const saved: string[] = [];
      const playlist = fakePlaylist({ saveFind: async (_listener, id) => { saved.push(id); return { status: "not_found" }; } });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { playId }), "user_1");
      expect(message.error ?? message.result?.isError).toBeTruthy();
      expect(saved).toEqual([]);
    });
    it("save_find with a made-up id falls back to the title and artist the listener heard", async () => {
      const saved: string[] = [];
      const playlist = fakePlaylist({
        saveFind: async (_listener, playId) => { saved.push(playId); return playId === "play_real" ? { status: "ok", findId: "f1", appleMusic: "pending", artist: "King Tuff", title: "Twisted On A Train", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false } : { status: "not_found" }; },
        searchPlaysIndexed: async () => [{ playId: "play_real", artist: "King Tuff", title: "Twisted On A Train", playedAt: Date.UTC(2026, 9, 4, 21), artworkUrl: null, previewUrl: null, station: "88nine" }],
      });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { playId: "king_tuff_twisted_on_a_train", title: "Twisted On A Train", artist: "King Tuff" }), "user_1");
      expect(saved).toEqual(["king_tuff_twisted_on_a_train", "play_real"]);
      expect(message.result.content[0].text).toMatch(/Saved .*Twisted On A Train/);
    });
    it("save_find with no id finds the newest play by that artist on the station", async () => {
      const saved: string[] = [];
      const playlist = fakePlaylist({
        saveFind: async (_listener, playId) => { saved.push(playId); return { status: "ok", findId: "f1", appleMusic: "not_linked", artist: "Thao", title: "Sick of the Times", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false }; },
        searchPlaysIndexed: async () => [{ playId: "play_thao", artist: "Thao", title: "Sick of the Times (feat. The Linda Lindas)", playedAt: Date.UTC(2026, 9, 4, 21), artworkUrl: null, previewUrl: null, station: "88nine" }],
      });
      await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { artist: "Thao", station: "88nine" }), "user_1");
      expect(saved).toEqual(["play_thao"]);
    });
    it("save_find with nothing to go on asks which song, without touching the playlist", async () => {
      const saved: string[] = [];
      const playlist = fakePlaylist({ saveFind: async (_l, id) => { saved.push(id); return { status: "not_found" }; } });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", {}), "user_1");
      expect(saved).toEqual([]);
      expect(message.result.content[0].text).toMatch(/which song/i);
    });
    it("save_find for a missing play asks which song", async () => {
      const playlist = fakePlaylist({ saveFind: async () => ({ status: "not_found" }) });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("save_find", { playId: "play_gone" }), "user_1");
      expect(message.result.content[0].text).toMatch(/which song/i);
    });
    it("list_finds returns numbered finds with labels", async () => {
      const { message } = await mcpPostAs(handlerWith(), call("list_finds", {}), "user_1");
      expect(message.result.structuredContent.finds[0]).toMatchObject({ label: "1", title: "Victory Dance" });
      expect(message.result.content[0].text).toMatch(/1: "Victory Dance" by Ezra Collective/);
    });
    it("delete_my_finds reports what was removed", async () => {
      const playlist = fakePlaylist({ deleteFinds: async () => ({ deletedFinds: 3, deletedLink: true, deletedFollows: 0 }) });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("delete_my_finds", {}), "user_1");
      expect(message.result.content[0].text).toMatch(/3/);
    });
    it.each([["save_find", { playId: "play_1" }], ["list_finds", {}], ["delete_my_finds", {}]])("%s refuses on its own without a linked listener and never touches the playlist", async (name, args) => {
      const never = async () => { throw new Error("playlist must not be called"); };
      const playlist = fakePlaylist({ saveFind: never, listFinds: never, deleteFinds: never });
      const { message } = await mcpPost(handlerWith(undefined, undefined, playlist), call(name, args));
      expect(message.result.isError).toBe(true);
      expect(message.result.structuredContent).toEqual({ error: "account_linking_required" });
      expect(message.result.content[0].text).toBe(LINK_ACCOUNT_SPEECH);
    });
    it.each([["save_find", { playId: "play_1" }], ["list_finds", {}], ["delete_my_finds", {}]])("%s turns a playlist outage into the playlist apology", async (name, args) => {
      const down = async () => { throw new PlaylistUnavailable("down"); };
      const playlist = fakePlaylist({ saveFind: down, listFinds: down, deleteFinds: down });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call(name, args), "user_1");
      expect(message.result).toMatchObject({ isError: true, content: [{ text: PLAYLIST_UNAVAILABLE_SPEECH }] });
    });
    it("Finds tools do not advertise the story card, since they return none", async () => {
      const { message } = await mcpPost(handlerWith(), { method: "tools/list" });
      for (const tool of message.result.tools.filter((t: { name: string }) => ["save_find", "list_finds", "delete_my_finds"].includes(t.name))) {
        expect(tool._meta?.ui).toBeUndefined();
      }
    });
    it("save_find is idempotent and delete_my_finds is destructive and idempotent", async () => {
      const { message } = await mcpPost(handlerWith(), { method: "tools/list" });
      const annotationsOf = (name: string) => message.result.tools.find((t: { name: string }) => t.name === name)?.annotations;
      expect(annotationsOf("save_find")).toMatchObject({ idempotentHint: true });
      expect(annotationsOf("delete_my_finds")).toMatchObject({ destructiveHint: true, idempotentHint: true });
    });
    it.each([["follow_artist", { artist: "Thao" }], ["unfollow_artist", { artist: "Thao" }]])("%s refuses without a linked listener and never touches the playlist", async (name, args) => {
      const never = async () => { throw new Error("playlist must not be called"); };
      const { message } = await mcpPost(handlerWith(undefined, undefined, fakePlaylist({ follow: never, unfollow: never })), call(name, args));
      expect(message.result.structuredContent).toEqual({ error: "account_linking_required" });
    });
    it("follow_artist follows by name for the linked listener", async () => {
      const followed: unknown[] = [];
      const playlist = fakePlaylist({ follow: async (listenerId, target) => { followed.push([listenerId, target]); return { status: "ok", artistId: "a1", artistName: "Thao", firstFollow: true }; } });
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, playlist), call("follow_artist", { artist: "Thao" }), "user_1");
      expect(followed).toEqual([["user_1", { artist: "Thao" }]]);
      expect(message.result.content[0].text).toBe("I'll follow Thao. Ask me what's new for you anytime.");
    });
    it("follow_artist says an unknown artist is not in the playlist, in the listener's words", async () => {
      const { message } = await mcpPostAs(handlerWith(), call("follow_artist", { artist: "Thao" }), "user_1");
      expect(message.result.content[0].text).toBe("I don't have Thao in our playlist yet.");
    });
    it("follow_artist with neither artist nor playId asks which artist, without touching the playlist", async () => {
      const never = async () => { throw new Error("playlist must not be called"); };
      const { message } = await mcpPostAs(handlerWith(undefined, undefined, fakePlaylist({ follow: never })), call("follow_artist", {}), "user_1");
      expect(message.result.content[0].text).toBe("Which artist should I follow?");
    });
    it("unfollow_artist speaks ok and not_following", async () => {
      const ok = fakePlaylist({ unfollow: async () => ({ status: "ok", artistName: "Thao" }) });
      expect((await mcpPostAs(handlerWith(undefined, undefined, ok), call("unfollow_artist", { artist: "Thao" }), "user_1")).message.result.content[0].text).toBe("Done — I won't keep an eye out for Thao anymore.");
      expect((await mcpPostAs(handlerWith(), call("unfollow_artist", { artist: "Thao" }), "user_1")).message.result.content[0].text).toBe("You're not following Thao.");
    });
    it("follow and unfollow are idempotent", async () => {
      const { message } = await mcpPost(handlerWith(), { method: "tools/list" });
      for (const name of ["follow_artist", "unfollow_artist"]) {
        expect(message.result.tools.find((t: { name: string }) => t.name === name)?.annotations).toMatchObject({ idempotentHint: true });
      }
    });
    describe("whats_new_for_me", () => {
      const DIGEST = {
        since: 1, now: 777,
        items: [
          { kind: "show" as const, artistId: "a1", artist: "Thao", venue: "Turner Hall", city: "Milwaukee", startsAtMs: Date.parse("2026-10-06T20:00:00Z") },
          { kind: "spins" as const, artistId: "a2", artist: "Nas", total: 4, byStation: [{ station: "hyfin", count: 3 }, { station: "88nine", count: 1 }] },
          { kind: "story" as const, artistId: "a3", artist: "Zhané", storyId: "s1", title: "t", show: "Ladies First", publishedAt: 0 },
        ],
        artists: [{ artistId: "a1", name: "Thao", artworkUrl: null }, { artistId: "a2", name: "Nas", artworkUrl: null }, { artistId: "a3", name: "Zhané", artworkUrl: null }],
      };
      const run = (playlist = fakePlaylist(), fieldGuide = fakeFieldGuide()) => mcpPostAs(handlerWith(undefined, fieldGuide, playlist), call("whats_new_for_me", {}), "user_1");
      it("refuses without a linked listener", async () => {
        const never = async () => { throw new Error("playlist must not be called"); };
        const { message } = await mcpPost(handlerWith(undefined, undefined, fakePlaylist({ digest: never })), call("whats_new_for_me", {}));
        expect(message.result.isError).toBe(true);
        expect(message.result.structuredContent).toEqual({ error: "account_linking_required" });
      });
      it("speaks the digest, shows the digest card and marks it seen once", async () => {
        const seen: [string, number][] = [];
        const { message } = await run(fakePlaylist({ digest: async () => DIGEST, markDigestSeen: async (id, at) => { seen.push([id, at]); } }));
        expect(message.result.content[0].text).toBe("Since your last visit: Thao plays Turner Hall in Milwaukee on Tuesday, October 6. HYFIN played Nas 3 times and 88Nine once. And there's a new Ladies First story about Zhané.");
        expect(message.result.structuredContent.view).toBe("digest");
        expect(seen).toEqual([["user_1", 777]]);
      });
      it("falls back to the picks, still marks seen, when nothing is new", async () => {
        const seen: number[] = [];
        const { message } = await run(fakePlaylist({ digest: async () => ({ since: 1, now: 5, items: [], artists: [] }), markDigestSeen: async (_id, at) => { seen.push(at); } }));
        expect(message.result.content[0].text).toMatch(/^Nothing new from your artists yet — here's what the station's excited about\. 1, Tarik Moody picks Samara Joy/);
        expect(message.result.structuredContent.view).toBe("events");
        expect(seen).toEqual([5]);
      });
      it("answers the empty sentence alone when the picks are down", async () => {
        const down = fakeFieldGuide({ picks: async () => { throw new FieldGuideUnavailable("down"); } });
        const { message } = await run(fakePlaylist(), down);
        expect(message.result.isError).toBeFalsy();
        expect(message.result.content[0].text).toBe("Nothing new from your artists yet — here's what the station's excited about.");
      });
      it("does not mark seen when the digest read fails", async () => {
        const seen: number[] = [];
        const { message } = await run(fakePlaylist({ digest: async () => { throw new PlaylistUnavailable("down"); }, markDigestSeen: async (_id, at) => { seen.push(at); } }));
        expect(message.result.content[0].text).toBe(PLAYLIST_UNAVAILABLE_SPEECH);
        expect(seen).toEqual([]);
      });
      it("is a card tool", async () => {
        const { message } = await mcpPost(handlerWith(), { method: "tools/list" });
        expect(message.result.tools.find((t: { name: string }) => t.name === "whats_new_for_me")._meta.ui.resourceUri).toBe(CARD_URI);
      });
    });
    it("follow and unfollow ask which artist for a whitespace-only name, without touching the playlist", async () => {
      const never = async () => { throw new Error("playlist must not be called"); };
      const playlist = fakePlaylist({ follow: never, unfollow: never });
      expect((await mcpPostAs(handlerWith(undefined, undefined, playlist), call("follow_artist", { artist: "   " }), "user_1")).message.result.content[0].text).toBe("Which artist should I follow?");
      expect((await mcpPostAs(handlerWith(undefined, undefined, playlist), call("unfollow_artist", { artist: "   " }), "user_1")).message.result.content[0].text).toBe("Which artist should I stop following?");
    });
    it("a real bearer reaches save_find as the listener id through withMcpAuth", async () => {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const input = `${b64({ alg: "RS256", typ: "at+jwt", kid: "ins_1" })}.${b64({ iss: "https://issuer.example", sub: "user_42", client_id: "alexa-client", scope: "openid", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
      const token = `${input}.${createSign("RSA-SHA256").update(input).sign(privateKey).toString("base64url")}`;
      vi.stubEnv("CLERK_LISTENER_ISSUER", "https://issuer.example");
      vi.stubEnv("CLERK_LISTENER_OAUTH_CLIENT_ID", "alexa-client");
      vi.stubEnv("CLERK_LISTENER_JWT_KEY", publicKey.export({ type: "spki", format: "pem" }).toString());
      try {
        const saved: string[] = [];
        const playlist = fakePlaylist({ saveFind: async (listenerId, playId) => { saved.push(`${listenerId}:${playId}`); return { status: "ok", findId: "f1", appleMusic: "not_linked", artist: "A", title: "T", alreadySaved: false, artistId: null, artistName: "A", firstFollow: false, nextShow: null, story: null, recentlySaved: false }; } });
        const wrapped = withMcpAuth(gateAuthTools(handlerWith(undefined, undefined, playlist)), verifyListenerToken, { required: false });
        const { message } = await send(wrapped, mcpRequest(call("save_find", { playId: "play_9" }), 1, { authorization: `Bearer ${token}` }));
        expect(message.result.isError).toBeFalsy();
        expect(saved).toEqual(["user_42:play_9"]);
        expect((await send(wrapped, mcpRequest(call("save_find", { playId: "play_9" })))).status).toBe(401);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
