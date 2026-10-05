import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createNewsletterClient, NewsletterUnavailable, parseNewsletter } from "@/lib/newsletter";

const OCT1 = readFileSync("tests/fixtures/newsletter-2026-10-01.txt", "utf8");

describe("parseNewsletter", () => {
  it("reads the Oct. 1 issue: station items in order, sponsor content gone", () => {
    const items = parseNewsletter(OCT1);
    expect(items[0]).toEqual({
      heading: "Playtime’s over",
      url: "https://radiomilwaukee.org/discover-music/artist-interviews/2026-10-01/brewers-playoffs-2026-chances-schedule",
      summary: "Jeff Levering is everything you want in an announcer.",
    });
    expect(items.map((i) => i.heading)).toEqual(expect.arrayContaining(["Un-beet-able", "Move your feet", "A new perspective", "A way forward", "Art and soul"]));
    expect(items.find((i) => i.heading === "Un-beet-able")?.url).toBe("https://radiomilwaukee.org/concerts/2026-09-30/milwaukee-concerts-this-week");
    expect(JSON.stringify(items)).not.toMatch(/American Family Field|proud supporters|sponsored by|mlb\.com|milwaukeemerch/);
    expect(items.length).toBeLessThanOrEqual(6);
  });
  it("an item with no radiomilwaukee.org link is dropped; a CTA-only link is used", () => {
    const text = "** Ad\n------\nhttps://example.com\n\nBuy things.\n\n** Real\n------\nGreat show this week. More words.\nCheck it out (https://radiomilwaukee.org/concerts/x)";
    expect(parseNewsletter(text)).toEqual([{ heading: "Real", url: "https://radiomilwaukee.org/concerts/x", summary: "Great show this week." }]);
  });
  it("long first sentences are cut at a word, not mid-word", () => {
    const text = `** Long\n------\nhttps://radiomilwaukee.org/x\n\n${"word ".repeat(80)}end.`;
    const [item] = parseNewsletter(text);
    expect(item.summary.length).toBeLessThanOrEqual(201);
    expect(item.summary.endsWith("…")).toBe(true);
    expect(item.summary).not.toMatch(/wor…$/);
  });
});

const KEY = "abc123-us7";
const NOW = new Date("2026-10-05T12:00:00Z");
function fakeMailchimp(campaigns: { id: string; title: string; sent: string }[], content = OCT1) {
  return vi.fn(async (url: string) => {
    if (url.includes("/content")) return new Response(JSON.stringify({ plain_text: content }));
    return new Response(JSON.stringify({ campaigns: campaigns.map((c) => ({ id: c.id, send_time: c.sent, settings: { title: c.title } })) }));
  });
}
const CAMPAIGNS = [
  { id: "vip", title: "Studio Milwaukee Session - Greg Freeman VIP Send 2", sent: "2026-10-03T15:00:00Z" },
  { id: "w", title: "Radio Milwaukee Newsletter - Oct. 1", sent: "2026-10-01T13:00:00Z" },
  { id: "ln", title: "Liner Notes - September 2026", sent: "2026-09-25T13:00:00Z" },
];

describe("newsletter client", () => {
  it("picks the newest weekly, asks only for campaign fields, authenticates by region", async () => {
    const fetch = fakeMailchimp(CAMPAIGNS);
    const latest = await createNewsletterClient({ apiKey: KEY, fetch: fetch as never, now: () => NOW }).latest();
    expect(latest).toMatchObject({ title: "Radio Milwaukee Newsletter - Oct. 1", date: "Oct. 1", sentAt: "2026-10-01T13:00:00Z" });
    expect(latest?.items.length).toBeGreaterThan(3);
    const [listUrl, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(listUrl).toMatch(/^https:\/\/us7\.api\.mailchimp\.com\/3\.0\/campaigns\?/);
    expect(listUrl).toContain("status=sent");
    expect(listUrl).toContain("sort_field=send_time");
    expect(listUrl).toContain("fields=");
    expect(fetch.mock.calls.map((c) => String(c[0])).join(" ")).not.toMatch(/\/lists|\/members|\/reports/);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`x:${KEY}`).toString("base64")}`);
    expect(String(fetch.mock.calls[1][0])).toContain("/campaigns/w/content?fields=plain_text");
  });
  it("an issue older than 14 days is none", async () => {
    const old = [{ id: "w", title: "Radio Milwaukee Newsletter - Sept. 3", sent: "2026-09-03T13:00:00Z" }];
    expect(await createNewsletterClient({ apiKey: KEY, fetch: fakeMailchimp(old) as never, now: () => NOW }).latest()).toBeNull();
  });
  it("errors and slowness become NewsletterUnavailable", async () => {
    const denied = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(createNewsletterClient({ apiKey: KEY, fetch: denied as never, now: () => NOW }).latest()).rejects.toBeInstanceOf(NewsletterUnavailable);
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(createNewsletterClient({ apiKey: KEY, fetch: hang as never, now: () => NOW, timeoutMs: 20 }).latest()).rejects.toBeInstanceOf(NewsletterUnavailable);
  });
  it("caches the issue for an hour", async () => {
    const fetch = fakeMailchimp(CAMPAIGNS);
    const client = createNewsletterClient({ apiKey: KEY, fetch: fetch as never, now: () => NOW });
    await client.latest(); await client.latest();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
