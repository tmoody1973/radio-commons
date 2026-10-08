import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { renderView, type CardView } from "@/lib/card";
import { ArticleUnavailable, isStationPage, type Article, type ArticleReader } from "@/lib/article";
import type { BackstoryClient } from "@/lib/backstory";

type ToolResult = { [key: string]: unknown; content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
type Server = Parameters<typeof registerAppTool>[0];
export interface ArticleToolDeps {
  reader: () => ArticleReader | null;
  backstory: () => Pick<BackstoryClient, "storyForPage" | "getStory">;
  card: (view: CardView, extra?: Record<string, unknown>) => Record<string, unknown>;
  cardMeta: { _meta: { ui: { resourceUri: string } } };
}

const text = (t: string) => [{ type: "text" as const, text: t }];
// ponytail: enough for follow-up questions about a long listicle; the card has the whole article either way.
const MODEL_TEXT_MAX = 8000;
const plainText = (a: Article) => [a.title, a.teaser, ...a.blocks.map((b) => (b.kind === "heading" ? `\n${b.text}` : b.lines.join(", ")))]
  .filter(Boolean).join("\n").slice(0, MODEL_TEXT_MAX);

/** ChatGPT door only: a radiomilwaukee.org article (the newsletter's Read) as a card, from NPR's copy of it. */
/** The episode audio for a page that is also a story (an artist interview); null for anything else or on failure. */
async function episodeAudio(backstory: Pick<BackstoryClient, "storyForPage" | "getStory">, url: string): Promise<string | null> {
  try {
    const page = await backstory.storyForPage(url);
    const story = page ? await backstory.getStory(page.storyId) : null;
    // Episodes only: sessions and premieres keep their own rules for what may play (decision 012).
    return story?.contentType === "episode" && story.audioUrl ? story.audioUrl : null;
  } catch {
    return null; // the article opens either way
  }
}

export function registerArticleTool(server: Server, { reader, backstory, card, cardMeta }: ArticleToolDeps) {
  const linkOnly = (url: string, why: string): ToolResult => ({ content: text(`${why} It's on the station's site: ${url}`), structuredContent: { status: "link_only", url } });

  registerAppTool(server, "read_article", {
    title: "Read a Radio Milwaukee article",
    description: "Open a radiomilwaukee.org article as a readable card: photo, headline and the opening, with the whole article in fullscreen. Use when the listener taps Read on a newsletter item or asks to read an article from the newsletter or 'This week': pass that item's url. Returns the article text, so answer follow-up questions from it.",
    inputSchema: z.object({ url: z.string().max(500) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    ...cardMeta,
  }, async ({ url }) => {
    if (!isStationPage(url)) return { content: text("I can only open articles from radiomilwaukee.org.") };
    const articles = reader();
    if (!articles) return linkOnly(url, "I can't open articles here yet.");
    const started = Date.now();
    try {
      const [article, audioUrl] = await Promise.all([articles.read(url), episodeAudio(backstory(), url)]);
      if (!article) return linkOnly(url, "That page isn't an article I can open here.");
      const playable = audioUrl ? "\nThe card's Play episode button plays this episode here in the chat." : "";
      return {
        content: text(plainText(article) + playable),
        structuredContent: card({ view: "article", article, audioUrl }, { fullHtml: renderView({ view: "article", article, full: true, audioUrl }), article: { title: article.title, url: article.url } }),
      };
    } catch (error) {
      if (!(error instanceof ArticleUnavailable)) throw error;
      console.error(JSON.stringify({ tool: "read_article", error: error.message }));
      return linkOnly(url, "I couldn't open that article right now.");
    } finally {
      console.log(JSON.stringify({ tool: "read_article", ms: Date.now() - started }));
    }
  });
}
