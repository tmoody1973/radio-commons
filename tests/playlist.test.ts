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
    const saved = { status: "ok", findId: "find_1", appleMusic: "pending", artist: "A", title: "T", alreadySaved: false,
      artistId: "a1", artistName: "A", firstFollow: true, nextShow: { venue: "V", city: "C", startsAtMs: 5 }, story: null, recentlySaved: false };
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

  describe("listener memory calls", () => {
    const record = () => {
      const calls: Array<[string, Record<string, unknown>]> = [];
      const fn = (reply: unknown) => async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return reply; };
      return { calls, fn };
    };

    it("rememberScreen and markDigestSeen send the server key", async () => {
      const { calls, fn } = record();
      const client = createPlaylistClient({ ...base, mutation: fn(null) });
      await client.rememberScreen("u", ["p1", "p2"]);
      await client.markDigestSeen("u", 99);
      expect(calls).toEqual([
        ["memory:rememberScreen", { serverKey: "server-key", listenerId: "u", playIds: ["p1", "p2"] }],
        ["digest:markSeen", { serverKey: "server-key", listenerId: "u", seenAt: 99 }],
      ]);
    });

    it("screenPlay returns the play id or null", async () => {
      const { calls, fn } = record();
      const client = createPlaylistClient({ ...base, query: fn("p2") });
      await expect(client.screenPlay("u", 2)).resolves.toBe("p2");
      expect(calls[0]).toEqual(["memory:screenPlay", { serverKey: "server-key", listenerId: "u", number: 2 }]);
      await expect(createPlaylistClient({ ...base, query: fn(null) }).screenPlay("u", 9)).resolves.toBeNull();
    });

    it("follow and unfollow call the mutations and parse every union branch", async () => {
      const { calls, fn } = record();
      const ok = { status: "ok", artistId: "a1", artistName: "Ezra", firstFollow: true };
      await expect(createPlaylistClient({ ...base, mutation: fn(ok) }).follow("u", { artist: "Ezra" })).resolves.toEqual(ok);
      await expect(createPlaylistClient({ ...base, mutation: fn({ status: "unknown_artist" }) }).follow("u", { playId: "p" })).resolves.toEqual({ status: "unknown_artist" });
      for (const reply of [{ status: "ok", artistName: "Ezra" }, { status: "not_following" }, { status: "unknown_artist" }]) {
        await expect(createPlaylistClient({ ...base, mutation: fn(reply) }).unfollow("u", "Ezra")).resolves.toEqual(reply);
      }
      expect(calls[0]).toEqual(["follows:follow", { serverKey: "server-key", listenerId: "u", artist: "Ezra" }]);
      expect(calls[1]).toEqual(["follows:follow", { serverKey: "server-key", listenerId: "u", playId: "p" }]);
      expect(calls[2]).toEqual(["follows:unfollow", { serverKey: "server-key", listenerId: "u", artist: "Ezra" }]);
    });

    const digest = {
      since: 1, now: 2,
      items: [
        { kind: "show", artist: "A", artistId: "a1", venue: "V", city: "C", startsAtMs: 5 },
        { kind: "spins", artist: "A", artistId: "a1", total: 3, byStation: [{ station: "hyfin", count: 3 }] },
        { kind: "story", artist: "A", artistId: "a1", storyId: "s", title: "T", show: "S", publishedAt: 4 },
        { kind: "apple", added: 1, expired: 0 },
      ],
      artists: [{ artistId: "a1", name: "A", artworkUrl: null }],
    };

    it("digest allows a reply slower than the default 350 ms limit and sends the server key", async () => {
      const calls: Record<string, unknown>[] = [];
      const slow = (_name: string, args: Record<string, unknown>) => new Promise((resolve) => { calls.push(args); setTimeout(() => resolve(digest), 600); });
      const client = createPlaylistClient({ ...base, query: slow });
      await expect(client.digest("u")).resolves.toEqual(digest);
      expect(calls[0]).toEqual({ serverKey: "server-key", listenerId: "u" });
    });

    it("digest throws PlaylistUnavailable on a malformed reply", async () => {
      const client = createPlaylistClient({ ...base, query: async () => ({ since: 1, now: 2, items: [{ kind: "bogus" }], artists: [] }) });
      await expect(client.digest("u")).rejects.toBeInstanceOf(PlaylistUnavailable);
    });

    it("searchPlaysIndexed maps _id and stationSlug, sends no serverKey, and omits an absent station", async () => {
      const { calls, fn } = record();
      const row = { _id: "p1", artist: "A", title: "T", playedAt: 1, artworkUrl: null, previewUrl: null, stationSlug: "hyfin" };
      const client = createPlaylistClient({ ...base, query: fn([row]) });
      await expect(client.searchPlaysIndexed(undefined, "ezra")).resolves.toEqual([
        { playId: "p1", artist: "A", title: "T", playedAt: 1, artworkUrl: null, previewUrl: null, station: "hyfin" },
      ]);
      await client.searchPlaysIndexed("88nine", "ezra");
      expect(calls[0]).toEqual(["alexa:searchPlays", { query: "ezra" }]);
      expect(calls[1]).toEqual(["alexa:searchPlays", { station: "88nine", query: "ezra" }]);
    });

    it("searchPlaysIndexed allows a 1 s uncached search but gives up at 2.5 s", async () => {
      const row = { _id: "p1", artist: "A", title: "T", playedAt: 1, artworkUrl: null, previewUrl: null, stationSlug: "hyfin" };
      const after = (ms: number) => () => new Promise((resolve) => setTimeout(() => resolve([row]), ms));
      await expect(createPlaylistClient({ ...base, query: after(1000) }).searchPlaysIndexed(undefined, "x")).resolves.toHaveLength(1);
      await expect(createPlaylistClient({ ...base, query: after(2500) }).searchPlaysIndexed(undefined, "x")).rejects.toBeInstanceOf(PlaylistUnavailable);
    });

    it("searchPlaysIndexed rejects an unknown station slug", async () => {
      const row = { _id: "p1", artist: "A", title: "T", playedAt: 1, artworkUrl: null, previewUrl: null, stationSlug: "nope" };
      const client = createPlaylistClient({ ...base, query: async () => [row] });
      await expect(client.searchPlaysIndexed(undefined, "x")).rejects.toBeInstanceOf(PlaylistUnavailable);
    });

    it("stationArtistShows sends the station (or none), takes no server key, and tolerates extra or missing optional fields", async () => {
      const { calls, fn } = record();
      const show = { artistName: "Tank and the Bangas", playCount: 12, venueName: "Majestic Theatre", city: "Madison", startsAtMs: 5, dateOnly: false, ticketUrl: null, imageUrl: null, role: "headliner", extra: 1 };
      const client = createPlaylistClient({ ...base, query: fn({ refreshedAt: null, shows: [show], cachedBy: "x" }) });
      await expect(client.stationArtistShows("88nine")).resolves.toMatchObject({ refreshedAt: null, shows: [{ artistName: "Tank and the Bangas", city: "Madison" }] });
      await client.stationArtistShows();
      expect(calls).toEqual([["alexa:stationArtistShows", { station: "88nine" }], ["alexa:stationArtistShows", {}]]);
    });

    it("stationArtistShows throws PlaylistUnavailable on a malformed reply", async () => {
      const client = createPlaylistClient({ ...base, query: async () => ({ shows: [{ artistName: "A" }] }) });
      await expect(client.stationArtistShows()).rejects.toBeInstanceOf(PlaylistUnavailable);
    });

    it("deleteFinds reports deletedFollows", async () => {
      const reply = { deletedFinds: 1, deletedLink: false, deletedFollows: 2 };
      await expect(createPlaylistClient({ ...base, mutation: async () => reply }).deleteFinds("u")).resolves.toEqual(reply);
    });
  });
});
