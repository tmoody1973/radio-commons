import { describe, expect, it } from "vitest";
import { createPlaylistClient, PlaylistUnavailable } from "@/lib/playlist";

const noop = async () => ({});
const base = { query: noop, mutation: noop, action: noop, serverKey: "server-key" };

describe("playlist client", () => {
  it("validates findSongPlayed replies", async () => {
    const client = createPlaylistClient({ ...base, query: async () => ({ status: "weird" }) });
    await expect(client.findSongPlayed({ station: "88nine", from: 0, to: 1 })).rejects.toBeInstanceOf(PlaylistUnavailable);
  });

  it("times out a slow call", async () => {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve({ status: "no_spins", matches: [] }), 50));
    const client = createPlaylistClient({ ...base, query: slow, timeoutMs: 5 });
    await expect(client.findSongPlayed({ station: "88nine", from: 0, to: 1 })).rejects.toBeInstanceOf(PlaylistUnavailable);
  });

  it("sends the server key on saveFind and returns the not_found union member", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = createPlaylistClient({
      ...base,
      mutation: async (_name, args) => {
        calls.push(args);
        return { status: "not_found" };
      },
    });
    await expect(client.saveFind("user_1", "play_1")).resolves.toEqual({ status: "not_found" });
    expect(calls[0]).toEqual({ serverKey: "server-key", listenerId: "user_1", playId: "play_1" });
  });

  it("returns an ok save without leaking the server key", async () => {
    const saved = { status: "ok", findId: "find_1", appleMusic: "pending", artist: "A", title: "T", alreadySaved: false };
    const client = createPlaylistClient({ ...base, mutation: async () => saved });
    const result = await client.saveFind("user_1", "play_1");
    expect(result).toEqual(saved);
    expect(JSON.stringify(result)).not.toContain("server-key");
  });

  it("wraps a thrown mutation error as PlaylistUnavailable", async () => {
    const client = createPlaylistClient({ ...base, mutation: async () => { throw new Error("boom"); } });
    await expect(client.saveFind("user_1", "play_1")).rejects.toBeInstanceOf(PlaylistUnavailable);
  });

  it("connects Apple Music through the action with the server key", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const client = createPlaylistClient({
      ...base,
      action: async (name, args) => {
        calls.push([name, args]);
        return { linked: true };
      },
    });
    await expect(client.connectAppleMusic("user_1", "tok")).resolves.toBeUndefined();
    expect(calls[0]).toEqual(["appleMusicLinks:connect", { serverKey: "server-key", listenerId: "user_1", musicUserToken: "tok" }]);
  });

  it("keeps extra fields on recall matches", async () => {
    const match = {
      label: "1", playId: "p", artist: "A", title: "T", playedAt: 1, trackId: null, matchReason: null,
      artworkUrl: null, previewUrl: null, upcomingShows: [], matchKey: "k", matchedCues: [], matchConfidence: null,
    };
    const client = createPlaylistClient({ ...base, query: async () => ({ status: "ok", matches: [match], extra: 1 }) });
    const result = await client.findSongPlayed({ station: "88nine", from: 0, to: 1 });
    expect(result.matches[0]).toMatchObject({ matchKey: "k" });
  });

  const LEAKY = "ArgumentValidationError: Value: {serverKey:'server-key', musicUserToken:'mut-123'}";

  it("never puts secrets from a thrown mutation error into the message", async () => {
    const client = createPlaylistClient({ ...base, mutation: async () => { throw new Error(LEAKY); } });
    const error = await client.saveFind("user_1", "play_1").catch((e) => e);
    expect(error).toBeInstanceOf(PlaylistUnavailable);
    expect(error.message).not.toContain("server-key");
    expect(error.message).not.toContain("mut-123");
    expect((error.cause as Error).message).toBe(LEAKY);
  });

  it("never puts secrets from a thrown action error into the message", async () => {
    const client = createPlaylistClient({ ...base, action: async () => { throw new Error(LEAKY); } });
    const error = await client.connectAppleMusic("user_1", "mut-123").catch((e) => e);
    expect(error).toBeInstanceOf(PlaylistUnavailable);
    expect(error.message).not.toContain("server-key");
    expect(error.message).not.toContain("mut-123");
  });

  it("does not send a serverKey on the public findSongPlayed query", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = createPlaylistClient({
      ...base,
      query: async (_name, args) => {
        calls.push(args);
        return { status: "no_spins", matches: [] };
      },
    });
    await client.findSongPlayed({ station: "88nine", from: 0, to: 1 });
    expect(calls[0]).not.toHaveProperty("serverKey");
  });

  it("gives connectAppleMusic a longer timeout than the Alexa-turn default", async () => {
    const slowAction = () => new Promise((resolve) => setTimeout(() => resolve({ linked: true }), 50));
    const client = createPlaylistClient({ ...base, action: slowAction, timeoutMs: 5 });
    await expect(client.connectAppleMusic("user_1", "tok")).resolves.toBeUndefined();
  });
});
