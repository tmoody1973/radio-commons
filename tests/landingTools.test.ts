import { describe, expect, it } from "vitest";
import { LANDING } from "@/lib/landing";
import { buildMcpHandler } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const serverTools = async () => {
  const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "<!doctype html><title>card</title>" });
  const { message } = await mcpPost(handler, { method: "tools/list" }, 2);
  return (message.result.tools as { name: string }[]).map((t) => t.name).sort();
};

describe("the landing page's tool groups", () => {
  it("list every tool the server offers, each exactly once, and nothing that isn't a tool", async () => {
    const listed = LANDING.toolGroups.flatMap((g) => g.tools);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(await serverTools());
  });
  it("every journey step names a real tool", async () => {
    const tools = await serverTools();
    for (const turn of LANDING.journey) expect(tools).toContain(turn.tool);
  });
});
