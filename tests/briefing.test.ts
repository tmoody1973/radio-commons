import { describe, expect, it, vi } from "vitest";
import { linkItems } from "@/lib/briefing";

const items = [
  { heading: "Un-beet-able", url: "https://radiomilwaukee.org/concerts/2026-09-30/milwaukee-concerts-this-week", summary: "Beet Street." },
  { heading: "A way forward", url: "https://radiomilwaukee.org/podcast/uniquely-milwaukee/2026-10-01/my-way-out-milwaukee", summary: "VR class." },
  { heading: "A new perspective", url: "https://radiomilwaukee.org/podcast/cinebuds/2026-09-30/milwaukee-muslim-film-festival-2026-schedule", summary: "Film fest." },
];

describe("linkItems", () => {
  it("Concert Picks → picks (no lookup); a published story → story; anything else → the page; newsletter order kept", async () => {
    const storyForPage = vi.fn(async (url: string) => {
      await new Promise((r) => setTimeout(r, url.includes("my-way-out") ? 20 : 1)); // resolve out of order
      return url.includes("my-way-out") ? { storyId: "jn7mwo", title: "Through tech and teaching, My Way Out provides a path forward" } : null;
    });
    const linked = await linkItems(items, { storyForPage });
    expect(linked.map((i) => i.action)).toEqual([
      { kind: "picks" },
      { kind: "story", storyId: "jn7mwo", title: "Through tech and teaching, My Way Out provides a path forward" },
      { kind: "page", url: items[2].url },
    ]);
    expect(storyForPage).not.toHaveBeenCalledWith(items[0].url);
  });
  it("a failed lookup is a page link, never a failed briefing", async () => {
    const linked = await linkItems([items[1]], { storyForPage: async () => { throw new Error("down"); } });
    expect(linked[0].action).toEqual({ kind: "page", url: items[1].url });
  });
});

import { renderView } from "@/lib/card";
import { buildMcpHandler } from "@/lib/mcp";
import { NewsletterUnavailable } from "@/lib/newsletter";
import { NEWSLETTER_UNAVAILABLE_SPEECH, NO_NEWSLETTER_SPEECH, spokenBriefing } from "@/lib/speech";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const BRIEF = [
  { heading: "Un-beet-able", url: "https://radiomilwaukee.org/concerts/x", summary: "Beet Street turns 10 at Cactus Club.", action: { kind: "picks" as const } },
  { heading: "A way forward", url: "https://radiomilwaukee.org/podcast/uniquely-milwaukee/2026-10-01/my-way-out-milwaukee", summary: "Kim Shine joins a VR class.", action: { kind: "story" as const, storyId: "jn7mwo", title: "Through tech and teaching, My Way Out provides a path forward" } },
  { heading: "<b>Art & soul</b>", url: "https://radiomilwaukee.org/events-festivals/x", summary: "A weekend guide.", action: { kind: "page" as const, url: "https://radiomilwaukee.org/events-festivals/x" } },
  { heading: "Four", url: "https://radiomilwaukee.org/a", summary: "Four.", action: { kind: "page" as const, url: "https://radiomilwaukee.org/a" } },
  { heading: "Five", url: "https://radiomilwaukee.org/b", summary: "Five.", action: { kind: "page" as const, url: "https://radiomilwaukee.org/b" } },
];

describe("briefing speech and card", () => {
  it("speaks up to four items, numbered like the screen, credited to the newsletter's date", () => {
    expect(spokenBriefing("Oct. 1", BRIEF)).toBe(
      "This week at Radio Milwaukee, from the Oct. 1 newsletter: 1, Un-beet-able: Beet Street turns 10 at Cactus Club.; 2, A way forward: Kim Shine joins a VR class.; 3, <b>Art & soul</b>: A weekend guide.; 4, Four: Four. Which one?",
    );
  });
  it("card: a numbered row per item with Picks, Play or Read; text escaped", () => {
    const html = renderView({ view: "briefing", date: "Oct. 1", items: BRIEF });
    expect(html).toContain("From the Oct. 1 newsletter");
    expect(html).toContain('class="secondary ask" data-ask="What is Radio Milwaukee recommending?"');
    expect(html).toContain('data-ask="Tell me about the story &quot;Through tech and teaching, My Way Out provides a path forward&quot;"');
    expect(html).toContain('class="secondary details" data-url="https://radiomilwaukee.org/events-festivals/x"');
    expect(html).toContain("&lt;b&gt;Art &amp; soul&lt;/b&gt;");
    expect(html.match(/class="num"/g)).toHaveLength(5);
  });
});

describe("station_briefing tool", () => {
  const handlerWith = (latest: () => Promise<unknown>, storyForPage = async (url: string) => (url.includes("my-way-out") ? { storyId: "jn7mwo", title: "My Way Out" } : null)) =>
    buildMcpHandler({
      backstory: () => fakeBackstory({ storyForPage }), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(),
      newsletter: () => ({ latest: latest as never }), cardHtml: () => "<!doctype html><title>card</title>",
    });
  const call = { method: "tools/call", params: { name: "station_briefing", arguments: {} } };
  const ISSUE = { title: "Radio Milwaukee Newsletter - Oct. 1", sentAt: "2026-10-01T13:00:00Z", date: "Oct. 1", items: BRIEF.map(({ action: _a, ...i }) => i) };

  it("reads the newest issue and links its items", async () => {
    const { message } = await mcpPost(handlerWith(async () => ISSUE), call, 2);
    expect(message.result.content[0].text).toMatch(/^This week at Radio Milwaukee, from the Oct. 1 newsletter: 1, Un-beet-able/);
    expect(message.result.structuredContent.view).toBe("briefing");
    expect(message.result.structuredContent.cardHtml).toContain("Tell me about the story &quot;My Way Out&quot;");
  });
  it("no recent issue, or Mailchimp down, says so", async () => {
    const none = await mcpPost(handlerWith(async () => null), call, 2);
    expect(none.message.result.content[0].text).toBe(NO_NEWSLETTER_SPEECH);
    const down = await mcpPost(handlerWith(async () => { throw new NewsletterUnavailable("x"); }), call, 3);
    expect(down.message.result.content[0].text).toBe(NEWSLETTER_UNAVAILABLE_SPEECH);
    expect(down.message.result.isError).toBe(true);
  });
});
