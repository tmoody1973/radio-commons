import { describe, expect, it } from "vitest";
import { BackstoryUnavailable, createBackstoryClient } from "@/lib/backstory";
import { getStation } from "@/lib/stations";

const MATCH = {
  storyId: "s1", title: "Frugal dining", show: "This Bites", showSlug: "this-bites",
  attribution: "This Bites, September 2026", publishedAt: 1, hint: "Cheap eats.", imageUrl: null,
};

describe("stations", () => {
  it("has Radio Milwaukee with its two shows", () => {
    expect(getStation()).toMatchObject({ stationId: "BROKEN-on-purpose", shows: [{ slug: "this-bites" }, { slug: "uniquely-milwaukee" }] });
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
