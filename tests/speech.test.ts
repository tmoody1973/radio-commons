import { EVENT } from "./fixtures";
import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/backstory";
import { EVENTS_UNAVAILABLE_SPEECH, NOT_ALLOWED_SPEECH, NO_PASSAGE_SPEECH, clock, directAudioUrl, eventTime, monthYear, spokenEvents, spokenMatches, spokenPassages, spokenPicks, spokenStory } from "@/lib/speech";

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

describe("events speech", () => {
  const NOW = new Date("2026-10-03T22:00:00Z"); // Saturday 5 PM in Milwaukee
  it("says when like a person: tonight, tomorrow, a weekday, then a date", () => {
    expect(eventTime("2026-10-04T01:00:00Z", NOW)).toBe("tonight at 8 PM");
    expect(eventTime("2026-10-03T23:30:00Z", NOW)).toBe("tonight at 6:30 PM");
    expect(eventTime("2026-10-04T19:00:00Z", NOW)).toBe("tomorrow at 2 PM");
    expect(eventTime("2026-10-07T00:00:00Z", NOW)).toBe("Tuesday at 7 PM");
    expect(eventTime("2026-10-20T00:00:00Z", NOW)).toBe("October 19 at 7 PM");
  });
  it("numbers up to three, with venue and time, and offers the calendar", () => {
    const two = [EVENT, { ...EVENT, title: "Late Show", venue: { ...EVENT.venue, name: "Cactus Club" }, startAt: "2026-10-04T03:00:00Z" }];
    expect(spokenEvents(two, { now: NOW, near: "Ted's Ice Cream", when: "tonight" }))
      .toBe("Near Ted's Ice Cream: 1, Jazz Jam at Jazz Gallery, tonight at 8 PM; 2, Late Show at Cactus Club, tonight at 10 PM. Want to add one to your calendar?");
    expect(spokenEvents([EVENT], { now: NOW }))
      .toBe("From Radio Milwaukee's event guide: 1, Jazz Jam at Jazz Gallery, tonight at 8 PM. Want to add one to your calendar?");
  });
  it("says when it had to look farther, and when there's nothing", () => {
    expect(spokenEvents([EVENT], { now: NOW, near: "Ted's Ice Cream", widened: true })).toMatch(/^Nothing within a mile of Ted's Ice Cream, but within three miles: 1, Jazz Jam/);
    expect(spokenEvents([], { now: NOW, near: "Ted's Ice Cream", when: "tonight" })).toBe("I don't see anything near Ted's Ice Cream tonight.");
    expect(spokenEvents([], { now: NOW, when: "this-weekend" })).toBe("I don't see anything for that this weekend.");
    expect(EVENTS_UNAVAILABLE_SPEECH).toBe("I can't reach Radio Milwaukee's event guide right now.");
  });
  it("picks in the curator's words; station events as Radio Milwaukee's", () => {
    const pick = { ...EVENT, title: "Samara Joy", pick: { curator: "Tarik Moody", role: "Host", blurb: "A voice for the ages. Go." } };
    const station = { ...EVENT, title: "88Nine presents: Friko", isStationEvent: true };
    expect(spokenPicks([pick, station], NOW)).toBe(
      "1, Tarik Moody picks Samara Joy at Jazz Gallery, tonight at 8 PM: \"A voice for the ages.\"; 2, Radio Milwaukee presents Friko at Jazz Gallery, tonight at 8 PM. Want to add one to your calendar?",
    );
  });
  it("after-midnight shows asked about in the evening are still tonight; midnight is 'midnight'", () => {
    const TEN_PM = new Date("2026-10-04T03:00:00Z"); // Saturday 10 PM
    expect(eventTime("2026-10-04T05:30:00Z", TEN_PM)).toBe("tonight at 12:30 AM");
    expect(eventTime("2026-10-04T05:00:00Z", TEN_PM)).toBe("tonight at midnight");
    const ONE_THIRTY_AM = new Date("2026-10-04T06:30:00Z");
    expect(eventTime("2026-10-04T07:00:00Z", ONE_THIRTY_AM)).toBe("tonight at 2 AM");
  });
  it("station events titled '88Nine presents: …' aren't 'presents presents'", () => {
    const station = { ...EVENT, title: "88Nine presents: Friko", isStationEvent: true };
    expect(spokenPicks([station], new Date("2026-10-03T22:00:00Z"))).toMatch(/^1, Radio Milwaukee presents Friko at /);
  });
});
