import { describe, expect, it } from "vitest";
import { chatCardPage, renderView, storyCardPage } from "@/lib/card";
import { CHAT_STYLE } from "@/lib/card/chatStyle";

// The ChatGPT door's card page (approved mockups, 2026-10-07). Alexa's page is pinned by tests/alexaDoor.test.ts.
describe("chat card page", () => {
  const page = chatCardPage("k");

  it("uses the system font, no Figtree or Google Fonts", () => {
    expect(page).not.toContain("fonts.googleapis.com");
    expect(page).toContain("ui-sans-serif, -apple-system, system-ui");
  });

  it("fits its content: no zoom, no viewport-height minimum", () => {
    expect(page).toContain("const z = 1;");
    expect(page).toContain("#root{min-height:0;display:block}");
  });

  it("hides the logo (ChatGPT shows the app name itself)", () => {
    expect(page).toContain(".logo{display:none}");
  });

  it("still reads card HTML from _meta", () => {
    expect(page).toContain("...result._meta");
  });

  it("leaves the Alexa page alone", () => {
    const alexa = storyCardPage("k");
    expect(alexa).toContain("fonts.googleapis.com");
    expect(alexa).toContain("const z = width / 768;");
  });
});

// Save from the card calls save_find directly (no extra ChatGPT turn); sign-in or any failure falls back to the
// chat message, so ChatGPT can show its sign-in screen. Alexa's card keeps the chat-message path only.
describe("Save from the card", () => {
  const saveArgs = (html: string) => html.match(/data-save="([^"]+)"/g)!.map((m) => JSON.parse(m.slice(11, -1).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'")));

  it("song list Save buttons carry the save_find arguments", () => {
    const html = renderView({ view: "songs", songs: [{ title: "No ID", artist: "Tank and the Bangas", meta: "", artworkUrl: null, previewUrl: null, lines: [] }] });
    expect(saveArgs(html)).toEqual([{ title: "No ID", artist: "Tank and the Bangas" }]);
  });

  it("on-air Save carries the station too, and survives quotes in titles", () => {
    const song = { playId: "p1", artist: "Tank & the Bangas", title: `"Quotes" & 'more'`, playedAt: 0, when: "now", artworkUrl: null, previewUrl: null };
    const html = renderView({ view: "on-air", tiles: [{ station: "hyfin", song, show: null }] } as never);
    expect(saveArgs(html)).toEqual([{ title: `"Quotes" & 'more'`, artist: "Tank & the Bangas", station: "hyfin" }]);
  });

  it("the chat page calls save_find and falls back to the chat message on sign-in or failure", () => {
    const page = chatCardPage("k");
    expect(page).toContain('name: "save_find"');
    expect(page).toContain("account_linking_required");
    expect(page).toContain("return ask(button)");
  });

  it("only shows Saved when save_find says ok (not_found is not an error, so it must fall back too)", () => {
    expect(chatCardPage("k")).toContain('r.structuredContent.status === "ok"');
  });

  // Only our script: the embedded MCP Apps library itself defines callServerTool.
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("the Alexa page never calls tools from the card", () => {
    expect(ownScript(storyCardPage("k"))).not.toContain("callServerTool");
    expect(ownScript(chatCardPage("k"))).toContain("callServerTool");
  });
});

// Listen live keeps playing while the listener chats (picture-in-picture); audio the card can't play opens instead.
describe("Listen in the chat card", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("Listen live asks for picture-in-picture and returns inline when it stops", () => {
    const chat = ownScript(chatCardPage("k"));
    expect(chat).toContain('requestDisplayMode({ mode: "pip" })');
    expect(chat).toContain('requestDisplayMode({ mode: "inline" })');
  });
  it("opens the audio in a new tab when the card isn't allowed to play it", () => {
    expect(ownScript(chatCardPage("k"))).toContain("app.openLink({ url: button.dataset.audio })");
  });
  it("Alexa's card does neither", () => {
    const alexa = ownScript(storyCardPage("k"));
    expect(alexa).not.toContain('mode: "pip"');
    expect(alexa).not.toContain("url: button.dataset.audio");
  });
});

// Fixes from the slice 2 review (2026-10-07).
describe("review fixes", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  const chat = ownScript(chatCardPage("k"));
  const alexa = ownScript(storyCardPage("k"));

  it("1. --card stays a real surface color (fullscreen panel, warn chip and anchor pin use it); only .card is transparent", () => {
    expect(CHAT_STYLE).not.toContain("--card:transparent");
    expect(CHAT_STYLE).toContain("--card:#ffffff");
    expect(CHAT_STYLE).toContain("--card:#212121");
  });

  it("2. fullscreen map on phones: side list becomes a bottom sheet and the fit padding follows the panel", () => {
    expect(CHAT_STYLE).toMatch(/@media \(max-width:600px\)\{[^}]*\.side\{/);
    expect(chat).toContain("padding: chatMapPadding()");
    expect(alexa).toContain("padding: { top: 100 * z, bottom: 40 * z, left: 40 * z, right: 340 * z }");
  });

  it("3. an interrupted play (AbortError) never opens a tab", () => {
    expect(chat).toContain('e.name === "AbortError"');
  });

  it("5. after any redraw (picture-in-picture, theme), the playing button and Saved marks come back", () => {
    expect(chat).toContain("restoreChatState()");
    expect(chat).toContain("savedKeys.add(button.dataset.save)");
    expect(alexa).not.toContain("restoreChatState");
  });
});
