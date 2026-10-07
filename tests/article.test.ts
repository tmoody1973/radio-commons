import { describe, expect, it, vi } from "vitest";
import { ArticleUnavailable, articleIdFromPage, createArticleReader, isStationPage, parseArticle } from "@/lib/article";

// Shapes copied from NPR CDS document g-s921-16741 (radiomilwaukee.org, 2026-10-01).
const IMAGE = "https://npr.brightspotcdn.com/dims3/default/strip/false/crop/1220x686+0+1/resize/{width}/quality/{quality}/format/{format}/?url=x.jpg";
const DOC = {
  id: "g-s921-16741",
  title: "Milwaukee With Kids weekend guide: Spins, spooks and spiders",
  teaser: "Oktoberfests are finishing up this weekend. ",
  publishDateTime: "2026-10-01T07:00:00-05:00",
  webPages: [{ href: "https://radiomilwaukee.org/events-festivals/2026-10-01/what-to-do-milwaukee-weekend", rels: ["canonical"] }],
  images: [{ href: "#/assets/img", rels: ["primary"] }],
  layout: ["img", "p1", "hr", "h", "event", "body", "list"].map((id) => ({ href: `#/assets/${id}` })),
  assets: {
    img: { caption: "Dance Fest, Halloween Village and The Hollows.", provider: "Nō Studios", enclosures: [
      { href: "https://npr.brightspotcdn.com/square.jpg", rels: ["image-square"] },
      { href: "https://npr.brightspotcdn.com/wide.jpg", hrefTemplate: IMAGE, rels: ["image-wide", "scalable"] },
    ] },
    p1: { text: "<em>Every week, Milwaukee With Kids answers a simple question. </em><a href=\"https://x\"><em><u>visit the website</u></em></a><em>.</em>" },
    hr: { text: "<hr />" },
    h: { text: "<h3>Featured pick</h3><h3></h3>" },
    event: { text: "<a href=\"https://milwaukeeoktoberfest.com/\"><strong><u>Milwaukee Oktoberfest</u></strong></a><br>Henry Maier Festival Park<br>Oct. 2-4" },
    body: { text: "Raise a stein &amp; celebrate Hofbräu&#39;s best." },
    list: { text: "<ul><li>Free on Sunday</li><li>Parking $5</li></ul>" },
  },
};

describe("parseArticle", () => {
  const article = parseArticle(DOC);
  it("keeps the title, teaser, date, page and photo with its caption and credit", () => {
    expect(article.title).toBe(DOC.title);
    expect(article.teaser).toBe("Oktoberfests are finishing up this weekend.");
    expect(article.publishedAt).toBe(Date.parse("2026-10-01T12:00:00Z"));
    expect(article.url).toBe(DOC.webPages[0].href);
    expect(article.image).toEqual({ url: IMAGE.replace("{width}", "800").replace("{quality}", "80").replace("{format}", "jpeg"), caption: "Dance Fest, Halloween Village and The Hollows.", credit: "Nō Studios" });
  });
  it("keeps headings and line breaks, drops dividers, empty headings and the photo in the layout", () => {
    expect(article.blocks).toEqual([
      { kind: "para", lines: ["Every week, Milwaukee With Kids answers a simple question. visit the website."], lead: false },
      { kind: "heading", text: "Featured pick" },
      { kind: "para", lines: ["Milwaukee Oktoberfest", "Henry Maier Festival Park", "Oct. 2-4"], lead: true },
      { kind: "para", lines: ["Raise a stein & celebrate Hofbräu's best."], lead: false },
      { kind: "para", lines: ["Free on Sunday"], lead: false },
      { kind: "para", lines: ["Parking $5"], lead: false },
    ]);
  });
});

describe("articleIdFromPage", () => {
  it("reads the page's own NPR story id (escaped or plain quotes)", () => {
    expect(articleIdFromPage('{\n  &quot;nprStoryId&quot; : &quot;g-s921-16741&quot;,')).toBe("g-s921-16741");
    expect(articleIdFromPage('"nprStoryId": "g-s921-99"')).toBe("g-s921-99");
    expect(articleIdFromPage("<html>no id</html>")).toBeNull();
  });
});

describe("isStationPage", () => {
  it("allows radiomilwaukee.org pages only", () => {
    expect(isStationPage("https://radiomilwaukee.org/events-festivals/x")).toBe(true);
    expect(isStationPage("https://www.radiomilwaukee.org/x")).toBe(true);
    expect(isStationPage("https://radiomilwaukee.org.evil.com/x")).toBe(false);
    expect(isStationPage("http://radiomilwaukee.org/x")).toBe(false);
    expect(isStationPage("http://169.254.169.254/")).toBe(false);
    expect(isStationPage("not a url")).toBe(false);
  });
});

describe("createArticleReader", () => {
  const page = '<script>{ &quot;nprStoryId&quot; : &quot;g-s921-16741&quot; }</script>';
  const fake = (pageHtml = page, cdsStatus = 200) => vi.fn(async (url: string) =>
    url.startsWith("https://content.api.npr.org/")
      ? new Response(JSON.stringify({ resources: [DOC] }), { status: cdsStatus })
      : new Response(pageHtml, { status: 200 }));

  it("finds the page's story id, then reads that story from NPR with the token", async () => {
    const fetch = fake();
    const article = await createArticleReader({ token: "cds-token", fetch: fetch as unknown as typeof globalThis.fetch }).read(DOC.webPages[0].href);
    expect(article?.title).toBe(DOC.title);
    const [cdsUrl, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(cdsUrl).toBe("https://content.api.npr.org/v1/documents/g-s921-16741");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cds-token");
  });
  it("never fetches a page off radiomilwaukee.org", async () => {
    const fetch = fake();
    expect(await createArticleReader({ token: "t", fetch: fetch as unknown as typeof globalThis.fetch }).read("https://evil.example/x")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("a page with no NPR story (a show page, a form) is null", async () => {
    expect(await createArticleReader({ token: "t", fetch: fake("<html></html>") as unknown as typeof globalThis.fetch }).read("https://radiomilwaukee.org/x")).toBeNull();
  });
  it("a page NPR doesn't have (404, e.g. some podcast pages) is null, not a failure", async () => {
    expect(await createArticleReader({ token: "t", fetch: fake(page, 404) as unknown as typeof globalThis.fetch }).read("https://radiomilwaukee.org/x")).toBeNull();
  });
  it("NPR refusing is ArticleUnavailable, so the tool falls back to the link", async () => {
    await expect(createArticleReader({ token: "t", fetch: fake(page, 500) as unknown as typeof globalThis.fetch }).read("https://radiomilwaukee.org/x")).rejects.toBeInstanceOf(ArticleUnavailable);
  });
});
