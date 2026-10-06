import { describe, expect, it } from "vitest";
import { AUTH_TOOLS } from "@/lib/listenerAuth";
import { CAPABILITIES, CAPABILITIES_SPEECH } from "@/lib/capabilities";
import { renderView } from "@/lib/card";
import { buildMcpHandler, CARD_URI } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const handler = () => buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "" });
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("what_can_you_do", () => {
  it("is a card tool that needs no linked account, described for help questions", async () => {
    const { message } = await mcpPost(handler(), { method: "tools/list" });
    const tool = message.result.tools.find((t: { name: string }) => t.name === "what_can_you_do");
    expect(tool._meta.ui.resourceUri).toBe(CARD_URI);
    expect(AUTH_TOOLS as readonly string[]).not.toContain("what_can_you_do");
    for (const phrase of ["what can you do", "help", "how do I use this"]) expect(tool.description).toContain(phrase);
  });

  it("speaks a brief summary that offers more, and shows the capabilities card, without a listener", async () => {
    const { message } = await mcpPost(handler(), { method: "tools/call", params: { name: "what_can_you_do", arguments: {} } });
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toBe(CAPABILITIES_SPEECH);
    expect(words(CAPABILITIES_SPEECH)).toBeLessThanOrEqual(40);
    expect(CAPABILITIES_SPEECH).toContain("tell me more");
    expect(message.result.structuredContent.view).toBe("capabilities");
    // The details for "tell me more" ride along for the model, not the voice.
    expect(JSON.parse(message.result.content[1].text).capabilities).toHaveLength(CAPABILITIES.length);
  });
});

describe("capabilities card", () => {
  const html = renderView({ view: "capabilities" });
  it("has one tile per capability, five or six of them", () => {
    expect(CAPABILITIES.length).toBeGreaterThanOrEqual(5);
    expect(CAPABILITIES.length).toBeLessThanOrEqual(6);
    expect(html.match(/class="tile cap"/g)).toHaveLength(CAPABILITIES.length);
  });
  it("each tile's example is a tappable ask that sends the phrase, escaped", () => {
    for (const { example, title } of CAPABILITIES) {
      const escaped = example.replace(/'/g, "&#39;");
      expect(html).toContain(`class="secondary ask say" data-ask="${escaped}"`);
      expect(html).toContain(title.replace(/&/g, "&amp;"));
    }
    expect(html).toContain('data-ask="What&#39;s new for me"');
    expect(html).not.toContain("data-ask=\"What's");
  });
});

describe("the Stories tile", () => {
  it("names community stories, not just food and music", () => {
    expect(CAPABILITIES.find((c) => c.title === "Stories")?.description).toMatch(/community stories \(Uniquely Milwaukee\)/);
  });
});
