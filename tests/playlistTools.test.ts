import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import { PlaylistUnavailable, type PlaylistClient } from "@/lib/playlist";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost, mcpPostAs } from "./mcp-wire";

// Slice 4b on the ChatGPT door: listener playlists over rm-playlist-v2 #69 (not deployed before Oct 23).
const ROAD_TRIP = { playlistId: "pl1", name: "Road Trip", itemCount: 1, updatedAt: 5 };
const ITEM = { itemId: "i1", playId: "p1", trackId: null, artist: "Tank and the Bangas", title: "No ID", stationSlug: "hyfin", addedAt: 5, artworkUrl: null, previewUrl: null };

function door(overrides: Partial<PlaylistClient> = {}, surface: "chat" | "voice" = "chat") {
  const playlist = fakePlaylist({
    listPlaylists: vi.fn(async () => [ROAD_TRIP]),
    getPlaylist: vi.fn(async () => ({ status: "ok" as const, playlistId: "pl1", name: "Road Trip", items: [ITEM] })),
    addToPlaylist: vi.fn(async () => ({ status: "ok" as const, alreadyIn: false, playlistName: "Road Trip", artist: "Tank and the Bangas", title: "No ID", itemCount: 1 })),
    createPlaylist: vi.fn(async (_l: string, name: string) => ({ status: "ok" as const, playlistId: "pl2", name })),
    removeFromPlaylist: vi.fn(async () => ({ status: "ok" as const })),
    deletePlaylist: vi.fn(async () => ({ status: "ok" as const, deletedItems: 1 })),
    ...overrides,
  });
  const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, cardHtml: () => "", surface });
  return { handler, playlist };
}
const call = (name: string, args: Record<string, unknown> = {}) => ({ method: "tools/call", params: { name, arguments: args } });
const as = (handler: ReturnType<typeof door>["handler"], name: string, args: Record<string, unknown> = {}) => mcpPostAs(handler, call(name, args), "u1");
const TOOLS = ["create_playlist", "add_to_playlist", "show_playlists", "remove_from_playlist", "delete_playlist"];

describe("playlist tools", () => {
  it("are on the ChatGPT door only", async () => {
    const names = async (h: ReturnType<typeof door>["handler"]) => (await mcpPost(h, { method: "tools/list" })).message.result.tools.map((t: { name: string }) => t.name);
    expect(await names(door().handler)).toEqual(expect.arrayContaining(TOOLS));
    for (const tool of TOOLS) expect(await names(door({}, "voice").handler)).not.toContain(tool);
  });

  it("ask to sign in when signed out", async () => {
    const { message } = await mcpPost(door().handler, call("show_playlists"));
    expect(message.result._meta["mcp/www_authenticate"]).toHaveLength(1);
  });

  it("create_playlist makes it and shows it; bad names and the limit say so", async () => {
    const { handler, playlist } = door();
    const { message } = await as(handler, "create_playlist", { name: "Road Trip" });
    expect(playlist.createPlaylist).toHaveBeenCalledWith("u1", "Road Trip");
    expect(message.result.structuredContent.view).toBe("playlist");
    expect((await as(door({ createPlaylist: async () => ({ status: "bad_name" as const }) }).handler, "create_playlist", { name: " " })).message.result.content[0].text).toContain("name");
    expect((await as(door({ createPlaylist: async () => ({ status: "limit" as const }) }).handler, "create_playlist", { name: "x" })).message.result.content[0].text).toContain("20");
  });

  it("add_to_playlist by playId into an existing playlist (name matched without case) and shows the playlist", async () => {
    const { handler, playlist } = door();
    const { message } = await as(handler, "add_to_playlist", { playlist: "road trip", playId: "play0001" });
    expect(playlist.addToPlaylist).toHaveBeenCalledWith("u1", "pl1", "play0001");
    expect(playlist.createPlaylist).not.toHaveBeenCalled();
    expect(message.result.content[0].text).toContain('Added "No ID" to Road Trip');
    expect(message.result.structuredContent.view).toBe("playlist");
  });

  it("add_to_playlist creates the playlist when it doesn't exist yet", async () => {
    const { handler, playlist } = door();
    await as(handler, "add_to_playlist", { playlist: "Late Night", playId: "play0001" });
    expect(playlist.createPlaylist).toHaveBeenCalledWith("u1", "Late Night");
    expect(playlist.addToPlaylist).toHaveBeenCalledWith("u1", "pl2", "play0001");
  });

  it("add_to_playlist finds the song by title and artist, or by its number on the last list", async () => {
    const hit = { playId: "p9", artist: "Thao", title: "Phenom", playedAt: 1, artworkUrl: null, previewUrl: null, station: "88nine" as const };
    const byTitle = door({ searchPlaysIndexed: vi.fn(async () => [hit]) });
    await as(byTitle.handler, "add_to_playlist", { playlist: "Road Trip", title: "Phenom", artist: "Thao" });
    expect(byTitle.playlist.addToPlaylist).toHaveBeenCalledWith("u1", "pl1", "p9");
    const byNumber = door({ screenPlay: vi.fn(async () => "p7") });
    await as(byNumber.handler, "add_to_playlist", { playlist: "Road Trip", number: 2 });
    expect(byNumber.playlist.addToPlaylist).toHaveBeenCalledWith("u1", "pl1", "p7");
  });

  it("add_to_playlist with nothing naming a song asks which one", async () => {
    const { handler, playlist } = door();
    const { message } = await as(handler, "add_to_playlist", { playlist: "Road Trip" });
    expect(message.result.content[0].text).toContain("Which song");
    expect(playlist.addToPlaylist).not.toHaveBeenCalled();
  });

  it("show_playlists lists them, or shows one by name, or says it can't find it", async () => {
    const { handler } = door();
    expect((await as(handler, "show_playlists")).message.result.structuredContent.view).toBe("playlists");
    expect((await as(handler, "show_playlists", { playlist: "Road Trip" })).message.result.structuredContent.view).toBe("playlist");
    expect((await as(handler, "show_playlists", { playlist: "Nope" })).message.result.content[0].text).toContain('can\'t find a playlist called "Nope"');
  });

  it("remove_from_playlist by item (the card) or by title, then shows the playlist", async () => {
    const { handler, playlist } = door();
    expect((await as(handler, "remove_from_playlist", { playlist: "pl1", itemId: "i1" })).message.result.structuredContent.view).toBe("playlist");
    expect(playlist.removeFromPlaylist).toHaveBeenCalledWith("u1", "pl1", "i1");
    await as(handler, "remove_from_playlist", { playlist: "Road Trip", title: "no id" });
    expect(playlist.removeFromPlaylist).toHaveBeenLastCalledWith("u1", "pl1", "i1");
  });

  it("delete_playlist asks first, deletes only when confirmed", async () => {
    const { handler, playlist } = door();
    expect((await as(handler, "delete_playlist", { playlist: "Road Trip" })).message.result.content[0].text).toContain("Delete");
    expect(playlist.deletePlaylist).not.toHaveBeenCalled();
    await as(handler, "delete_playlist", { playlist: "Road Trip", confirmed: true });
    expect(playlist.deletePlaylist).toHaveBeenCalledWith("u1", "pl1");
  });

  it("before rm-playlist-v2 #69 is deployed, says playlists aren't available yet", async () => {
    const { handler } = door({ listPlaylists: async () => { throw new PlaylistUnavailable("playlists:list missing"); } });
    const { message } = await as(handler, "show_playlists");
    expect(message.result.content[0].text).toContain("Playlists aren't available yet");
  });
});
