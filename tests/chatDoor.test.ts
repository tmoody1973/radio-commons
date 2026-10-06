import { describe, expect, it } from "vitest";
import { buildMcpHandler, CARD_URI, CHAT_SIGN_IN_TEXT } from "@/lib/mcp";
import { SITE } from "@/lib/card/tokens";
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

type Tool = { name: string; _meta?: { ui?: { resourceUri?: string }; securitySchemes?: { type: string }[] } };
const SCHEMES_SIGNED_IN = [{ type: "oauth2", scopes: ["openid", "profile", "offline_access"] }];
const SCHEMES_EITHER = [{ type: "noauth" }, ...SCHEMES_SIGNED_IN];

describe("ChatGPT door: sign-in", () => {
  const tools = async (): Promise<Tool[]> => (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;

  it("declares sign-in required on Finds and follow tools, optional on the rest", async () => {
    const listed = await tools();
    expect(listed.find((t) => t.name === "save_find")!._meta!.securitySchemes).toEqual(SCHEMES_SIGNED_IN);
    expect(listed.find((t) => t.name === "follow_artist")!._meta!.securitySchemes).toEqual(SCHEMES_SIGNED_IN);
    expect(listed.find((t) => t.name === "find_station_story")!._meta!.securitySchemes).toEqual(SCHEMES_EITHER);
    for (const tool of listed) expect(tool._meta?.securitySchemes).toBeDefined();
  });

  it("keeps the card on card tools after adding securitySchemes", async () => {
    const story = (await tools()).find((t) => t.name === "find_station_story")!;
    expect(story._meta!.ui!.resourceUri).toBe(CARD_URI);
  });

  it("answers a signed-out save with a tool error that makes ChatGPT show its sign-in screen", async () => {
    const { status, message } = await mcpPost(chatHandler(), { method: "tools/call", params: { name: "save_find", arguments: { title: "No ID" } } });
    expect(status).toBe(200);
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toBe(CHAT_SIGN_IN_TEXT);
    const [challenge] = message.result._meta["mcp/www_authenticate"];
    expect(challenge).toContain(`resource_metadata="${SITE}/.well-known/oauth-protected-resource/api/chatgpt/mcp"`);
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain(`error_description="${CHAT_SIGN_IN_TEXT}"`);
  });

  it("never mentions Alexa in the sign-in reply", async () => {
    const { message } = await mcpPost(chatHandler(), { method: "tools/call", params: { name: "list_finds", arguments: {} } });
    expect(message.result.content[0].text).not.toMatch(/alexa/i);
  });
});
