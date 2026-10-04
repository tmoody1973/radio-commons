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
});
const savedSchema = z.discriminatedUnion("status", [savedOkSchema, z.object({ status: z.literal("not_found") })]);
const findSchema = z.object({
  label: z.string(), findId: z.string(), playId: z.string(), trackId: z.string().nullable(), artist: z.string(), title: z.string(),
  stationSlug: z.string(), savedAt: z.number(), appleMusic: z.object({ status: z.string(), reason: z.string().nullable() }),
  artworkUrl: z.string().nullable(), previewUrl: z.string().nullable(),
}).passthrough();
const deletedSchema = z.object({ deletedFinds: z.number(), deletedLink: z.boolean() });
const linkedSchema = z.object({ linked: z.literal(true) });

export type RecallResult = z.infer<typeof recallSchema>;
export type TrackFacts = z.infer<typeof factsSchema>;
export type RecallMatch = z.infer<typeof matchSchema>;
export interface RecentSong { playId: string; artist: string; title: string; playedAt: number; artworkUrl: string | null; previewUrl: string | null }
export type FindRow = z.infer<typeof findSchema>;
export type SavedFind = z.infer<typeof savedSchema>;
export type Station = "hyfin" | "88nine" | "414music" | "rhythmlab";

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
}

type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Every call races a timeout (the Alexa+ round trip must stay under 500 ms) and validates the reply. */
// Connecting Apple Music is a once-per-listener web call, outside any 500 ms Alexa turn.
const CONNECT_TIMEOUT_MS = 5000;

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
