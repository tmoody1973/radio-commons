import { describe, expect, it, vi } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import { ArticleUnavailable, type Article, type ArticleReader } from "@/lib/article";
import type { BackstoryClient } from "@/lib/backstory";
import { fakeBackstory, fakeFieldGuide, fakePlaylist, STORY } from "./fixtures";
import { mcpPost } from "./mcp-wire";

const URL = "https://radiomilwaukee.org/events-festivals/2026-10-01/what-to-do-milwaukee-weekend";
const ARTICLE: Article = {
  id: "g-s921-16741", title: "Milwaukee With Kids weekend guide", teaser: "Oktoberfests wrap up.", publishedAt: Date.parse("2026-10-01T12:00:00Z"), url: URL, image: null,
  blocks: [{ kind: "heading", text: "Featured pick" }, { kind: "para", lines: ["Family Free Day", "Milwaukee County Zoo", "Oct 3"], lead: true }],
};
const door = (articles: (() => ArticleReader | null) | undefined, surface: "chat" | "voice" = "chat", backstory: Partial<BackstoryClient> = {}) =>
  buildMcpHandler({ backstory: () => fakeBackstory(backstory), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), cardHtml: () => "", surface, articles });
const read = (handler: ReturnType<typeof door>, url = URL) => mcpPost(handler, { method: "tools/call", params: { name: "read_article", arguments: { url } } });

describe("read_article (ChatGPT door only)", () => {
  it("is not on the Alexa door", async () => {
    const names = (await mcpPost(door(undefined, "voice"), { method: "tools/list" })).message.result.tools.map((t: { name: string }) => t.name);
    expect(names).not.toContain("read_article");
  });

  it("opens the article as a card with a fullscreen version, and gives ChatGPT the text for follow-ups", async () => {
    const reader = { read: vi.fn(async () => ARTICLE) };
    const { message } = await read(door(() => reader));
    expect(reader.read).toHaveBeenCalledWith(URL);
    expect(message.result.structuredContent.view).toBe("article");
    expect(message.result._meta.cardHtml).toContain("Read the whole article");
    expect(message.result._meta.fullHtml).toContain("Family Free Day");
    expect(message.result.content[0].text).toContain("Family Free Day, Milwaukee County Zoo, Oct 3");
  });

  it("refuses anything off radiomilwaukee.org without reading it", async () => {
    const reader = { read: vi.fn(async () => ARTICLE) };
    const { message } = await read(door(() => reader), "https://evil.example/x");
    expect(reader.read).not.toHaveBeenCalled();
    expect(message.result.content[0].text).toContain("radiomilwaukee.org");
  });

  it("a page that isn't an article, a failure, or no NPR key: gives the link instead", async () => {
    for (const articles of [() => ({ read: async () => null }), () => ({ read: async () => { throw new ArticleUnavailable("down"); } }), () => null]) {
      const { message } = await read(door(articles));
      expect(message.result.content[0].text).toContain(URL);
      expect(message.result.structuredContent?.view).not.toBe("article");
    }
  });
});

// 2026-10-08: the newsletter's Brewers interview opened as an article with no way to hear it, though its story
// record has the NPR audio; ChatGPT sent the listener to the website instead.
describe("read_article: an article that is also an episode plays in the card", () => {
  const AUDIO = "https://cpa.ds.npr.org/s921/audio/2026/10/intrv-jefflevering.mp3";
  const episode = { storyForPage: async () => ({ storyId: STORY.storyId, title: STORY.title }), getStory: async () => ({ ...STORY, audioUrl: AUDIO }) };
  const reader = () => ({ read: async () => ARTICLE });

  it("adds Play episode, first, inline and fullscreen, and tells ChatGPT it plays here", async () => {
    const { message } = await read(door(reader, "chat", episode));
    const inline: string = message.result._meta.cardHtml;
    expect(inline).toContain(`class="primary play" data-audio="${AUDIO}"`);
    expect(inline.indexOf("Play episode")).toBeLessThan(inline.indexOf("Read the whole article"));
    expect(inline).toContain('class="secondary fullscreen"');
    expect(message.result._meta.fullHtml).toContain(`data-audio="${AUDIO}"`);
    expect(message.result.content[0].text).toContain("plays this episode");
  });

  it("only episodes: a session or premiere article gets no Play", async () => {
    const { message } = await read(door(reader, "chat", { ...episode, getStory: async () => ({ ...STORY, contentType: "session", audioUrl: AUDIO }) }));
    expect(message.result._meta.cardHtml).not.toContain("data-audio");
  });

  it("a failed story lookup still opens the article, without Play", async () => {
    const { message } = await read(door(reader, "chat", { storyForPage: async () => { throw new Error("timed out"); } }));
    expect(message.result.structuredContent.view).toBe("article");
    expect(message.result._meta.cardHtml).not.toContain("data-audio");
    expect(message.result._meta.cardHtml).toContain('class="primary fullscreen"');
  });
});
