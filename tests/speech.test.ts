import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/backstory";
import { NOT_ALLOWED_SPEECH, NO_PASSAGE_SPEECH, clock, directAudioUrl, monthYear, spokenMatches, spokenPassages, spokenStory } from "@/lib/speech";

const STORY: Story = {
  storyId: "s1", show: "Uniquely Milwaukee", title: "Creativity is sustainable, accessible at 414 Art Revival",
  summary: "414 Art Revival is an art resale shop in West Allis.", publishedAt: Date.UTC(2026, 8, 18, 15),
  attribution: "Uniquely Milwaukee, September 2026", audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3",
  permalink: null, imageUrl: null, mentions: [], topics: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
  actions: [{ kind: "visit", label: "Visit 414 Art Revival", quote: "q", place: "414 Art Revival" }],
};
const MATCH = { storyId: "s1", title: "T1", show: "This Bites", showSlug: "this-bites", attribution: "This Bites, September 2026", publishedAt: Date.UTC(2026, 8, 4, 15), hint: "h", imageUrl: null };

describe("speech", () => {
  it("labels months in Milwaukee time", () => {
    expect(monthYear(Date.UTC(2026, 9, 1, 3))).toBe("September 2026"); // 10 p.m. Sept 30 in Milwaukee
  });
  it("tells the story with its source and offers directions to its place", () => {
    expect(spokenStory(STORY)).toBe(
      "From Uniquely Milwaukee, September 2026: Radio Milwaukee's summary says, 414 Art Revival is an art resale shop in West Allis. Would you like directions to 414 Art Revival, or to hear the episode?",
    );
  });
  it("offers the episode when there is no place", () => {
    expect(spokenStory({ ...STORY, places: [] })).toMatch(/Would you like to hear the episode\?$/);
  });
  it("offers the episode when its places have no map pin", () => {
    expect(spokenStory({ ...STORY, places: [{ ...STORY.places[0], lat: null, lng: null }] })).toMatch(/Would you like to hear the episode\?$/);
  });
  it("reads a shortlist, or admits there is no match", () => {
    expect(spokenMatches([])).toBe("I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood.");
    expect(spokenMatches([MATCH])).toBe("I found one Radio Milwaukee story: T1, from This Bites, September 2026.");
    expect(spokenMatches([MATCH, { ...MATCH, storyId: "s2", title: "T2" }])).toBe(
      "I found 2 Radio Milwaukee stories: 1, T1, from This Bites, September 2026; 2, T2, from This Bites, September 2026. Which one?",
    );
  });
  it("skips the Podtrac tracking hop and leaves other links alone", () => {
    expect(directAudioUrl(STORY.audioUrl)).toBe("https://dovetail.prxu.org/13497/a.mp3");
    expect(directAudioUrl("https://example.com/a.mp3")).toBe("https://example.com/a.mp3");
  });
  it("offers directions with the street when the place has an address", () => {
    const withAddress = { ...STORY, places: [{ ...STORY.places[0], address: "414 Art Revival, 8004 W National Ave, Milwaukee, WI 53214-4554, United States" }] };
    expect(spokenStory(withAddress)).toMatch(/Would you like directions to 414 Art Revival at 8004 W National Ave, or to hear the episode\?$/);
  });
  it("says when in the episode a passage is heard", () => {
    expect(clock(1_122_000)).toBe("18:42");
    expect(clock(5_000)).toBe("0:05");
    expect(clock(3_725_000)).toBe("1:02:05");
  });
  it("quotes passages with the time and a confirmed speaker, then offers that part", () => {
    expect(spokenPassages([{ text: "The stromboli is the deal.", startMs: 1_122_000, speaker: "Ann Christenson" }]))
      .toBe("At 18:42, Ann Christenson says: 'The stromboli is the deal.' Want to hear that part?");
    expect(spokenPassages([{ text: "A.", startMs: 0, speaker: null }, { text: "B.", startMs: 61_000, speaker: null }]))
      .toBe("At 0:00, the episode says: 'A.' One more moment is on the screen. Want to hear that part?");
    expect(spokenPassages([])).toBe(NO_PASSAGE_SPEECH);
    expect(NOT_ALLOWED_SPEECH).toBe("Detailed answers aren't available for this episode.");
  });
});
