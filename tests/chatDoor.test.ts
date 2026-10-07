import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler, CARD_URI, CHAT_SIGN_IN_TEXT } from "@/lib/mcp";
import { SITE } from "@/lib/card/tokens";
import { chatCardPage, storyCardPage } from "@/lib/card";
import { fakeBackstory, fakeFieldGuide, fakePlaylist, STORY } from "./fixtures";
import { mcpPost, mcpPostAs, mcpRequest, send } from "./mcp-wire";

const chatHandler = () =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "<!doctype html><title>card</title>", surface: "chat" });
const names = (result: { tools: { name: string }[] }) => result.tools.map((t) => t.name);
const MEMBERSHIP = ["support_radio_milwaukee", "my_membership", "cancel_membership"];

describe("ChatGPT door: tool list", () => {
  it("keeps the 21 station tools plus send_station_request, station_home and 5 playlist tools, and drops the 3 membership tools (OpenAI plugin commerce rules)", async () => {
    const listed = names((await mcpPost(chatHandler(), { method: "tools/list" })).message.result);
    expect(listed).toHaveLength(28);
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
    expect(listed).toHaveLength(28);
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

// ChatGPT answered "what restaurants were discussed?" from the story record it already had, so no map. On the chat door a
// story result keeps its summary but sends a place count and a pointer instead of the names; the map view keeps them.
describe("ChatGPT door: places come with the map", () => {
  const story = { ...STORY, storyId: "s2", places: [STORY.places[0], { ...STORY.places[0], name: "Bread House", lat: 43.02, lng: -88.02 }] };
  const handler = () => buildMcpHandler({ backstory: () => fakeBackstory({ getStory: async () => story }), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "", surface: "chat" });

  it("a story result sends a place count and a pointer to the map view, not the names", async () => {
    const { message } = await mcpPost(handler(), { method: "tools/call", params: { name: "get_station_story", arguments: { storyId: "s2" } } });
    expect(message.result.structuredContent.story.places).toBeUndefined();
    expect(message.result.structuredContent.story.placeCount).toBe(2);
    expect(message.result.structuredContent.story.summary).toBe(story.summary);
    expect(message.result.content.map((c: { text: string }) => c.text).join(" ")).toContain('view "places"');
  });

  it("the map view itself keeps the places for the model", async () => {
    const { message } = await mcpPost(handler(), { method: "tools/call", params: { name: "get_station_story", arguments: { storyId: "s2", view: "places" } } });
    expect(message.result.structuredContent.story.places).toHaveLength(2);
  });
});

it("card tools declare picture-in-picture to ChatGPT (openai/ui.availableDisplayModes); tools without a card don't", async () => {
  const tools: { name: string; _meta: Record<string, { availableDisplayModes?: string[] } | undefined> }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
  expect(tools.find((t) => t.name === "on_air_now")!._meta["openai/ui"]!.availableDisplayModes).toEqual(["inline", "fullscreen", "pip"]);
  expect(tools.find((t) => t.name === "delete_my_finds")!._meta["openai/ui"]).toBeUndefined();
});

it("on_air_now is callable from the card (the live refresh)", async () => {
  const tools: { name: string; _meta: Record<string, unknown> }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
  expect(tools.find((t) => t.name === "on_air_now")!._meta["openai/widgetAccessible"]).toBe(true);
});

// Slice 3: replies on the ChatGPT door drop voice-only phrasing (Alexa's spoken replies stay word for word).
describe("ChatGPT door: chat wording", () => {
  const songs = Array.from({ length: 5 }, (_, i) => ({ playId: `p${i}`, artist: `Artist ${i}`, title: `Song ${i}`, playedAt: 0, artworkUrl: null, previewUrl: null }));
  const deps = (surface?: "chat") => ({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist({ recentSongs: async () => songs, listFinds: async () => [] }), cardHtml: () => "", ...(surface ? { surface } : {}) });
  const said = async (surface: "chat" | undefined, name: string, args: Record<string, unknown>, as?: string) => {
    const body = { method: "tools/call", params: { name, arguments: args } };
    const { message } = as ? await mcpPostAs(buildMcpHandler(deps(surface)), body, as) : await mcpPost(buildMcpHandler(deps(surface)), body);
    return (message.result.content as { text: string }[]).map((c) => c.text).join(" ");
  };

  it("no 'Say Alexa, play…' on the ChatGPT door; Alexa keeps it", async () => {
    expect(await said("chat", "on_air_now", { station: "88nine" })).not.toMatch(/alexa/i);
    expect(await said(undefined, "on_air_now", { station: "88nine" })).toContain("Say 'Alexa, play");
  });

  it("no 'Want the next two?' paging in chat (the card shows the whole list)", async () => {
    expect(await said("chat", "recent_songs", { station: "88nine", count: 5 })).not.toContain("Want the next");
    expect(await said(undefined, "recent_songs", { station: "88nine", count: 5 })).toContain("Want the next two?");
  });

  it("no spoken calendar offer in chat (the card has Add to calendar)", async () => {
    expect(await said("chat", "station_picks", {})).not.toContain("Want to add one to your calendar?");
    expect(await said(undefined, "station_picks", {})).toContain("Want to add one to your calendar?");
  });

  it("empty Finds and help say what to do in a chat, not what to say to a speaker", async () => {
    expect(await said("chat", "list_finds", {}, "user_1")).toContain("Save songs from any song card");
    expect(await said("chat", "what_can_you_do", {})).toContain('Ask "tell me more" for examples.');
    expect(await said(undefined, "what_can_you_do", {})).toContain("Say tell me more for examples.");
  });
});

it("the card resource isn't described as Alexa+ style on the ChatGPT door", async () => {
  const { message } = await mcpPost(chatHandler(), { method: "resources/list" });
  expect(message.result.resources[0].description).not.toMatch(/alexa/i);
});

// Slice 5: requests and 5 O'Clock Shadow. Nothing sends without the card's Send (a sealed token the model never sees).
describe("ChatGPT door: send_station_request", () => {
  const NOW = new Date("2026-10-07T18:00:00Z");
  const setup = (used = 0) => ({ counter: { countToday: vi.fn(async () => used), record: vi.fn(async () => undefined) }, send: vi.fn(async () => undefined), secret: "s" });
  const door = (requests: ReturnType<typeof setup> | null) =>
    buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "", surface: "chat", now: () => NOW, requests: () => requests });
  const call = (args: Record<string, unknown>) => ({ method: "tools/call", params: { name: "send_station_request", arguments: args } });
  const tokenIn = (html: string) => JSON.parse(html.match(/data-call="([^"]+)"/)![1].replace(/&quot;/g, '"')).arguments.token as string;
  const draft = { kind: "song_request", song: "No ID", artist: "Tank and the Bangas" };

  it("is only on the ChatGPT door", async () => {
    const alexa = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "" });
    const names = (r: { tools: { name: string }[] }) => r.tools.map((t) => t.name);
    expect(names((await mcpPost(alexa, { method: "tools/list" })).message.result)).not.toContain("send_station_request");
    expect(names((await mcpPost(door(setup()), { method: "tools/list" })).message.result)).toContain("send_station_request");
  });

  it("asks to sign in when signed out", async () => {
    const { message } = await mcpPost(door(setup()), call(draft));
    expect(message.result._meta["mcp/www_authenticate"]).toHaveLength(1);
  });

  it("a draft shows the preview; the Send token is in the card only, never where the model reads", async () => {
    const s = setup();
    const { message } = await mcpPostAs(door(s), call(draft), "user_1");
    expect(message.result.structuredContent.view).toBe("request");
    expect(message.result.structuredContent.request).toEqual(draft);
    const token = tokenIn(message.result._meta.cardHtml);
    expect(JSON.stringify(message.result.structuredContent)).not.toContain(token);
    expect(JSON.stringify(message.result.content)).not.toContain(token);
    expect(s.send).not.toHaveBeenCalled();
  });

  it("Send with the card's token emails the station once and counts it", async () => {
    const s = setup();
    const preview = await mcpPostAs(door(s), call(draft), "user_1");
    const { message } = await mcpPostAs(door(s), call({ token: tokenIn(preview.message.result._meta.cardHtml) }), "user_1");
    expect(s.send).toHaveBeenCalledTimes(1);
    expect((s.send.mock.calls[0] as unknown as [{ subject: string }])[0].subject).toBe("Song request: No ID — Tank and the Bangas");
    expect(s.counter.record).toHaveBeenCalledWith("user_1", "2026-10-07");
    expect(message.result.structuredContent).toMatchObject({ view: "request-status", sent: true });
  });

  it("a forged token or another listener's token never sends", async () => {
    const s = setup();
    const preview = await mcpPostAs(door(s), call(draft), "user_1");
    const token = tokenIn(preview.message.result._meta.cardHtml);
    expect((await mcpPostAs(door(s), call({ token }), "user_2")).message.result.structuredContent.sent).toBe(false);
    expect((await mcpPostAs(door(s), call({ token: "forged" }), "user_1")).message.result.structuredContent.sent).toBe(false);
    expect(s.send).not.toHaveBeenCalled();
  });

  it("after three today, no new preview and no send", async () => {
    const s = setup(3);
    const { message } = await mcpPostAs(door(s), call(draft), "user_1");
    expect(message.result.structuredContent.sent).toBe(false);
    expect(message.result.content[0].text).toContain("tomorrow");
    expect(s.send).not.toHaveBeenCalled();
  });

  it("unavailable (no email setup) says so instead of pretending", async () => {
    const { message } = await mcpPostAs(door(null), call(draft), "user_1");
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toContain("aren't available");
  });

  it("a 5 O'Clock Shadow suggestion without the cover artist asks for it", async () => {
    const { message } = await mcpPostAs(door(setup()), call({ kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails" }), "user_1");
    expect(message.result.content[0].text).toContain("Whose cover");
    expect(message.result.structuredContent.view).toBeUndefined();
  });
});

it("send_station_request asks ChatGPT to get the name the DJ should use", async () => {
  const tools: { name: string; description: string; inputSchema: { properties: Record<string, unknown> } }[] = (await mcpPost(chatHandler(), { method: "tools/list" })).message.result.tools;
  const tool = tools.find((t) => t.name === "send_station_request")!;
  expect(tool.inputSchema.properties.fromName).toBeDefined();
  expect(tool.description).toContain("fromName");
});

// Slice 4a: in chat, "what played on HYFIN between 10 and 10:30?" lists every play in the window; Alexa keeps one guess.
describe("ChatGPT door: songs in a time window", () => {
  const NOW = new Date("2026-10-07T18:00:00Z"); // 1 p.m. in Milwaukee
  const songs = [3, 2, 1].map((n) => ({ playId: `p${n}`, artist: `Artist ${n}`, title: `Song ${n}`, playedAt: Date.parse("2026-10-07T15:00:00Z") + n * 300_000, artworkUrl: null, previewUrl: null }));
  const make = (surface?: "chat") => {
    const playsBetween = vi.fn(async () => songs);
    const findSongPlayed = vi.fn(async () => ({ status: "ok" as const, matches: [] }));
    const handler = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist({ playsBetween, findSongPlayed } as never), cardHtml: () => "", now: () => NOW, ...(surface ? { surface } : {}) });
    return { handler, playsBetween, findSongPlayed };
  };
  const window = { station: "hyfin", startTime: "10:00", endTime: "10:30" };

  it("chat: no cues → every play between the two times, as a numbered song card", async () => {
    const { handler, playsBetween, findSongPlayed } = make("chat");
    const { message } = await mcpPost(handler, { method: "tools/call", params: { name: "find_song_played", arguments: window } });
    expect(playsBetween).toHaveBeenCalledWith("hyfin", Date.parse("2026-10-07T15:00:00Z"), Date.parse("2026-10-07T15:30:00Z"), 12);
    expect(findSongPlayed).not.toHaveBeenCalled();
    expect(message.result.structuredContent.view).toBe("songs");
    expect(message.result.structuredContent.songs.map((s: { number: number; title: string }) => [s.number, s.title])).toEqual([[1, "Song 3"], [2, "Song 2"], [3, "Song 1"]]);
    expect(message.result.content[0].text).toContain("HYFIN between 10:00 a.m. and 10:30 a.m.");
  });

  it("chat with cues ('the one with horns') still asks for the best match", async () => {
    const { handler, playsBetween, findSongPlayed } = make("chat");
    await mcpPost(handler, { method: "tools/call", params: { name: "find_song_played", arguments: { ...window, cues: ["horns"] } } });
    expect(findSongPlayed).toHaveBeenCalled();
    expect(playsBetween).not.toHaveBeenCalled();
  });

  it("Alexa keeps one confident answer", async () => {
    const { handler, playsBetween, findSongPlayed } = make();
    await mcpPost(handler, { method: "tools/call", params: { name: "find_song_played", arguments: window } });
    expect(findSongPlayed).toHaveBeenCalled();
    expect(playsBetween).not.toHaveBeenCalled();
  });
});

// Slice 6: the station home — a global entrypoint ChatGPT can list in its sidebar (openai/mcp-extensions).
describe("ChatGPT door: station home", () => {
  type T = { name: string; title: string; _meta: Record<string, { entrypoints?: unknown; availableDisplayModes?: string[] }> };
  const homeDoor = () => buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "", surface: "chat",
    newsletter: () => ({ latest: async () => ({ date: "Oct. 1", title: "Weekly", items: [{ heading: "Playtime's over", url: "https://radiomilwaukee.org/x", summary: "Jeff Levering is everything." }] }) }) as never });

  it("is a global entrypoint on the ChatGPT door only, and still declares picture-in-picture", async () => {
    const tools: T[] = (await mcpPost(homeDoor(), { method: "tools/list" })).message.result.tools;
    const home = tools.find((t) => t.name === "station_home")!;
    expect(home._meta["openai/ui"].entrypoints).toEqual([{ type: "global" }]);
    expect(home._meta["openai/ui"].availableDisplayModes).toEqual(["inline", "fullscreen", "pip"]);
    expect(home.title).not.toBe("Radio Milwaukee");
    const alexa = buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "" });
    expect((await mcpPost(alexa, { method: "tools/list" })).message.result.tools.map((t: T) => t.name)).not.toContain("station_home");
  });

  it("opens with no arguments and no sign-in: on air plus this week, and a hint to sign in for Finds", async () => {
    const { message } = await mcpPost(homeDoor(), { method: "tools/call", params: { name: "station_home", arguments: {} } });
    expect(message.result.isError).toBeFalsy();
    expect(message.result.structuredContent.view).toBe("home");
    expect(message.result._meta.cardHtml).toContain("Playtime");
    expect(message.result._meta.cardHtml).toContain("Sign in");
  });

  it("signed in, it includes your Finds", async () => {
    const { message } = await mcpPostAs(homeDoor(), { method: "tools/call", params: { name: "station_home", arguments: {} } }, "user_1");
    expect(message.result._meta.cardHtml).toContain("tile song find");
  });
});
