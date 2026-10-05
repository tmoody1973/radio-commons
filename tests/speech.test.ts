import { EVENT } from "./fixtures";
import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/backstory";
import type { SavedFind } from "@/lib/playlist";
import { EVENTS_UNAVAILABLE_SPEECH, NOT_ALLOWED_SPEECH, NO_PASSAGE_SPEECH, clock, directAudioUrl, eventTime, monthYear, spokenEvents, spokenMatches, spokenPassages, spokenPicks, spokenPlaces, spokenFollowed, spokenSaved, spokenStory, spokenUnfollowed, spokenDigest, spokenFinds } from "@/lib/speech";

const STORY: Story = {
  storyId: "s1", show: "Uniquely Milwaukee", title: "Creativity is sustainable, accessible at 414 Art Revival",
  summary: "414 Art Revival is an art resale shop in West Allis.", publishedAt: Date.UTC(2026, 8, 18, 15),
  attribution: "Uniquely Milwaukee, September 2026", audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3",
  permalink: null, imageUrl: null, mentions: [], topics: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
  actions: [{ kind: "visit", label: "Visit 414 Art Revival", quote: "q", place: "414 Art Revival" }],
  contentType: "episode", song: null,
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
    expect(spokenEvents([], { now: NOW, when: "tomorrow" })).toBe("I don't see anything for that tomorrow.");
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
  it("a Concert Picks pick without a write-up says where it's from, not a placeholder quote", () => {
    const listed = { ...EVENT, title: "Chance the Rapper", pick: { curator: "Brett Krzykowski", role: "Radio Milwaukee", blurb: "On Radio Milwaukee's MKE Concert Picks this week." } };
    expect(spokenPicks([listed], NOW)).toBe("1, Brett Krzykowski picks Chance the Rapper at Jazz Gallery, tonight at 8 PM, from Radio Milwaukee's MKE Concert Picks. Want to add one to your calendar?");
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
  it("says which mapped place takes reservations", () => {
    expect(spokenPlaces(["Bread House", "El Tsunami"], "Bread House")).toBe("That story mentions 2 mapped places. The first two are Bread House and El Tsunami. Bread House takes reservations; tap Reserve to book. Want directions to one?");
  });
});

describe("spokenSaved", () => {
  const ok = (over: Partial<Extract<SavedFind, { status: "ok" }>> = {}): SavedFind => ({
    status: "ok", findId: "f1", appleMusic: "pending", artist: "Thao", title: "Sick of the Times", alreadySaved: false,
    artistId: "a1", artistName: "Thao", firstFollow: false, nextShow: null, story: null, recentlySaved: false, ...over,
  });
  const APPLE_HINT = "To add these to your Apple Music library too, connect it at radiomilwaukee.org slash connect.";
  const SAVED = 'Saved "Sick of the Times" by Thao to your 88Nine Finds, and I\'m adding it to Apple Music.';

  it("weaves the follow, the next show and the story into one reply (Milwaukee date)", () => {
    const saved = ok({ firstFollow: true, nextShow: { venue: "Turner Hall", city: "Milwaukee", startsAtMs: Date.UTC(2026, 9, 10, 1) }, story: { storyId: "s1", title: "T", show: "Studio Milwaukee" } });
    expect(spokenSaved(saved)).toBe(`${SAVED} I'll keep an eye out for Thao — they play Turner Hall in Milwaukee on Friday, October 9, and we have their Studio Milwaukee story.`);
  });

  it("a save never fails because of the extra fields: nothing extra means just the saved sentence", () => {
    expect(spokenSaved(ok())).toBe(SAVED);
  });

  it("each extra stands on its own", () => {
    expect(spokenSaved(ok({ firstFollow: true }))).toBe(`${SAVED} I'll keep an eye out for Thao.`);
    expect(spokenSaved(ok({ story: { storyId: "s1", title: "T", show: "Studio Milwaukee" } }))).toBe(`${SAVED} We have a Studio Milwaukee story about Thao.`);
    expect(spokenSaved(ok({ nextShow: { venue: "Turner Hall", city: "Milwaukee", startsAtMs: Date.UTC(2026, 9, 10, 1) } }))).toBe(`${SAVED} Thao plays Turner Hall in Milwaukee on Friday, October 9.`);
  });

  it("a re-save with only a story names the artist", () => {
    const saved = ok({ alreadySaved: true, story: { storyId: "s1", title: "T", show: "Studio Milwaukee" } });
    expect(spokenSaved(saved)).toBe("It was already in your Finds, so I moved it to the top, and I'm adding it to Apple Music. We have a Studio Milwaukee story about Thao.");
  });

  it("a re-save names the artist for the next show", () => {
    const saved = ok({ alreadySaved: true, nextShow: { venue: "Turner Hall", city: "Milwaukee", startsAtMs: Date.UTC(2026, 9, 10, 1) } });
    expect(spokenSaved(saved)).toBe("It was already in your Finds, so I moved it to the top, and I'm adding it to Apple Music. Thao plays Turner Hall in Milwaukee on Friday, October 9.");
  });

  it("adds the Apple Music hint only when not linked and not saved a moment ago", () => {
    const plain = 'Saved "Sick of the Times" by Thao to your 88Nine Finds.';
    expect(spokenSaved(ok({ appleMusic: "not_linked" }))).toBe(`${plain} ${APPLE_HINT}`);
    expect(spokenSaved(ok({ appleMusic: "not_linked", recentlySaved: true }))).toBe(plain);
  });

  it("asks which song when the play is gone", () => {
    expect(spokenSaved({ status: "not_found" })).toMatch(/which song/);
  });
});

describe("spokenFinds", () => {
  const row = (label: string, status = "added") => ({
    label, findId: `f${label}`, playId: "p", trackId: null, artist: `Artist ${label}`, title: `Song ${label}`, stationSlug: "88nine",
    savedAt: 0, appleMusic: { status, reason: null }, artworkUrl: null, previewUrl: null,
  });
  it("reads at most three, then counts the rest on screen", () => {
    expect(spokenFinds(["1", "2", "3", "4", "5"].map((l) => row(l)))).toBe('Your latest Finds — 1: "Song 1" by Artist 1; 2: "Song 2" by Artist 2; 3: "Song 3" by Artist 3; and 2 more on screen.');
  });
  it("reads a short list whole and keeps the reconnect sentence", () => {
    expect(spokenFinds([row("1"), row("2", "expired")])).toBe('Your latest Finds — 1: "Song 1" by Artist 1; 2: "Song 2" by Artist 2. Apple Music needs reconnecting at radiomilwaukee.org slash connect.');
  });
  it("speaks an empty list", () => {
    expect(spokenFinds([])).toBe("Your Finds are empty. After I name a song, say 'save it'.");
  });
});

describe("follow speech", () => {
  it("speaks a first follow, a repeat follow and an unknown artist", () => {
    expect(spokenFollowed({ status: "ok", artistId: "a1", artistName: "Thao", firstFollow: true }, "thao")).toBe("I'll follow Thao. Ask me what's new for you anytime.");
    expect(spokenFollowed({ status: "ok", artistId: "a1", artistName: "Thao", firstFollow: false }, "thao")).toBe("You're already following Thao.");
    expect(spokenFollowed({ status: "unknown_artist" }, "Thao")).toBe("I don't have Thao in our playlist yet.");
    expect(spokenFollowed({ status: "unknown_artist" }, undefined)).toBe("I don't have that artist in our playlist yet.");
  });
  it("speaks each unfollow outcome", () => {
    expect(spokenUnfollowed({ status: "ok", artistName: "Thao" }, "Thao")).toBe("Done — I won't keep an eye out for Thao anymore.");
    expect(spokenUnfollowed({ status: "not_following" }, "Thao")).toBe("You're not following Thao.");
    expect(spokenUnfollowed({ status: "unknown_artist" }, "Thao")).toBe("I don't have Thao in our playlist yet.");
  });

  describe("spokenDigest", () => {
    const show = { kind: "show" as const, artistId: "a1", artist: "Thao", venue: "Turner Hall", city: "Milwaukee", startsAtMs: Date.parse("2026-10-09T01:00:00Z") };
    const spins = { kind: "spins" as const, artistId: "a2", artist: "Nas", total: 4, byStation: [{ station: "hyfin", count: 3 }, { station: "88nine", count: 1 }] };
    const story = { kind: "story" as const, artistId: "a3", artist: "Zhané", storyId: "s1", title: "t", show: "Ladies First", publishedAt: 0 };
    it("reads a show with its Chicago-time day", () => {
      expect(spokenDigest([show])).toBe("Since your last visit: Thao plays Turner Hall in Milwaukee on Thursday, October 8.");
    });
    it("reads spins per station with once, twice and N times", () => {
      expect(spokenDigest([spins])).toBe("Since your last visit: HYFIN played Nas 3 times and 88Nine once.");
      expect(spokenDigest([{ ...spins, byStation: [{ station: "88nine", count: 2 }] }])).toBe("Since your last visit: 88Nine played Nas twice.");
    });
    it("reads a story, with And when it follows another item", () => {
      expect(spokenDigest([story])).toBe("Since your last visit: there's a new Ladies First story about Zhané.");
      expect(spokenDigest([spins, story])).toBe("Since your last visit: HYFIN played Nas 3 times and 88Nine once. And there's a new Ladies First story about Zhané.");
    });
    it("reads Apple Music added and expired", () => {
      expect(spokenDigest([{ kind: "apple", added: 3, expired: 0 }])).toBe("Since your last visit: 3 of your saved songs are in Apple Music.");
      expect(spokenDigest([{ kind: "apple", added: 0, expired: 1 }])).toBe("Since your last visit: Apple Music needs reconnecting at radiomilwaukee.org slash connect.");
      expect(spokenDigest([{ kind: "apple", added: 2, expired: 1 }])).toBe("Since your last visit: 2 of your saved songs are in Apple Music. Apple Music needs reconnecting at radiomilwaukee.org slash connect.");
    });
    it("reads only the top three items, in order", () => {
      const text = spokenDigest([show, spins, story, { kind: "apple", added: 3, expired: 0 }]);
      expect(text).toBe("Since your last visit: Thao plays Turner Hall in Milwaukee on Thursday, October 8. HYFIN played Nas 3 times and 88Nine once. And there's a new Ladies First story about Zhané.");
    });
  });
});
