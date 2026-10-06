import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TermsPage from "@/app/terms/page";
import { CAPABILITIES } from "@/lib/capabilities";
import { buildMcpHandler } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

// The Alexa+ add-on manifest that `npm run alexa:deploy` uploads with Amazon's alexa-ai CLI.
const addon = JSON.parse(readFileSync("alexa/addon-package/addon.json", "utf8"));
const listing = addon.storeListing.locales["en-US"];
const SITE = "https://radio-commons.vercel.app";
// Amazon's addon.json schema requires all six light icon sizes, and the same six for dark if any are given.
const AMAZON_ICON_SIZES = ["72x72", "64x64", "88x88", "126x126", "180x180", "241x241"];

// A PNG's width and height sit at bytes 16-23 of its IHDR chunk.
function pngSize(file: string): string {
  const header = readFileSync(file);
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

// Which tool answers each example phrase Amazon shows listeners.
const PHRASE_TOOLS: Record<string, string> = {
  "What's on Radio Milwaukee right now": "on_air_now",
  "Save that song": "save_find",
  "What was that This Bites episode about frugal dining": "find_station_story",
  "What's new for me": "whats_new_for_me",
};

describe("Alexa+ add-on manifest", () => {
  it("points Alexa+ at this server's MCP endpoint over HTTPS", () => {
    expect(addon.integrations).toEqual([{ type: "MCP", config: { endpoints: { default: { type: "HTTPS", uri: `${SITE}/api/mcp` } } } }]);
    expect(existsSync("src/app/api/mcp/route.ts")).toBe(true);
  });

  it("every example phrase is answered by a tool the server lists", async () => {
    // Amazon's addon.json schema: examplePhrases holds 3-4 items.
    expect(listing.examplePhrases.length).toBeGreaterThanOrEqual(3);
    expect(listing.examplePhrases.length).toBeLessThanOrEqual(4);
    expect(Object.keys(PHRASE_TOOLS).sort()).toEqual([...listing.examplePhrases].sort());
    const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "" });
    const { message } = await mcpPost(handler, { method: "tools/list" });
    const served = message.result.tools.map((tool: { name: string }) => tool.name);
    expect(served).toEqual(expect.arrayContaining(Object.values(PHRASE_TOOLS)));
  });

  it("every example phrase is a capability tile's example, so a tap asks what Amazon tells listeners to say", () => {
    const tileExamples = CAPABILITIES.map(({ example }) => example);
    for (const phrase of listing.examplePhrases) expect(tileExamples).toContain(phrase);
  });

  it("its terms of use page is served by this app", () => {
    expect(listing.privacyAndCompliance.termsOfUseUrl).toBe(`${SITE}/terms`);
    expect(existsSync("src/app/terms/page.tsx")).toBe(true);
    const html = renderToStaticMarkup(TermsPage());
    expect(html).toContain("No real money is charged");
    expect(html).toContain('href="/privacy"');
  });

  it("its privacy page and every image are served by this app at the size the manifest claims", () => {
    expect(listing.privacyAndCompliance.privacyPolicyUrl).toBe(`${SITE}/privacy`);
    expect(existsSync("src/app/privacy/page.tsx")).toBe(true);
    const { icons, carouselImages } = listing.mediaAssets;
    for (const mode of [icons.light, icons.dark]) {
      expect(mode.map((icon: { size: string }) => icon.size).sort()).toEqual([...AMAZON_ICON_SIZES].sort());
    }
    expect(carouselImages.length).toBeGreaterThan(0);
    const images: { size: string; uri: string }[] = [...icons.light, ...icons.dark, ...carouselImages];
    for (const image of images) {
      expect(image.uri.startsWith(`${SITE}/`)).toBe(true);
      const file = `public/${image.uri.slice(SITE.length + 1)}`;
      expect(existsSync(file)).toBe(true);
      expect(pngSize(file)).toBe(image.size);
    }
  });

  it("stays within Amazon's store listing limits", () => {
    expect(listing.name.value.length).toBeLessThanOrEqual(30);
    expect(listing.name.spokenForm.value.trim()).not.toBe("");
    expect(listing.shortDescription.length).toBeLessThanOrEqual(123);
    expect(listing.fullDescription.length).toBeLessThanOrEqual(4000);
    for (const image of listing.mediaAssets.carouselImages) expect(image.altText.length).toBeLessThanOrEqual(250);
  });
});
