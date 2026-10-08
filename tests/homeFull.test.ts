import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import type { PlaylistClient } from "@/lib/playlist";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost, mcpPostAs } from "./mcp-wire";

// The station home's fullscreen page (the sidebar app): board A of the 2026-10-08 mockups, approved by Tarik.
const NEWSLETTER = { latest: async () => ({ date: "Oct. 1", title: "Weekly", items: [{ heading: "Playtime's over", url: "https://radiomilwaukee.org/x", summary: "Jeff Levering is everything." }] }) };
const ep = (storyId: string, title: string, show: string, showSlug: string, day: number) =>
  ({ storyId, title, show, showSlug, attribution: "a", publishedAt: Date.UTC(2026, 9, day, 15), hint: "h", imageUrl: `https://f.prxu.org/${storyId}.jpg` });
const STORIES: Record<string, ReturnType<typeof ep>[]> = {
  "this-bites": [ep("tb", "Turkey talk", "This Bites", "this-bites", 1)],
  "artist-interviews": [ep("ai", "From the broadcast booth", "Radio Milwaukee Artist Interviews", "artist-interviews", 5)],
  "uniquely-milwaukee": [ep("um", "A path forward", "Uniquely Milwaukee", "uniquely-milwaukee", 3)],
};
const door = (playlist: PlaylistClient = fakePlaylist(), stories = STORIES) =>
  buildMcpHandler({
    backstory: () => fakeBackstory({ latestStoryCards: async (slug?: string) => stories[slug ?? ""] ?? [] }),
    fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, cardHtml: () => "", surface: "chat", newsletter: () => NEWSLETTER as never,
  });
const CALL = { method: "tools/call", params: { name: "station_home", arguments: {} } };
const home = async (handler = door(), listener?: string) => (listener ? await mcpPostAs(handler, CALL, listener) : await mcpPost(handler, CALL)).message.result;

describe("station home, fullscreen (the sidebar app)", () => {
  it("is a page for the card only: the model never reads it", async () => {
    const result = await home();
    expect(result._meta.fullHtml).toContain("What do you want to");
    expect(result.structuredContent.fullHtml).toBeUndefined();
  });

  it("runs prompts, Start here, On air now, Latest stories, This week, Your Finds, Explore, top to bottom", async () => {
    const html: string = (await home())._meta.fullHtml;
    const order = ["<h1>What do you want to", ...["Start here", "On air now", "Latest stories", "This week", "Your Finds", "Explore"].map((h) => `<h2>${h}</h2>`)].map((s) => html.indexOf(s));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("mixes the newest story of each show, newest first, and a tap asks about it", async () => {
    const html: string = (await home())._meta.fullHtml;
    expect(html.indexOf("From the broadcast booth")).toBeLessThan(html.indexOf("A path forward"));
    expect(html.indexOf("A path forward")).toBeLessThan(html.indexOf("Turkey talk"));
    expect(html).toContain('data-ask="Tell me about the story &quot;A path forward&quot;"');
    expect(html).toContain("https://f.prxu.org/um.jpg");
  });

  it("shows this week's newsletter items", async () => {
    const html: string = (await home())._meta.fullHtml;
    expect(html).toContain("Playtime&#39;s over");
    expect(html).toContain("From the Oct. 1 newsletter");
  });

  it("signed in: your Finds and your playlists", async () => {
    const playlist = fakePlaylist({ listPlaylists: async () => [{ playlistId: "pl_1", name: "tarik jams", itemCount: 0, updatedAt: 1 }] });
    const html: string = (await home(door(playlist), "user_1"))._meta.fullHtml;
    expect(html).toContain("tarik jams");
    expect(html).toContain("0 songs");
    expect(html).not.toContain("Sign in to see your Finds");
  });

  it("signed out: Finds asks you to sign in, and playlists aren't looked up", async () => {
    const listPlaylists = vi.fn(async () => []);
    const html: string = (await home(door(fakePlaylist({ listPlaylists }))))._meta.fullHtml;
    expect(html).toContain("Sign in to see your Finds");
    expect(listPlaylists).not.toHaveBeenCalled();
  });

  it("escapes what comes from the newsroom", async () => {
    const stories = { "this-bites": [ep("x", '<img src=x onerror="alert(1)">', "This Bites", "this-bites", 1)] };
    const html: string = (await home(door(fakePlaylist(), stories)))._meta.fullHtml;
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("the inline home has a button that opens it", async () => {
    expect((await home())._meta.cardHtml).toContain('class="primary fullscreen"');
  });
});
