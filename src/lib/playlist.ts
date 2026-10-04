import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";

// The playlist deployment's public functions (rm-playlist convex/alexa.ts, finds.ts, appleMusicLinks.ts).
// .passthrough() keeps extra fields from breaking the client.
const showSchema = z.object({
  venue: z.string(), city: z.string(), metro: z.string(), startsAtMs: z.number(), ticketUrl: z.string().nullable(),
}).passthrough();
const matchSchema = z.object({
  label: z.string(), playId: z.string(), artist: z.string(), title: z.string(), playedAt: z.number(),
  trackId: z.string().nullable(), matchReason: z.string().nullable(), artworkUrl: z.string().nullable(),
  previewUrl: z.string().nullable(), upcomingShows: z.array(showSchema),
}).passthrough();
const recallSchema = z.object({
  status: z.enum(["ok", "options", "cues_unchecked", "no_spins", "unknown_station"]),
  matches: z.array(matchSchema),
}).passthrough();
const publicPlaySchema = z.object({
  _id: z.string(), artist: z.string(), title: z.string(), playedAt: z.number(),
  artworkUrl: z.string().nullable(), previewUrl: z.string().nullable(),
}).passthrough();
const factsSchema = z.object({ status: z.enum(["ok", "not_found"]) }).passthrough();
const savedOkSchema = z.object({
  status: z.literal("ok"), findId: z.string(), appleMusic: z.enum(["not_linked", "pending"]),
  artist: z.string(), title: z.string(), alreadySaved: z.boolean(),
  artistId: z.string().nullable(), artistName: z.string(), firstFollow: z.boolean(),
  nextShow: z.object({ venue: z.string(), city: z.string(), startsAtMs: z.number() }).nullable(),
  story: z.object({ storyId: z.string(), title: z.string(), show: z.string() }).nullable(),
  recentlySaved: z.boolean(),
});
const savedSchema = z.discriminatedUnion("status", [savedOkSchema, z.object({ status: z.literal("not_found") })]);
const findSchema = z.object({
  label: z.string(), findId: z.string(), playId: z.string(), trackId: z.string().nullable(), artist: z.string(), title: z.string(),
  stationSlug: z.string(), savedAt: z.number(), appleMusic: z.object({ status: z.string(), reason: z.string().nullable() }),
  artworkUrl: z.string().nullable(), previewUrl: z.string().nullable(),
}).passthrough();
const deletedSchema = z.object({ deletedFinds: z.number(), deletedLink: z.boolean(), deletedFollows: z.number() });
const stationSchema = z.enum(["hyfin", "88nine", "414music", "rhythmlab"]);
const indexedPlaySchema = publicPlaySchema.extend({ stationSlug: stationSchema });
const followedSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), artistId: z.string(), artistName: z.string(), firstFollow: z.boolean() }),
  z.object({ status: z.literal("unknown_artist") }),
]);
const unfollowedSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), artistName: z.string() }),
  z.object({ status: z.literal("not_following") }),
  z.object({ status: z.literal("unknown_artist") }),
]);
const digestItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("show"), artist: z.string(), artistId: z.string(), venue: z.string(), city: z.string(), startsAtMs: z.number() }),
  z.object({
    kind: z.literal("spins"), artist: z.string(), artistId: z.string(), total: z.number(),
    byStation: z.array(z.object({ station: z.string(), count: z.number() })),
  }),
  z.object({
    kind: z.literal("story"), artist: z.string(), artistId: z.string(), storyId: z.string(), title: z.string(), show: z.string(), publishedAt: z.number(),
  }),
  z.object({ kind: z.literal("apple"), added: z.number(), expired: z.number() }),
]);
const digestSchema = z.object({
  since: z.number(), now: z.number(), items: z.array(digestItemSchema),
  artists: z.array(z.object({ artistId: z.string(), name: z.string(), artworkUrl: z.string().nullable() })),
});
const nullSchema = z.null();
const screenPlaySchema = z.string().nullable();
const linkedSchema = z.object({ linked: z.literal(true) });

export type RecallResult = z.infer<typeof recallSchema>;
export type TrackFacts = z.infer<typeof factsSchema>;
export type RecallMatch = z.infer<typeof matchSchema>;
export interface RecentSong { playId: string; artist: string; title: string; playedAt: number; artworkUrl: string | null; previewUrl: string | null }
export type FindRow = z.infer<typeof findSchema>;
export type SavedFind = z.infer<typeof savedSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Digest = z.infer<typeof digestSchema>;
export type DigestItem = Digest["items"][number];
export type FollowResult = z.infer<typeof followedSchema>;
export type UnfollowResult = z.infer<typeof unfollowedSchema>;

export class PlaylistUnavailable extends Error {}

export interface PlaylistClient {
  findSongPlayed(args: { station: Station; from: number; to: number; cues?: string[]; beforePlayId?: string; afterPlayId?: string }): Promise<RecallResult>;
  getTrackFacts(args: { trackId?: string; playId?: string }): Promise<TrackFacts>;
  recentSongs(station: Station, count: number): Promise<RecentSong[]>;
  searchPlays(station: Station, query: string, limit: number): Promise<RecentSong[]>;
  saveFind(listenerId: string, playId: string): Promise<SavedFind>;
  listFinds(listenerId: string, limit?: number): Promise<FindRow[]>;
  deleteFinds(listenerId: string): Promise<z.infer<typeof deletedSchema>>;
  connectAppleMusic(listenerId: string, musicUserToken: string): Promise<void>;
  rememberScreen(listenerId: string, playIds: string[]): Promise<void>;
  screenPlay(listenerId: string, number: number): Promise<string | null>;
  follow(listenerId: string, target: { artist?: string; playId?: string }): Promise<FollowResult>;
  unfollow(listenerId: string, artist: string): Promise<UnfollowResult>;
  digest(listenerId: string): Promise<Digest>;
  markDigestSeen(listenerId: string, seenAt: number): Promise<void>;
  /** Index-backed search across one station or all four; Task B2 switches the tools from searchPlays to this. */
  searchPlaysIndexed(station: Station | undefined, query: string): Promise<(RecentSong & { station: Station })[]>;
}

