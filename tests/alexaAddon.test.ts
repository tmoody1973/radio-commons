import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@/lib/capabilities";
import { buildMcpHandler } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

// The Alexa+ add-on manifest that `npm run alexa:deploy` uploads with Amazon's alexa-ai CLI.
const addon = JSON.parse(readFileSync("alexa/addon-package/addon.json", "utf8"));
const listing = addon.storeListing.locales["en-US"];
const SITE = "https://radio-commons.vercel.app";

// Which tool answers each example phrase Amazon shows listeners.
const PHRASE_TOOLS: Record<string, string> = {
  "What was that This Bites episode about frugal dining": "find_station_story",
  "What were the last five songs on 88Nine": "recent_songs",
  "What concerts are coming up in Milwaukee this weekend": "find_events",
  "Save that song": "save_find",
  "What is new from Radio Milwaukee": "latest_station_stories",
  "What's new for me": "whats_new_for_me",
  "Do any 88Nine artists have concerts coming up": "station_artist_shows",
  "What can Radio Milwaukee do": "what_can_you_do",
};

describe("Alexa+ add-on manifest", () => {
  it("points Alexa+ at this server's MCP endpoint over HTTPS", () => {
    expect(addon.integrations).toEqual([{ type: "MCP", config: { endpoints: { default: { type: "HTTPS", uri: `${SITE}/api/mcp` } } } }]);
    expect(existsSync("src/app/api/mcp/route.ts")).toBe(true);
  });

  it("every example phrase is answered by a tool the server lists", async () => {
    expect(Object.keys(PHRASE_TOOLS).sort()).toEqual([...listing.examplePhrases].sort());
    const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "" });
    const { message } = await mcpPost(handler, { method: "tools/list" });
    const served = message.result.tools.map((tool: { name: string }) => tool.name);
    expect(served).toEqual(expect.arrayContaining(Object.values(PHRASE_TOOLS)));
  });

  it("every capability tile's example is one of the example phrases", () => {
    for (const { example } of CAPABILITIES) expect(listing.examplePhrases).toContain(example);
  });

  it("its privacy page and every icon are served by this app", () => {
    expect(listing.privacyAndCompliance.privacyPolicyUrl).toBe(`${SITE}/privacy`);
    expect(existsSync("src/app/privacy/page.tsx")).toBe(true);
    for (const icon of listing.mediaAssets.icons.light) {
      expect(icon.uri.startsWith(`${SITE}/`)).toBe(true);
      expect(existsSync(`public/${icon.uri.slice(SITE.length + 1)}`)).toBe(true);
    }
  });
});
