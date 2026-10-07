import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { storyCardPage } from "@/lib/card";
import { buildMcpHandler } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { INITIALIZE, mcpPost } from "./mcp-wire";

// The Alexa+ door must not change while the ChatGPT door is built (spec: "What stays exactly the same for Alexa+").
// If this snapshot fails, a ChatGPT change leaked into Alexa+: fix the change, never update the snapshot.
const alexa = () =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "<!doctype html><title>card</title>" });

describe("Alexa+ door (/api/mcp) is frozen", () => {
  it("initialize result", async () => {
    expect((await mcpPost(alexa(), INITIALIZE)).message.result).toMatchSnapshot();
  });
  it("tools/list, every field", async () => {
    expect((await mcpPost(alexa(), { method: "tools/list" })).message.result).toMatchSnapshot();
  });
  it("resources/list", async () => {
    expect((await mcpPost(alexa(), { method: "resources/list" })).message.result).toMatchSnapshot();
  });
  it("resources/read of the card (its _meta, CSP included)", async () => {
    expect((await mcpPost(alexa(), { method: "resources/read", params: { uri: "ui://radio-commons/story-card.html" } })).message.result).toMatchSnapshot();
  });
  it("the real card page Alexa+ renders, byte for byte (fingerprint)", () => {
    expect(createHash("sha256").update(storyCardPage("test-key")).digest("hex")).toMatchSnapshot();
  });
  it("a signed-out save_find reply", async () => {
    expect((await mcpPost(alexa(), { method: "tools/call", params: { name: "save_find", arguments: { title: "No ID" } } })).message.result).toMatchSnapshot();
  });
});
