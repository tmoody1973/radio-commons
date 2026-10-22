import { describe, expect, it, vi } from "vitest";
import { BackstoryUnavailable, createBackstoryClient } from "@/lib/backstory";
import { getStation } from "@/lib/stations";

const MATCH = {
  storyId: "s1", title: "Frugal dining", show: "This Bites", showSlug: "this-bites",
  attribution: "This Bites, September 2026", publishedAt: 1, hint: "Cheap eats.", imageUrl: null,
};

describe("stations", () => {
  it("has Radio Milwaukee with its six shows", () => {
    expect(getStation()).toMatchObject({ stationId: "radiomilwaukee", shows: [{ slug: "this-bites" }, { slug: "uniquely-milwaukee" }, { slug: "ladies-first", name: "Ladies First" }, { slug: "milwaukee-music-premiere" }, { slug: "studio-milwaukee" }, { slug: "artist-interviews", name: "Radio Milwaukee Artist Interviews" }] });
  });
  it("refuses an unknown station", () => {
    expect(() => getStation("kexp")).toThrow("Unknown station: kexp");
  });
});

describe("Backstory client", () => {
  it("passes search text and show to searchStoryCards and validates the reply", async () => {
    const calls: unknown[] = [];
    const client = createBackstoryClient({ query: async (name, args) => { calls.push([name, args]); return [MATCH]; } });
    expect(await client.searchStoryCards("cheap eats", "this-bites")).toEqual([MATCH]);
    expect(calls).toEqual([["public:searchStoryCards", { text: "cheap eats", showSlug: "this-bites" }]]);
  });
  it("asks songStory by artist and title and validates the reply", async () => {
    const calls: unknown[] = [];
    const found = { storyId: "s9", show: "Milwaukee Music Premiere", title: "Glitzy, 'Effort'", kind: "premiere", publishedAt: 1 };
    const client = createBackstoryClient({ query: async (name, args) => { calls.push([name, args]); return found; } });
    expect(await client.songStory("Glitzy", "Effort")).toEqual(found);
    expect(calls).toEqual([["public:songStory", { artist: "Glitzy", title: "Effort" }]]);
    const odd = createBackstoryClient({ query: async () => ({ storyId: "s9", kind: "episode" }) });
    await expect(odd.songStory("Glitzy", "Effort")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("waits out a cold first call (0.4-0.5 s live on 2026-10-21; Amazon allows 3 s)", async () => {
    vi.useFakeTimers();
    try {
      const client = createBackstoryClient({ query: () => new Promise((resolve) => setTimeout(() => resolve([MATCH]), 600)) });
      const reply = client.searchStoryCards("tomato martini");
      await vi.advanceTimersByTimeAsync(600);
      await expect(reply).resolves.toEqual([MATCH]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("still gives up on a Backstory that doesn't answer within 1.5 s", async () => {
    vi.useFakeTimers();
    try {
      const client = createBackstoryClient({ query: () => new Promise((resolve) => setTimeout(() => resolve([MATCH]), 2000)) });
      const gaveUp = expect(client.searchStoryCards("x")).rejects.toBeInstanceOf(BackstoryUnavailable);
      await vi.advanceTimersByTimeAsync(1500);
      await gaveUp;
    } finally {
      vi.useRealTimers();
    }
  });
  it("aborts a slow Backstory call", async () => {
    const client = createBackstoryClient({ query: () => new Promise((resolve) => setTimeout(() => resolve([]), 1000)), timeoutMs: 50 });
    await expect(client.searchStoryCards("x")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("treats a malformed reply as unavailable, never as data", async () => {
    const client = createBackstoryClient({ query: async () => [{ nope: true }] });
    await expect(client.searchStoryCards("x")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("treats a thrown error as unavailable", async () => {
    const client = createBackstoryClient({ query: async () => { throw new Error("ECONNRESET"); } });
    await expect(client.getStory("s1")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("returns null for an unknown or unpublished story", async () => {
    const client = createBackstoryClient({ query: async () => null });
    expect(await client.getStory("missing")).toBeNull();
  });
});
