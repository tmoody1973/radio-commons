import { describe, expect, it } from "vitest";
import { bestRecentMatch } from "@/lib/songMatch";

const song = (playId: string, title: string, artist: string, minutesAgo: number) =>
  ({ playId, title, artist, playedAt: Date.UTC(2026, 9, 4, 22) - minutesAgo * 60_000, artworkUrl: null, previewUrl: null });
const RECENT = [
  song("p1", "The Unwanted Things", "Ted Leo and the Pharmacists", 2),
  song("p3", "Twisted On A Train", "King Tuff", 9),
  song("p4", "Sick of the Times (feat. The Linda Lindas)", "Thao", 13),
  song("p9", "Holy Roller", "Thao & The Get Down Stay Down", 300),
];

describe("bestRecentMatch", () => {
  it("finds a song by title and artist, ignoring case and 'feat.' credits", () => {
    expect(bestRecentMatch(RECENT, { title: "sick of the times", artist: "THAO" })).toBe("p4");
  });
  it("finds the newest play by an artist alone ('the song by Thao')", () => {
    expect(bestRecentMatch(RECENT, { artist: "Thao" })).toBe("p4");
  });
  it("finds a song by title alone", () => {
    expect(bestRecentMatch(RECENT, { title: "Twisted on a Train" })).toBe("p3");
  });
  it("prefers a title-and-artist match over a newer artist-only match", () => {
    expect(bestRecentMatch(RECENT, { title: "Holy Roller", artist: "Thao" })).toBe("p9");
  });
  it("returns null when nothing matches or nothing was asked", () => {
    expect(bestRecentMatch(RECENT, { title: "Wonderwall" })).toBeNull();
    expect(bestRecentMatch(RECENT, {})).toBeNull();
  });
});