type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Every call races a timeout (the Alexa+ round trip must stay under 500 ms) and validates the reply. */
// Connecting Apple Music is a once-per-listener web call, outside any 500 ms Alexa turn.
const CONNECT_TIMEOUT_MS = 5000;
// The digest reads several tables per followed artist, so it gets more room than a plain lookup.
const DIGEST_TIMEOUT_MS = 1500;

const toRecentSongs = (plays: z.infer<typeof publicPlaySchema>[]): RecentSong[] =>
  plays.map(({ _id, artist, title, playedAt, artworkUrl, previewUrl }) => ({ playId: _id, artist, title, playedAt, artworkUrl, previewUrl }));

export function createPlaylistClient({ query, mutation, action, serverKey, timeoutMs = 350 }: {
  query: Call; mutation: Call; action: Call; serverKey: string; timeoutMs?: number;
}): PlaylistClient {
  async function call<T>(fn: Call, name: string, args: Record<string, unknown>, schema: z.ZodType<T>, limitMs = timeoutMs): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fn(name, args),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new PlaylistUnavailable(`${name} timed out`)), limitMs);
        }),
      ]);
      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new PlaylistUnavailable(`${name} returned an unexpected shape`);
      return parsed.data;
    } catch (error) {
      throw error instanceof PlaylistUnavailable ? error : new PlaylistUnavailable(`${name} failed`, { cause: error }); // Convex error text can echo args (secrets), so keep it out of the message
    } finally {
      clearTimeout(timer);
    }
  }
  const keyed = (args: Record<string, unknown>) => ({ serverKey, ...args });
  return {
    findSongPlayed: (args) => call(query, "alexa:findSongPlayed", args, recallSchema),
    getTrackFacts: (args) => call(query, "alexa:getTrackFacts", args, factsSchema),
    // The website widget's search: artist or title substring, newest first; depth grows with limit.
    searchPlays: async (station, text, limit) => toRecentSongs(await call(query, "plays:searchByStation", { stationSlug: station, q: text, limit }, z.array(publicPlaySchema))),
    // The same newest-first public playlist the website widget shows (station IDs and promos already removed).
    recentSongs: async (station, count) =>
      toRecentSongs(await call(query, "plays:recentByStation", { stationSlug: station, limit: count }, z.array(publicPlaySchema))),
    saveFind: (listenerId, playId) => call(mutation, "finds:save", keyed({ listenerId, playId }), savedSchema),
    listFinds: (listenerId, limit) => call(query, "finds:list", keyed(limit === undefined ? { listenerId } : { listenerId, limit }), z.array(findSchema)),
    deleteFinds: (listenerId) => call(mutation, "finds:deleteAllForListener", keyed({ listenerId }), deletedSchema),
    rememberScreen: async (listenerId, playIds) => {
      await call(mutation, "memory:rememberScreen", keyed({ listenerId, playIds }), nullSchema);
    },
    screenPlay: (listenerId, number) => call(query, "memory:screenPlay", keyed({ listenerId, number }), screenPlaySchema),
    follow: (listenerId, target) => call(mutation, "follows:follow", keyed({ listenerId, ...target }), followedSchema),
    unfollow: (listenerId, artist) => call(mutation, "follows:unfollow", keyed({ listenerId, artist }), unfollowedSchema),
    digest: (listenerId) => call(query, "digest:forListener", keyed({ listenerId }), digestSchema, DIGEST_TIMEOUT_MS),
    markDigestSeen: async (listenerId, seenAt) => {
      await call(mutation, "digest:markSeen", keyed({ listenerId, seenAt }), nullSchema);
    },
    searchPlaysIndexed: async (station, text) => {
      const plays = await call(query, "alexa:searchPlays", station ? { station, query: text } : { query: text }, z.array(indexedPlaySchema));
      return plays.map(({ stationSlug, ...play }) => ({ ...toRecentSongs([play])[0], station: stationSlug }));
    },
    async connectAppleMusic(listenerId, musicUserToken) {
      await call(action, "appleMusicLinks:connect", keyed({ listenerId, musicUserToken }), linkedSchema, CONNECT_TIMEOUT_MS);
    },
  };
}

export function playlistFromEnv(): PlaylistClient {
  const url = process.env.PLAYLIST_CONVEX_URL;
  const serverKey = process.env.RADIO_COMMONS_SERVER_KEY;
  if (!url || !serverKey) throw new Error("PLAYLIST_CONVEX_URL and RADIO_COMMONS_SERVER_KEY must be set");
  const convex = new ConvexHttpClient(url);
  return createPlaylistClient({
    query: (name, args) => convex.query(makeFunctionReference<"query">(name), args),
    mutation: (name, args) => convex.mutation(makeFunctionReference<"mutation">(name), args),
    action: (name, args) => convex.action(makeFunctionReference<"action">(name), args),
    serverKey,
  });
}
