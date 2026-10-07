import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { CardView } from "@/lib/card";
import { listenerIdFrom } from "@/lib/listenerAuth";
import type { PlaylistClient, PlaylistSummary } from "@/lib/playlist";
import { bestRecentMatch } from "@/lib/songMatch";

/**
 * Listener playlists on the ChatGPT door (slice 4b), over rm-playlist-v2's playlists:* functions (PR #69, not deployed
 * before Oct 23). Until then every call is PlaylistUnavailable, and the tools say playlists aren't available yet.
 */
type ToolResult = { [key: string]: unknown; content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
type Server = Parameters<typeof registerAppTool>[0];
export interface PlaylistToolDeps {
  playlist: () => PlaylistClient;
  card: (view: CardView, extra?: Record<string, unknown>) => Record<string, unknown>;
  signInRequired: () => ToolResult;
  timed: (tool: string, run: () => Promise<ToolResult>, fallback: () => ToolResult) => Promise<ToolResult>;
  cardMeta: { _meta: { ui: { resourceUri: string } } };
}

const text = (t: string) => [{ type: "text" as const, text: t }];
const STATION = z.enum(["88nine", "hyfin", "rhythmlab", "414music"]); // the music stations, as in mcp.ts
const PLAY_ID = z.string().regex(/^[a-z0-9_]{6,64}$/);
const UNAVAILABLE = "Playlists aren't available yet. They're coming soon to Radio Milwaukee.";
const unavailable = (): ToolResult => ({ content: text(UNAVAILABLE), isError: true });

/** By id (the card), then exact name ignoring case, then a single partial match. */
function findPlaylist(all: PlaylistSummary[], wanted: string): PlaylistSummary | undefined {
  const name = wanted.trim().toLowerCase();
  const partial = all.filter((p) => p.name.toLowerCase().includes(name));
  return all.find((p) => p.playlistId === wanted) ?? all.find((p) => p.name.toLowerCase() === name) ?? (partial.length === 1 ? partial[0] : undefined);
}

export function registerPlaylistTools(server: Server, deps: PlaylistToolDeps) {
  const { playlist, card, signInRequired, timed, cardMeta } = deps;
  const listener = (context: { http?: Parameters<typeof listenerIdFrom>[0] }) => listenerIdFrom(context.http ?? {});
  const notFound = (wanted: string, all: PlaylistSummary[]): ToolResult =>
    ({ content: text(`I can't find a playlist called "${wanted}".${all.length ? ` Your playlists: ${all.map((p) => p.name).join(", ")}.` : ""}`), structuredContent: { status: "not_found" } });

  // One playlist as a card; the model gets item ids and titles so "remove the Thao song" works.
  async function showPlaylist(listenerId: string, playlistId: string, lead?: string): Promise<ToolResult> {
    const result = await playlist().getPlaylist(listenerId, playlistId);
    if (result.status !== "ok") return { content: text("I can't find that playlist."), structuredContent: { status: "not_found" } };
    const songs = result.items.map(({ itemId, title, artist }) => ({ itemId, title, artist }));
    return {
      content: text(`${lead ? `${lead} ` : ""}${result.name} has ${songs.length} song${songs.length === 1 ? "" : "s"}.`),
      structuredContent: card({ view: "playlist", playlistId: result.playlistId, name: result.name, items: result.items }, { playlist: { playlistId: result.playlistId, name: result.name, songs } }),
    };
  }

  // The song the listener means: an id from a song list, a number on the last list, or a title and artist.
  async function resolvePlay(listenerId: string, a: { playId?: string; number?: number; title?: string; artist?: string; station?: z.infer<typeof STATION> }) {
    if (a.playId) return a.playId;
    if (a.number !== undefined) {
      const onScreen = await playlist().screenPlay(listenerId, a.number);
      if (onScreen) return onScreen;
    }
    if (a.title || a.artist) return bestRecentMatch(await playlist().searchPlaysIndexed(a.station, (a.title ?? a.artist)!), { title: a.title, artist: a.artist });
    return null;
  }

  registerAppTool(server, "create_playlist", {
    title: "Make a playlist",
    description: "Make a new playlist of Radio Milwaukee songs for the listener, e.g. 'make a playlist called Road Trip'. To add songs use add_to_playlist (it also makes the playlist if it doesn't exist).",
    inputSchema: z.object({ name: z.string().min(1).max(100) }),
    ...cardMeta,
  }, async ({ name }, context) => timed("create_playlist", async () => {
    const listenerId = listener(context);
    if (!listenerId) return signInRequired();
    const made = await playlist().createPlaylist(listenerId, name);
    if (made.status === "bad_name") return { content: text("A playlist name needs 1 to 60 characters.") };
    if (made.status === "limit") return { content: text("You already have 20 playlists, the most there can be. Delete one to make room.") };
    return { content: text(`Made your playlist "${made.name}". Add songs to it any time.`), structuredContent: card({ view: "playlist", playlistId: made.playlistId, name: made.name, items: [] }, { playlist: { playlistId: made.playlistId, name: made.name, songs: [] } }) };
  }, unavailable));

  registerAppTool(server, "add_to_playlist", {
    title: "Add a song to a playlist",
    description: "Add a song Radio Milwaukee played to one of the listener's playlists, by the playlist's name; makes the playlist if it doesn't exist yet. Identify the song like save_find: playId from a song list if you have it, or number for 'number 3', and always also the title and artist (and station if known).",
    inputSchema: z.object({ playlist: z.string().min(1).max(100), playId: PLAY_ID.optional(), number: z.number().int().min(1).max(12).optional(), title: z.string().max(200).optional(), artist: z.string().max(200).optional(), station: STATION.optional() }),
    ...cardMeta,
  }, async ({ playlist: wanted, ...song }, context) => timed("add_to_playlist", async () => {
    const listenerId = listener(context);
    if (!listenerId) return signInRequired();
    const playId = await resolvePlay(listenerId, song);
    if (!playId) return { content: text(`Which song should I add to ${wanted}?`), structuredContent: { status: "which_song" } };
    let target = findPlaylist(await playlist().listPlaylists(listenerId), wanted);
    if (!target) {
      const made = await playlist().createPlaylist(listenerId, wanted);
      if (made.status !== "ok") return { content: text(made.status === "limit" ? "You already have 20 playlists. Delete one to make room." : "A playlist name needs 1 to 60 characters.") };
      target = { playlistId: made.playlistId, name: made.name, itemCount: 0, updatedAt: 0 };
    }
    const added = await playlist().addToPlaylist(listenerId, target.playlistId, playId);
    if (added.status === "full") return { content: text(`${target.name} is full (100 songs). Remove one to add another.`) };
    if (added.status !== "ok") return { content: text("I couldn't find that song on Radio Milwaukee's playlists."), structuredContent: { status: "not_found" } };
    return showPlaylist(listenerId, target.playlistId, added.alreadyIn ? `"${added.title}" is already in ${added.playlistName}.` : `Added "${added.title}" to ${added.playlistName}.`);
  }, unavailable));

  registerAppTool(server, "show_playlists", {
    title: "Show my playlists",
    description: "Show the listener's playlists, or one playlist's songs when they name it ('show my Road Trip playlist').",
    inputSchema: z.object({ playlist: z.string().min(1).max(100).optional() }),
    annotations: { readOnlyHint: true },
    ...cardMeta,
  }, async ({ playlist: wanted }, context) => timed("show_playlists", async () => {
    const listenerId = listener(context);
    if (!listenerId) return signInRequired();
    const all = await playlist().listPlaylists(listenerId);
    if (wanted) {
      const target = findPlaylist(all, wanted);
      return target ? showPlaylist(listenerId, target.playlistId) : notFound(wanted, all);
    }
    const summary = all.length ? `Your playlists: ${all.map((p) => `${p.name} (${p.itemCount})`).join(", ")}.` : "You don't have any playlists yet.";
    return { content: text(summary), structuredContent: card({ view: "playlists", playlists: all }, { playlists: all }) };
  }, unavailable));

  registerAppTool(server, "remove_from_playlist", {
    title: "Remove a song from a playlist",
    description: "Remove a song from one of the listener's playlists, by the playlist's name and the song's title (or itemId from show_playlists).",
    inputSchema: z.object({ playlist: z.string().min(1).max(100), itemId: z.string().max(64).optional(), title: z.string().max(200).optional() }),
    ...cardMeta,
  }, async ({ playlist: wanted, itemId, title }, context) => timed("remove_from_playlist", async () => {
    const listenerId = listener(context);
    if (!listenerId) return signInRequired();
    const all = await playlist().listPlaylists(listenerId);
    const target = findPlaylist(all, wanted);
    if (!target) return notFound(wanted, all);
    let item = itemId;
    if (!item && title) {
      const shown = await playlist().getPlaylist(listenerId, target.playlistId);
      item = shown.status === "ok" ? shown.items.find((i) => i.title.toLowerCase().includes(title.trim().toLowerCase()))?.itemId : undefined;
    }
    if (!item) return { content: text(`Which song should I remove from ${target.name}?`), structuredContent: { status: "which_song" } };
    const removed = await playlist().removeFromPlaylist(listenerId, target.playlistId, item);
    return removed.status === "ok" ? showPlaylist(listenerId, target.playlistId, "Removed.") : { content: text(`That song isn't in ${target.name}.`) };
  }, unavailable));

  registerAppTool(server, "delete_playlist", {
    title: "Delete a playlist",
    description: "Delete one of the listener's playlists. First call it without confirmed: it returns the question to ask. Only after the listener clearly says yes, call it again with confirmed true.",
    inputSchema: z.object({ playlist: z.string().min(1).max(100), confirmed: z.boolean().optional() }),
    annotations: { destructiveHint: true, idempotentHint: true },
    ...cardMeta,
  }, async ({ playlist: wanted, confirmed }, context) => timed("delete_playlist", async () => {
    const listenerId = listener(context);
    if (!listenerId) return signInRequired();
    const all = await playlist().listPlaylists(listenerId);
    const target = findPlaylist(all, wanted);
    if (!target) return notFound(wanted, all);
    if (confirmed !== true) return { content: text(`Delete your playlist "${target.name}" and its ${target.itemCount} song${target.itemCount === 1 ? "" : "s"}? This can't be undone.`), structuredContent: { needsConfirmation: true } };
    await playlist().deletePlaylist(listenerId, target.playlistId);
    return { content: text(`Deleted your playlist "${target.name}".`), structuredContent: { deleted: true } };
  }, unavailable));
}
