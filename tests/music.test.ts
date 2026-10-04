import { afterEach, describe, expect, it } from "vitest";
import { storySchema, type Story } from "@/lib/backstory";
import { renderView } from "@/lib/card";
import { isOpenableLink } from "@/lib/maps";
import { buildMcpHandler } from "@/lib/mcp";
import { spokenPassages, spokenStory } from "@/lib/speech";
import { getStation } from "@/lib/stations";
import { EVENT, fakeBackstory, fakeFieldGuide, STORY } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const SONG_AUDIO = "https://cpa.ds.npr.org/s921/audio/2026/09/glitzy-effort.mp3";
const PREMIERE: Story = {
  ...STORY, storyId: "jn7premiere00000000000000000000a", show: "Milwaukee Music Premiere", title: "Milwaukee Music Premiere: Glitzy, 'Effort'",
  summary: "Glitzy debut a single from their first album.", publishedAt: Date.UTC(2026, 9, 1, 11), attribution: "Milwaukee Music Premiere, October 2026",
  audioUrl: SONG_AUDIO, permalink: "https://radiomilwaukee.org/local-music/2026-10-01/new-milwaukee-music-glitzy", places: [],
  contentType: "premiere",
  song: {
    artist: "Glitzy", title: "Effort", album: "Say Sorry / You're Right", releaseDate: "2026-10-23",
    credits: [{ role: "mastering", name: "Carl Saff" }], releaseShow: { venue: "Sugar Maple", date: "2026-10-23" }, setList: null, audioUrl: SONG_AUDIO,
  },
};
const SESSION: Story = {
  ...STORY, storyId: "jn7session000000000000000000000a", show: "Studio Milwaukee Sessions", title: "Studio Milwaukee Session: Tank & The Bangas",
  summary: "Tank & The Bangas played a joyous set.", publishedAt: Date.UTC(2026, 7, 25, 17), attribution: "Studio Milwaukee Sessions, August 2026",
  audioUrl: "", permalink: "https://radiomilwaukee.org/discover-music/studio-milwaukee/2026-08-25/tank-and-the-bangas-concert-live-show", places: [],
  contentType: "session",
  song: { artist: "Tank & The Bangas", title: null, album: null, releaseDate: null, credits: [], releaseShow: null, setList: ["Boxes & Squares", "Move", "Don't Count Yourself Out", "Ants"], audioUrl: null },
};
afterEach(() => { delete process.env.PLAY_PREMIERE_AUDIO; });

