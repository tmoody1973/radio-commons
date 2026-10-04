import { describe, expect, it } from "vitest";
import { renderView } from "@/lib/card";
import { creditLines, songCardFromFacts, songCardFromMatch } from "@/lib/card/song";
import type { RecallMatch, TrackFacts } from "@/lib/playlist";

const XSS = "<script>alert(1)</script>";
const ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4f/x.jpg/%7Bw%7Dx%7Bh%7Dbb.jpg";
const PREVIEW = "https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a";
const person = (group: string, value: string) => ({ group, role: group, value, scope: "track", sources: [] });

const MATCH: RecallMatch = {
  label: "1", playId: "play_1", artist: "Lucy Dacus", title: `Planting ${XSS} Tomatoes`, playedAt: Date.UTC(2026, 9, 4, 19, 13),
  trackId: "track_1", matchReason: null, artworkUrl: ARTWORK, previewUrl: PREVIEW,
  upcomingShows: [{ venue: "Turner Hall", city: "Milwaukee", metro: "milwaukee", startsAtMs: Date.UTC(2026, 9, 24, 1), ticketUrl: null }],
};
const FACTS = {
  status: "ok", title: "Planting Tomatoes", artist: "Lucy Dacus", album: "Planting Tomatoes - Single", year: 2025, label: "Geffen",
  artworkUrl: ARTWORK, previewUrl: PREVIEW, upcomingShows: [],
  facts: {
    producer: [person("producer", "Melina Duterte"), person("producer", "Melina Duterte"), person("producer", "Collin Pastore")],
    writer: [person("writer", "Lucy Dacus")],
    engineer: [person("engineer", "Someone Else")],
  },
} as TrackFacts;

describe("song card", () => {
  it("shows the artwork at a real size, the song, when it played and where", () => {
    const html = renderView({ view: "song", song: songCardFromMatch(MATCH, "88nine") });
    expect(html).toContain('src="https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4f/x.jpg/600x600bb.jpg"');
    expect(html).toContain("Lucy Dacus");
    expect(html).toContain("Played 2:13 p.m. on 88Nine");
  });

  it("plays the 30-second preview from the card's main button and offers to save", () => {
    const html = renderView({ view: "song", song: songCardFromMatch(MATCH, "88nine") });
    expect(html).toMatch(/class="primary play" data-audio="https:\/\/audio-ssl\.itunes\.apple\.com\/[^"]+"[^>]*>.*Play preview/);
    expect(html).toContain('data-ask="Save it"');
  });

  it("names the next local show", () => {
    expect(renderView({ view: "song", song: songCardFromMatch(MATCH, "88nine") })).toContain("Live at Turner Hall, Milwaukee");
  });

  it("without artwork or a preview, shows a plain tile and makes Save the main button", () => {
    const html = renderView({ view: "song", song: songCardFromMatch({ ...MATCH, artworkUrl: null, previewUrl: null }, "414music") });
    expect(html).toContain('class="art ph"');
    expect(html).not.toContain("data-audio");
    expect(html).toMatch(/class="primary ask" data-ask="Save it"/);
    expect(html).toContain("on 414 Music");
  });

  it("never lets song text become markup", () => {
    const html = renderView({ view: "song", song: songCardFromMatch(MATCH, "88nine") });
    expect(html).not.toContain(XSS);
    expect(html).toContain("&lt;script&gt;");
  });

  it("lists producers and writers once each, producers first", () => {
    expect(creditLines(FACTS)).toEqual(["Produced by Melina Duterte and Collin Pastore", "Written by Lucy Dacus"]);
  });

  it("the story card adds album, year and credits", () => {
    const html = renderView({ view: "song", song: songCardFromFacts(FACTS) });
    expect(html).toContain("Planting Tomatoes - Single · 2025");
    expect(html).toContain("Produced by Melina Duterte and Collin Pastore");
  });

  it("a song with no credits on file renders without empty lines", () => {
    expect(creditLines({ ...FACTS, facts: {} } as TrackFacts)).toEqual([]);
  });
});
