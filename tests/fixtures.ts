import type { BackstoryClient, Story } from "@/lib/backstory";

export const STORY = {
  storyId: "jn7ebag3ecbzcq29j3qm27k4p18fhn0v", show: "Uniquely Milwaukee", title: "414 Art Revival", summary: "An art resale shop.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026",
  audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3", permalink: null, imageUrl: "https://f.prxu.org/um.jpg",
  mentions: [], topics: [], actions: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
} satisfies Story;

export const fakeBackstory = (overrides: Partial<BackstoryClient> = {}): BackstoryClient => ({
  searchStoryCards: async () => [{
    storyId: STORY.storyId, title: STORY.title, show: STORY.show, showSlug: "uniquely-milwaukee",
    attribution: STORY.attribution, publishedAt: STORY.publishedAt, hint: "An art resale shop.", imageUrl: STORY.imageUrl,
  }],
  getStory: async (id) => (id === STORY.storyId ? STORY : null),
  ...overrides,
});
