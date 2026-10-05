import { describe, expect, it } from "vitest";
import { renderView } from "@/lib/card";
import { buildMcpHandler, CARD_URI } from "@/lib/mcp";
import { AUTH_TOOLS } from "@/lib/listenerAuth";
import { PlaylistUnavailable, type RecentSong, type Station } from "@/lib/playlist";
import { spokenOnAir } from "@/lib/speech";
import { LIVE_STREAMS, STREAM_HOST } from "@/lib/streams";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const NOW = new Date("2026-10-05T20:00:00Z");
const XSS = "<script>alert(1)</script>";
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const call = (args: Record<string, unknown>) => ({ method: "tools/call", params: { name: "on_air_now", arguments: args } });
const handlerWith = (playlist = fakePlaylist()) =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, now: () => NOW, defer: (task) => void task(), cardHtml: () => "" });
const song = (title: string, artist: string, minutesAgo = 3): RecentSong => ({
  playId: `play_${title.length}`, title, artist, playedAt: NOW.getTime() - minutesAgo * 60_000,
  artworkUrl: "https://is1-ssl.mzstatic.com/x/{w}x{h}bb.jpg", previewUrl: null,
});

describe("live streams", () => {
  it("has one https streamguys stream per music station", () => {
    expect(Object.keys(LIVE_STREAMS).sort()).toEqual(["414music", "88nine", "hyfin", "rhythmlab"]);
    for (const url of Object.values(LIVE_STREAMS)) expect(url.startsWith(`${STREAM_HOST}/`)).toBe(true);
    expect(STREAM_HOST).toBe("https://wyms.streamguys1.com");
  });

  it("the card's CSP lets the streams play", async () => {
    const read = await mcpPost(handlerWith(), { method: "resources/read", params: { uri: CARD_URI } });
    expect(read.message.result.contents[0]._meta.ui.csp.resourceDomains).toContain(STREAM_HOST);
  });
});

describe("spokenOnAir", () => {
  const all = (songs: Partial<Record<Station, { title: string; artist: string } | null>>) =>
    (["88nine", "hyfin", "rhythmlab", "414music"] as const).map((station) => ({ station, song: songs[station] ?? null }));

  it("names each station's song and hands off to Alexa's player", () => {
    const text = spokenOnAir(all({ "88nine": { title: "Lauren", artist: "Men I Trust" }, hyfin: { title: "Oya", artist: "Ibeyi" }, rhythmlab: { title: "Gold", artist: "Kiah" } }));
    expect(text).toBe("On air now: 88Nine is playing \"Lauren\" by Men I Trust; HYFIN, \"Oya\" by Ibeyi; Rhythm Lab, \"Gold\" by Kiah; 414 Music, live. Tap Listen live, or say 'Alexa, play HYFIN' to keep listening.");
  });

  it("drops artist names to stay within about 45 words", () => {
    const long = { title: "A Long Song Title Here", artist: "An Artist With Many Names" };
    const text = spokenOnAir(all({ "88nine": long, hyfin: long, rhythmlab: long, "414music": long }));
    expect(text).not.toContain("by An Artist");
    expect(words(text)).toBeLessThanOrEqual(45);
  });

  it("one station: its song and how to keep listening", () => {
    expect(spokenOnAir([{ station: "hyfin", song: { title: "Oya", artist: "Ibeyi" } }]))
      .toBe("HYFIN is playing \"Oya\" by Ibeyi. Tap Listen live, or say 'Alexa, play HYFIN' to keep listening.");
    expect(spokenOnAir([{ station: "414music", song: null }])).toBe("414 Music is live now. Tap Listen live, or say 'Alexa, play 414 Music' to keep listening.");
  });
});

