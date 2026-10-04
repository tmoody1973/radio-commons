import type { BackstoryClient, Story } from "@/lib/backstory";
import type { PlaylistClient } from "@/lib/playlist";
import type { FieldGuideClient, PublicEvent } from "@/lib/fieldGuide";

export const STORY = {
  storyId: "jn7ebag3ecbzcq29j3qm27k4p18fhn0v", show: "Uniquely Milwaukee", title: "414 Art Revival", summary: "An art resale shop.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026",
  audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3", permalink: null, imageUrl: "https://f.prxu.org/um.jpg",
  mentions: [], topics: [], actions: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
  contentType: "episode", song: null,
} satisfies Story;

export const fakeBackstory = (overrides: Partial<BackstoryClient> = {}): BackstoryClient => ({
  searchStoryCards: async () => [{
    storyId: STORY.storyId, title: STORY.title, show: STORY.show, showSlug: "uniquely-milwaukee",
    attribution: STORY.attribution, publishedAt: STORY.publishedAt, hint: "An art resale shop.", imageUrl: STORY.imageUrl,
  }],
  getStory: async (id) => (id === STORY.storyId ? STORY : null),
  latestStoryCards: async () => [
    { storyId: "s3", title: "Newest", show: "This Bites", showSlug: "this-bites", attribution: "a", publishedAt: Date.UTC(2026, 9, 2, 15), hint: "h", imageUrl: null },
    { storyId: "s2", title: "Older", show: "This Bites", showSlug: "this-bites", attribution: "a", publishedAt: Date.UTC(2026, 8, 25, 15), hint: "h", imageUrl: null },
  ],
  askStory: async (id) => (id === STORY.storyId
    ? { status: "ok", passages: [{ text: "We sell <art> and 'antiques'.", startMs: 1_122_000, speaker: "Kim Shine" }] }
    : { status: "not_found", passages: [] }),
  ...overrides,
});

export const EVENT = {
  id: "11111111-1111-4111-8111-111111111111", title: "Jazz Jam", startAt: "2026-10-04T01:00:00.000Z", endAt: null,
  venue: { name: "Jazz Gallery", address: "926 E Center St, Milwaukee, WI 53212", lat: 43.0677, lng: -87.8994, neighborhood: "Riverwest" },
  category: "music", isFree: true, priceMin: null, priceMax: null, imageUrl: null,
  url: "https://mke-field-guide.vercel.app/events/jazz-jam", calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Jazz+Jam",
  isStationEvent: false, pick: null,
} satisfies PublicEvent;

export const fakeFieldGuide = (overrides: Partial<FieldGuideClient> = {}): FieldGuideClient => ({
  events: async () => [EVENT],
  picks: async () => [{ ...EVENT, title: "Samara Joy", pick: { curator: "Tarik Moody", role: "Host", blurb: "A voice for the ages. Go." } }],
  ...overrides,
});

export const fakePlaylist = (overrides: Partial<PlaylistClient> = {}): PlaylistClient => ({
  findSongPlayed: async () => ({
    status: "ok",
    matches: [{
      label: "1", playId: "play_1", artist: "Ezra Collective", title: "Victory Dance", playedAt: Date.UTC(2026, 9, 3, 18),
      trackId: "track_1", matchReason: null, artworkUrl: null, previewUrl: null, upcomingShows: [],
    }],
  }),
  getTrackFacts: async () => ({ status: "ok" }),
  recentSongs: async () => [],
  saveFind: async () => ({ status: "ok", findId: "find_1", appleMusic: "not_linked", artist: "Ezra Collective", title: "Victory Dance", alreadySaved: false }),
  listFinds: async () => [{
    label: "1", findId: "find_1", playId: "play_1", trackId: "track_1", artist: "Ezra Collective", title: "Victory Dance",
    stationSlug: "hyfin", savedAt: Date.UTC(2026, 9, 3, 19), appleMusic: { status: "not_linked", reason: null }, artworkUrl: null, previewUrl: null,
  }],
  deleteFinds: async () => ({ deletedFinds: 1, deletedLink: false }),
  connectAppleMusic: async () => undefined,
  ...overrides,
});