describe("music stories", () => {
  it("the client reads premiere payloads, and older episode payloads as episodes without a song", () => {
    expect(storySchema.parse(PREMIERE)).toMatchObject({ contentType: "premiere", song: { title: "Effort" } });
    const { contentType: _c, song: _s, ...old } = STORY as Story;
    expect(storySchema.parse(old)).toMatchObject({ contentType: "episode", song: null });
  });

  it("the station's show list includes both music shows", () => {
    expect(getStation().shows.map((s) => s.slug)).toEqual(expect.arrayContaining(["milwaukee-music-premiere", "studio-milwaukee"]));
  });

  it("premiere card: song, album and date, credits, release show, Play song", () => {
    const html = renderView({ view: "story", story: PREMIERE });
    expect(html).toContain("Glitzy — “Effort”");
    expect(html).toContain("Say Sorry / You&#39;re Right · out October 23");
    expect(html).toContain("Carl Saff (mastering)");
    expect(html).toContain("Release show: Sugar Maple, October 23");
    expect(html).toContain(`class="primary play" data-audio="${SONG_AUDIO}"`);
    expect(html).toContain("Play song");
  });

  it("premiere without audio: no play button, a link to read it", () => {
    const html = renderView({ view: "story", story: { ...PREMIERE, song: { ...PREMIERE.song!, audioUrl: null } } });
    expect(html).not.toContain("data-audio");
    expect(html).toContain(`class="primary details" data-url="${PREMIERE.permalink}"`);
  });

  it("session card: set list and a link to the session page, never audio", () => {
    const html = renderView({ view: "story", story: SESSION });
    expect(html).toContain("<li>Boxes &amp; Squares</li>");
    expect(html).toContain(`class="primary details" data-url="${SESSION.permalink}"`);
    expect(html).not.toContain("data-audio");
  });

  it("article passages have no moment to play and say where they come from", () => {
    const html = renderView({ view: "quote", story: SESSION, passages: [{ text: "a joyous set", startMs: 0, speaker: null }] });
    expect(html).toContain("From Radio Milwaukee&#39;s session write-up");
    expect(html).not.toContain("play-from");
    expect(spokenPassages([{ text: "a joyous set", startMs: 0, speaker: null }], "session")).toBe("Radio Milwaukee's session write-up says: 'a joyous set'");
    expect(spokenPassages([{ text: "Glitzy are rock-solid", startMs: 0, speaker: null }], "premiere")).toBe("Radio Milwaukee's premiere says: 'Glitzy are rock-solid'");
  });

  it("speech", () => {
    expect(spokenStory(PREMIERE)).toBe("From Radio Milwaukee's Milwaukee Music Premiere, October 2026: Glitzy, 'Effort', from their album Say Sorry / You're Right, out October 23. Want to hear it?");
    expect(spokenStory({ ...PREMIERE, song: { ...PREMIERE.song!, audioUrl: null, album: null, releaseDate: null } })).toBe("From Radio Milwaukee's Milwaukee Music Premiere, October 2026: Glitzy, 'Effort'. Want to read about it?");
    expect(spokenStory(SESSION)).toBe("From Radio Milwaukee's Studio Milwaukee Sessions, August 2026: Tank & The Bangas played Boxes & Squares, Move and Don't Count Yourself Out. Tank & The Bangas played a joyous set. The session is on radiomilwaukee.org.");
  });

  it("a premiere or session with no approved song record is an article: no Play episode, no offer to hear it", () => {
    const bare = { ...PREMIERE, song: null };
    const html = renderView({ view: "story", story: bare });
    expect(html).not.toContain("Play episode");
    expect(html).not.toContain("data-audio");
    expect(html).toContain(`class="primary details" data-url="${PREMIERE.permalink}"`);
    expect(spokenStory(bare)).toBe("From Radio Milwaukee's Milwaukee Music Premiere, October 2026: Glitzy debut a single from their first album. It's on radiomilwaukee.org.");
    expect(spokenStory({ ...SESSION, song: null })).toBe("From Radio Milwaukee's Studio Milwaukee Sessions, August 2026: Tank & The Bangas played a joyous set. It's on radiomilwaukee.org.");
  });

  it("session and premiere pages can be opened; other sites can't", () => {
    expect(isOpenableLink(SESSION.permalink!)).toBe(true);
    expect(isOpenableLink("https://example.com/x")).toBe(false);
  });

  it("get_station_story: the audio switch, and the release show linked to its Field Guide event", async () => {
    const releaseShow = { ...EVENT, title: "Glitzy album release", startAt: "2026-10-24T00:00:00.000Z", venue: { ...EVENT.venue, name: "Sugar Maple" } };
    const handler = buildMcpHandler({
      backstory: () => fakeBackstory({ getStory: async () => PREMIERE }),
      fieldGuide: () => fakeFieldGuide({ events: async () => [releaseShow] }),
      cardHtml: () => "<!doctype html><title>card</title>",
    });
    const call = { method: "tools/call", params: { name: "get_station_story", arguments: { storyId: PREMIERE.storyId } } };
    const on = await mcpPost(handler, call, 2);
    expect(on.message.result.structuredContent.cardHtml).toContain(`data-audio="${SONG_AUDIO}"`);
    expect(on.message.result.structuredContent.cardHtml).toContain(`class="secondary calendar" data-url="${EVENT.calendarUrl.replace(/&/g, "&amp;")}"`);
    process.env.PLAY_PREMIERE_AUDIO = "off";
    const off = await mcpPost(handler, call, 3);
    expect(off.message.result.structuredContent.cardHtml).not.toContain("data-audio");
    expect(off.message.result.content[0].text).toMatch(/Want to read about it\?$/);
    expect(off.message.result.structuredContent.story.audioUrl).toBe("");
  });
});
