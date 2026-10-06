import { describe, expect, it } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost, mcpPostAs } from "./mcp-wire";

const chatHandler = () =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "<!doctype html><title>card</title>", surface: "chat" });
const names = (result: { tools: { name: string }[] }) => result.tools.map((t) => t.name);
const MEMBERSHIP = ["support_radio_milwaukee", "my_membership", "cancel_membership"];

describe("ChatGPT door: tool list", () => {
  it("keeps the 21 station tools and drops the 3 membership tools (OpenAI plugin commerce rules)", async () => {
    const listed = names((await mcpPost(chatHandler(), { method: "tools/list" })).message.result);
    expect(listed).toHaveLength(21);
    for (const tool of MEMBERSHIP) expect(listed).not.toContain(tool);
    expect(listed).toContain("save_find");
  });

  it("drops them for a signed-in listener too", async () => {
    const listed = names((await mcpPostAs(chatHandler(), { method: "tools/list" }, "user_1")).message.result);
    for (const tool of MEMBERSHIP) expect(listed).not.toContain(tool);
  });
});
