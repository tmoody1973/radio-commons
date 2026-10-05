import { describe, expect, it } from "vitest";
import { withMcpAuth } from "mcp-handler";
import { gateAuthTools, RESOURCE_METADATA_PATH, verifyListenerToken } from "@/lib/listenerAuth";
import { buildMcpHandler } from "@/lib/mcp";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import { connectMcp } from "@/lib/sim/mcpClient";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "../fixtures";

const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "<!doctype html><title>card</title>" });
const inProcessFetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;

describe("simulator MCP client", () => {
  it("lists our tools, calls them, and reads the card, like Alexa+ would", async () => {
    const mcp = await connectMcp("http://localhost/api/mcp", { fetch: inProcessFetch });
    expect(mcp.tools.map((t) => t.name).sort()).toEqual(["ask_station_story", "delete_my_finds", "find_events", "find_song_played", "find_station_story", "follow_artist", "get_station_story", "get_track_story", "latest_station_stories", "list_finds", "on_air_now", "recent_songs", "save_find", "search_playlist", "station_artist_shows", "station_picks", "unfollow_artist", "what_can_you_do", "whats_new_for_me"]);
    expect(mcp.tools[0].inputSchema).toMatchObject({ type: "object" });
    const found = await mcp.callTool("find_station_story", { description: "art shop" });
    expect(found.text).toMatch(/^I found one Radio Milwaukee story/);
    expect(found.isError).toBe(false);
    expect(found.structured).toMatchObject({ stationId: "radiomilwaukee" });
    expect(await mcp.readCard()).toContain("<title>card</title>");
    await mcp.close();
  });

  it("sends the listener's access token as a Bearer header when linked", async () => {
    const seen: (string | null)[] = [];
    const spy = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return inProcessFetch(input, init);
    }) as typeof fetch;
    const mcp = await connectMcp("http://localhost/api/mcp", { fetch: spy, bearer: "tok" });
    await mcp.close();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((h) => h === "Bearer tok")).toBe(true);
  });

  it("turns the server's 401 for a Finds tool into a 'link your account' result, not a crashed turn", async () => {
    const gated = withMcpAuth(gateAuthTools(handler), verifyListenerToken, { required: false, resourceMetadataPath: RESOURCE_METADATA_PATH });
    const gatedFetch = ((input: RequestInfo | URL, init?: RequestInit) => gated(new Request(input, init))) as typeof fetch;
    const mcp = await connectMcp("http://localhost/api/mcp", { fetch: gatedFetch });
    const saved = await mcp.callTool("save_find", {});
    expect(saved).toEqual({ text: LINK_ACCOUNT_SPEECH, structured: { error: "account_linking_required" }, isError: true });
    // The connection still works for the anonymous tools afterwards.
    expect((await mcp.callTool("find_station_story", { description: "art shop" })).isError).toBe(false);
    await mcp.close();
  });
});