describe("on-air card", () => {
  const tiles = [
    { station: "88nine" as const, song: { ...song(`Bad ${XSS}`, "Men I Trust"), when: "3 min ago" } },
    { station: "hyfin" as const, song: null },
  ];
  const html = renderView({ view: "on-air", tiles });

  it("every station gets a Listen live button carrying its stream", () => {
    expect(html).toContain(`data-audio="${LIVE_STREAMS["88nine"]}"`);
    expect(html).toContain(`data-audio="${LIVE_STREAMS.hyfin}"`);
    expect(html.match(/row-play live/g)).toHaveLength(2);
    expect(html).toContain("Listen live");
    expect(html).toContain("HYFIN");
    expect(html).toContain("Live now");
  });

  it("escapes song text and offers Save only where there is a song", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html.match(/class="secondary ask"/g)).toHaveLength(1);
    expect(html).toContain(`data-ask="Save &quot;Bad &lt;script&gt;alert(1)&lt;/script&gt;&quot; by Men I Trust"`);
    expect(html).toContain("600x600");
  });

  it("one station is one large tile", () => {
    const one = renderView({ view: "on-air", tiles: [tiles[0]] });
    expect(one).toContain('class="card story music"');
    expect(one.match(/row-play live/g)).toHaveLength(1);
  });
});

describe("on_air_now", () => {
  it("is a card tool that needs no linked account, described for what's on now and listen requests", async () => {
    const tools = (await mcpPost(handlerWith(), { method: "tools/list" })).message.result.tools;
    const tool = tools.find((t: { name: string }) => t.name === "on_air_now");
    expect(tool._meta.ui.resourceUri).toBe(CARD_URI);
    expect(AUTH_TOOLS as readonly string[]).not.toContain("on_air_now");
    for (const phrase of ["what's on", "listen to", "play HYFIN"]) expect(tool.description).toContain(phrase);
    const recent = tools.find((t: { name: string }) => t.name === "recent_songs");
    expect(recent.description).toContain("on_air_now");
  });

  it("fetches all four stations at once, and one failing station still gets its tile", async () => {
    const asked: [Station, number][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const playlist = fakePlaylist({
      recentSongs: async (station, count) => {
        asked.push([station, count]);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        if (station === "rhythmlab") throw new PlaylistUnavailable("down");
        return [song(`Song on ${station}`, "Someone")];
      },
    });
    const { message } = await mcpPost(handlerWith(playlist), call({}));
    expect(message.result.isError).toBeFalsy();
    expect(asked.map(([, count]) => count)).toEqual([1, 1, 1, 1]);
    expect(maxInFlight).toBe(4);
    expect(message.result.structuredContent.view).toBe("on-air");
    const { cardHtml } = message.result.structuredContent;
    expect(cardHtml.match(/row-play live/g)).toHaveLength(4);
    expect(cardHtml).toContain("Rhythm Lab");
    expect(message.result.content[0].text).toContain("Rhythm Lab, live");
    expect(message.result.content[0].text).toContain("88Nine is playing \"Song on 88nine\"");
  });

  it("a play from long ago is not called on air", async () => {
    const playlist = fakePlaylist({ recentSongs: async () => [song("Old One", "Someone", 90)] });
    const { message } = await mcpPost(handlerWith(playlist), call({ station: "414music" }));
    expect(message.result.content[0].text).toBe("414 Music is live now. Tap Listen live, or say 'Alexa, play 414 Music' to keep listening.");
  });

  it("with a station: only that station, as one large tile", async () => {
    const asked: Station[] = [];
    const playlist = fakePlaylist({ recentSongs: async (station) => { asked.push(station); return [song("Oya", "Ibeyi")]; } });
    const { message } = await mcpPost(handlerWith(playlist), call({ station: "hyfin" }));
    expect(asked).toEqual(["hyfin"]);
    expect(message.result.content[0].text).toBe("HYFIN is playing \"Oya\" by Ibeyi. Tap Listen live, or say 'Alexa, play HYFIN' to keep listening.");
    expect(message.result.structuredContent.cardHtml).toContain("3 min ago");
    expect(message.result.structuredContent.cardHtml).toContain(`data-audio="${LIVE_STREAMS.hyfin}"`);
  });
});
