/**
 * radiomilwaukee.org articles, read from NPR's content service (CDS) rather than scraped: the station's site runs on NPR
 * Grove, which publishes every article there. A page names its own CDS id ("nprStoryId"), so one page fetch finds it.
 * ChatGPT door only: the newsletter's Read opens the article in a card instead of the browser.
 */
export type ArticleBlock = { kind: "heading"; text: string } | { kind: "para"; lines: string[]; lead: boolean };
export interface Article {
  id: string; title: string; teaser: string; publishedAt: number; url: string;
  image: { url: string; caption: string; credit: string } | null;
  blocks: ArticleBlock[];
}
export class ArticleUnavailable extends Error {}
export interface ArticleReader { read(url: string): Promise<Article | null> }

const CDS_DOCUMENTS = "https://content.api.npr.org/v1/documents/";
const STATION_HOSTS = new Set(["radiomilwaukee.org", "www.radiomilwaukee.org"]);
const NPR_STORY_ID = /nprStoryId(?:&quot;|")\s*:\s*(?:&quot;|")([a-z0-9-]{3,64})(?:&quot;|")/i;

interface CdsEnclosure { href: string; hrefTemplate?: string; rels?: string[] }
interface CdsAsset { text?: string; caption?: string; provider?: string; enclosures?: CdsEnclosure[] }
interface CdsArticle {
  id: string; title: string; teaser?: string; publishDateTime: string;
  webPages?: { href: string; rels?: string[] }[]; images?: { href: string; rels?: string[] }[];
  layout?: { href: string }[]; assets?: Record<string, CdsAsset>;
}

/** Only the station's own https pages: the url comes from the model, so this is the line against fetching anything else. */
export function isStationPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && STATION_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export const articleIdFromPage = (html: string) => html.match(NPR_STORY_ID)?.[1] ?? null;

const text = (html: string) => html
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

/** One CDS text asset as blocks: headings stay headings, <br> stays a line break, lists become one block per item. */
function blocksFrom(html: string): ArticleBlock[] {
  if (/^\s*<hr\b/i.test(html)) return [];
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => text(m[1])).filter(Boolean);
  if (/^\s*<h[1-6]\b/i.test(html)) return headings.map((t) => ({ kind: "heading", text: t }));
  const items = /<li\b/i.test(html) ? [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]) : [html];
  return items.flatMap((item) => {
    const lines = item.split(/<br\s*\/?>/i).map(text).filter(Boolean);
    // An event listing: a bold name, then venue and date on their own lines.
    const lead = lines.length > 1 && /^\s*(<a\b[^>]*>\s*)?<(strong|b)>/i.test(item);
    return lines.length ? [{ kind: "para" as const, lines, lead }] : [];
  });
}

function imageFrom(doc: CdsArticle): Article["image"] {
  const ref = doc.images?.find((i) => i.rels?.includes("primary")) ?? doc.images?.[0];
  const asset = ref && doc.assets?.[ref.href.replace("#/assets/", "")];
  const enclosures = asset?.enclosures ?? [];
  const wide = enclosures.find((e) => e.rels?.includes("image-wide")) ?? enclosures.find((e) => e.rels?.includes("primary")) ?? enclosures[0];
  if (!asset || !wide) return null;
  const url = wide.hrefTemplate ? wide.hrefTemplate.replace("{width}", "800").replace("{quality}", "80").replace("{format}", "jpeg") : wide.href;
  return { url, caption: text(asset.caption ?? ""), credit: text(asset.provider ?? "") };
}

export function parseArticle(doc: CdsArticle): Article {
  const blocks = (doc.layout ?? []).flatMap(({ href }) => {
    const html = doc.assets?.[href.replace("#/assets/", "")]?.text;
    return html ? blocksFrom(html) : []; // photos and embeds in the layout have no text
  });
  const url = doc.webPages?.find((p) => p.rels?.includes("canonical"))?.href ?? doc.webPages?.[0]?.href ?? "";
  return { id: doc.id, title: text(doc.title), teaser: text(doc.teaser ?? ""), publishedAt: Date.parse(doc.publishDateTime), url, image: imageFrom(doc), blocks };
}

/** Null when the page isn't an article (a show page, a form); throws ArticleUnavailable when the site or NPR fails. */
export function createArticleReader(opts: { token: string; fetch?: typeof fetch; timeoutMs?: number }): ArticleReader {
  const fetchImpl = opts.fetch ?? fetch;
  // A 404 is an answer (no such page, or NPR doesn't carry it), not an outage: null, and the listener gets the link.
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 4000) })
      .catch((error: unknown) => { throw new ArticleUnavailable(`${url} failed: ${String(error)}`); });
    if (response.status === 404) return null;
    if (!response.ok) throw new ArticleUnavailable(`${url} returned ${response.status}`);
    return response;
  };
  return {
    async read(url) {
      if (!isStationPage(url)) return null;
      const page = await get(url);
      if (!page || !isStationPage(page.url || url)) return null; // missing, or a redirect off the site
      const id = articleIdFromPage(await page.text());
      if (!id) return null;
      const cds = await get(CDS_DOCUMENTS + encodeURIComponent(id), { Authorization: `Bearer ${opts.token}` });
      const doc = cds && ((await cds.json()) as { resources?: CdsArticle[] }).resources?.[0];
      return doc ? parseArticle(doc) : null;
    },
  };
}

/** Null (articles open on the site instead) until NPR_CDS_TOKEN is set. */
export function articleReaderFromEnv(): ArticleReader | null {
  const token = process.env.NPR_CDS_TOKEN;
  return token ? createArticleReader({ token }) : null;
}
