import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler, CARD_URI, CHAT_SIGN_IN_TEXT } from "@/lib/mcp";
import { SITE } from "@/lib/card/tokens";
import { chatCardPage, storyCardPage } from "@/lib/card";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost, mcpPostAs, mcpRequest, send } from "./mcp-wire";

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

describe("ChatGPT route (/api/chatgpt/mcp)", () => {
  const route = async () => (await import("@/app/api/chatgpt/mcp/route")).POST;
  const saveFind = (headers: Record<string, string> = {}) =>
    mcpRequest({ method: "tools/call", params: { name: "save_find", arguments: { title: "No ID" } } }, 1, headers);

  it("serves the chat tool list (no membership tools)", async () => {
    const listed = names((await mcpPost(await route(), { method: "tools/list" })).message.result);
    expect(listed).not.toContain("support_radio_milwaukee");
    expect(listed).toHaveLength(21);
  });

  it("has no HTTP 401 gate: a signed-out save reaches the tool and gets the sign-in error", async () => {
    const { status, message } = await send(await route(), saveFind());
    expect(status).toBe(200);
    expect(message.result._meta["mcp/www_authenticate"]).toHaveLength(1);
  });

  it("a junk bearer is treated as signed out, not rejected", async () => {
    const { status, message } = await send(await route(), saveFind({ authorization: "Bearer junk" }));
    expect(status).toBe(200);
    expect(message.result.isError).toBe(true);
  });
});

describe("/.well-known/oauth-protected-resource/api/chatgpt/mcp", () => {
  it("names the chat door as the resource and Clerk as the sign-in server", async () => {
    vi.stubEnv("CLERK_LISTENER_ISSUER", "https://issuer.example");
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/api/chatgpt/mcp/route");
    const res = GET(new Request("https://rc.example/.well-known/oauth-protected-resource/api/chatgpt/mcp"));
    expect(await res.json()).toEqual({
      resource: "https://rc.example/api/chatgpt/mcp",
      authorization_servers: ["https://issuer.example"],
      scopes_supported: ["openid", "profile", "offline_access"],
    });
    vi.unstubAllEnvs();
  });
});

// Speed: ChatGPT reads structuredContent verbatim, so render-only HTML goes in _meta (hidden from the model,
// forwarded to the card). OpenAI plugins reference, "Keep fields concise; the model reads them verbatim."
describe("ChatGPT door: what the model reads", () => {
  it("moves the card's HTML out of structuredContent into _meta", async () => {
    const { message } = await mcpPost(chatHandler(), { method: "tools/call", params: { name: "what_can_you_do", arguments: {} } });
    expect(message.result.structuredContent.cardHtml).toBeUndefined();
    expect(message.result.structuredContent.view).toBe("capabilities");
    expect(typeof message.result._meta.cardHtml).toBe("string");
  });

  it("keeps a sign-in challenge in _meta when there is no card", async () => {
    const { message } = await mcpPost(chatHandler(), { method: "tools/call", params: { name: "list_finds", arguments: {} } });
    expect(message.result._meta["mcp/www_authenticate"]).toHaveLength(1);
  });

  it("drops voice-only instructions from tool descriptions, keeps the trust rules", async () => {
    const tools: { name: string; description: string }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
    for (const tool of tools) expect(tool.description).not.toMatch(/\bSpeaks?\b|three at a time|on devices with a screen/);
    expect(tools.find((t) => t.name === "get_station_story")!.description).toContain("Answer only from this record");
  });

  it("gives every tool a short status line while it runs", async () => {
    const tools: { name: string; _meta: Record<string, unknown> }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
    for (const tool of tools) {
      const status = tool._meta["openai/toolInvocation/invoking"];
      expect(typeof status, tool.name).toBe("string");
      expect((status as string).length, tool.name).toBeLessThanOrEqual(64);
    }
  });

  it("declares the card's allowed sites under ChatGPT's key too, and tells the model the card shows the details", async () => {
    const { message } = await mcpPost(chatHandler(), { method: "resources/read", params: { uri: CARD_URI } });
    const meta = message.result.contents[0]._meta;
    expect(meta.ui.csp.resourceDomains).toContain("https://*.mzstatic.com");
    expect(meta["openai/widgetCSP"].resource_domains).toEqual(meta.ui.csp.resourceDomains);
    expect(meta["openai/widgetCSP"].connect_domains).toEqual(meta.ui.csp.connectDomains);
    expect(meta["openai/widgetDescription"]).toMatch(/card/i);
  });

  it("the chat card page reads the HTML from _meta; the Alexa page is unchanged", () => {
    expect(chatCardPage("k")).toContain("...result._meta");
    expect(storyCardPage("k")).not.toContain("result._meta");
  });
});

describe("ChatGPT door: review fixes", () => {
  it("4. save_find is callable from the card (openai/widgetAccessible); other tools aren't marked", async () => {
    const tools: { name: string; _meta: Record<string, unknown> }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
    expect(tools.find((t) => t.name === "save_find")!._meta["openai/widgetAccessible"]).toBe(true);
    expect(tools.find((t) => t.name === "find_events")!._meta["openai/widgetAccessible"]).toBeUndefined();
  });

  it("6. what's new for me keeps the digest items readable by the model on the chat door", async () => {
    const items = [{ kind: "spins", artistId: "a1", artist: "Nas", total: 2, byStation: [{ station: "88nine", count: 2 }] }];
    const playlist = fakePlaylist({ digest: async () => ({ since: 0, now: 1, items, artists: [{ artistId: "a1", name: "Nas", artworkUrl: null }] }) as never });
    const chat = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, cardHtml: () => "", surface: "chat", defer: () => {} });
    const { message } = await mcpPostAs(chat, { method: "tools/call", params: { name: "whats_new_for_me", arguments: {} } }, "user_1");
    expect(message.result.structuredContent.items).toEqual(items);
    expect(message.result.structuredContent.cardHtml).toBeUndefined();
  });
});

it("card tools tell ChatGPT the card already lists the results; tools without a card don't", async () => {
  const tools: { name: string; description: string }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
  const note = "The card shows these results; reply in one or two sentences and don't list them again.";
  expect(tools.find((t) => t.name === "find_events")!.description.endsWith(note)).toBe(true);
  expect(tools.find((t) => t.name === "delete_my_finds")!.description).not.toContain(note);
});

it("get_station_story: 'what restaurants were discussed' goes to the map view, and the card may call it", async () => {
  const tools: { name: string; description: string; _meta: Record<string, unknown> }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
  const story = tools.find((t) => t.name === "get_station_story")!;
  expect(story.description).toContain('call this with view "places"');
  expect(story.description).toContain("restaurants");
  expect(story._meta["openai/widgetAccessible"]).toBe(true);
});

it("the chat card may load NPR-hosted episode audio (cpa.ds.npr.org) once ChatGPT enforces the allowed-sites list", async () => {
  const { message } = await mcpPost(chatHandler(), { method: "resources/read", params: { uri: CARD_URI } });
  const meta = message.result.contents[0]._meta;
  expect(meta.ui.csp.resourceDomains).toContain("https://cpa.ds.npr.org");
  expect(meta["openai/widgetCSP"].resource_domains).toContain("https://cpa.ds.npr.org");
});
