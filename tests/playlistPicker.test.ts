import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import type { PlaylistClient } from "@/lib/playlist";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpModernCall } from "./mcp-wire";

// "Add that song to a playlist" without naming one: ChatGPT shows a native picker (openai/mcp-extensions form
// elicitation over MCP 2026-07-28 multi-round-trip requests), then calls again with the answer.
const MINE = [{ playlistId: "pl_1", name: "tarik jams", itemCount: 2, updatedAt: 1 }];
const ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/a/{w}x{h}bb.jpg";
const SONG = { playId: "play_1", title: "Victory Dance", artist: "Ezra Collective" };
const FORMS = { elicitation: { form: {} }, extensions: { "openai/elicitation": { form: {} } } };

function door(overrides: Partial<PlaylistClient> = {}) {
  const addToPlaylist = vi.fn(async (_l: string, playlistId: string) => ({ status: "ok" as const, alreadyIn: false, title: "Victory Dance", playlistName: playlistId === "pl_1" ? "tarik jams" : "Road Trip" }));
  const createPlaylist = vi.fn(async (_l: string, name: string) => ({ status: "ok" as const, playlistId: "pl_new", name }));
  const playlist = fakePlaylist({
    listPlaylists: async () => MINE,
    getPlaylist: async (_l: string, playlistId: string) => ({ status: "ok" as const, playlistId, name: "tarik jams", items: [{ itemId: "i1", playId: "p", trackId: null, artist: "A", title: "T", stationSlug: "hyfin", addedAt: 1, artworkUrl: ARTWORK, previewUrl: null }] }),
    addToPlaylist, createPlaylist, ...overrides,
  } as Partial<PlaylistClient>);
  const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, cardHtml: () => "", surface: "chat" });
  return { handler, addToPlaylist, createPlaylist };
}
const ask = (handler: ReturnType<typeof door>["handler"], inputResponses?: Record<string, unknown>, caps: Record<string, unknown> = FORMS) =>
  mcpModernCall(handler, { name: "add_to_playlist", arguments: SONG, ...(inputResponses ? { inputResponses } : {}) }, caps, "user_1");

describe("playlist picker", () => {
  it("no playlist named: asks with a form of the listener's playlists (album art, song count) and New playlist", async () => {
    const { handler, addToPlaylist } = door();
    const { message } = await ask(handler);
    expect(message.error).toBeUndefined();
    expect(message.result.resultType).toBe("input_required");
    const form = message.result.inputRequests.playlist.params;
    expect(form.message).toBe('Add "Victory Dance" to which playlist?');
    const [mine, fresh] = form.requestedSchema.properties.playlist.oneOf;
    expect(mine).toMatchObject({ const: "pl_1", title: "tarik jams", description: "2 songs" });
    expect(mine["x-openai-thumbnail"].src).toMatch(/^https:\/\/.*mzstatic/);
    expect(fresh).toMatchObject({ const: "new", title: "New playlist" });
    expect(fresh["x-openai-thumbnail"].src).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(addToPlaylist).not.toHaveBeenCalled();
  });

  it("the answer adds the song to the picked playlist", async () => {
    const { handler, addToPlaylist } = door();
    const { message } = await ask(handler, { playlist: { action: "accept", content: { playlist: "pl_1" } } });
    expect(addToPlaylist).toHaveBeenCalledWith("user_1", "pl_1", "play_1");
    expect(message.result.content[0].text).toContain('Added "Victory Dance" to tarik jams');
  });

  it("New playlist with a name makes it and adds the song", async () => {
    const { handler, createPlaylist, addToPlaylist } = door({ listPlaylists: async () => MINE });
    await ask(handler, { playlist: { action: "accept", content: { playlist: "new", name: "Road Trip" } } });
    expect(createPlaylist).toHaveBeenCalledWith("user_1", "Road Trip");
    expect(addToPlaylist).toHaveBeenCalledWith("user_1", "pl_new", "play_1");
  });

  it("cancel adds nothing", async () => {
    const { handler, addToPlaylist } = door();
    const { message } = await ask(handler, { playlist: { action: "cancel" } });
    expect(message.result.content[0].text).toBe("Okay, I didn't add it to a playlist.");
    expect(addToPlaylist).not.toHaveBeenCalled();
  });

  it("an answer that isn't one of the listener's playlists makes nothing and asks in chat", async () => {
    const { handler, addToPlaylist, createPlaylist } = door();
    const { message } = await ask(handler, { playlist: { action: "accept", content: { playlist: "someone_elses" } } });
    expect(addToPlaylist).not.toHaveBeenCalled();
    expect(createPlaylist).not.toHaveBeenCalled();
    expect(message.result.structuredContent.status).toBe("which_playlist");
  });

  it("without form support (phones), it asks in chat with the playlist names", async () => {
    const { handler } = door();
    const { message } = await ask(handler, undefined, {});
    expect(message.result.resultType).not.toBe("input_required");
    expect(message.result.content[0].text).toContain("Your playlists: tarik jams");
  });

  it("forms without OpenAI's extension get the picker without pictures", async () => {
    const { handler } = door();
    const { message } = await ask(handler, undefined, { elicitation: { form: {} } });
    for (const choice of message.result.inputRequests.playlist.params.requestedSchema.properties.playlist.oneOf) expect(choice).not.toHaveProperty("x-openai-thumbnail");
  });
});
