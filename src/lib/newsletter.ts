import { z } from "zod";

// Radio Milwaukee's weekly newsletter (Mailchimp campaigns titled "Radio Milwaukee Newsletter - Oct. 1"), read for the
// station briefing. Only campaign titles, send times and content are ever requested: never lists, members or reports.

export interface NewsletterItem { heading: string; url: string; summary: string }
export interface Newsletter { title: string; sentAt: string; date: string; items: NewsletterItem[] }
export interface NewsletterClient { latest(): Promise<Newsletter | null> }
export class NewsletterUnavailable extends Error {}

const WEEKLY = "Radio Milwaukee Newsletter";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CACHE_MS = 60 * 60 * 1000;
const MAX_ITEMS = 6;
const MAX_SUMMARY = 200;
const STATION_URL = /https:\/\/radiomilwaukee\.org\/[^\s)]+/;
const SPONSOR = /sponsored by|proud supporters/i;
const CTA = /\(https?:\/\/[^)]+\)\s*\.?\s*$/; // "Go to the interview (https://…)"
const ABBREVIATIONS = /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|Mr|Mrs|Ms|Dr|St|Ave|vs|No)\.$/;

/** The first sentence, not cut at "Oct." or "St.", trimmed at a word to MAX_SUMMARY characters. */
function firstSentence(paragraph: string): string {
  const parts = paragraph.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z“"‘'0-9])/);
  let sentence = parts[0] ?? "";
  for (let i = 1; i < parts.length && ABBREVIATIONS.test(sentence); i++) sentence = `${sentence} ${parts[i]}`;
  if (sentence.length <= MAX_SUMMARY) return sentence;
  const cut = sentence.slice(0, MAX_SUMMARY);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

/** The station's items, in newsletter order: a heading, its radiomilwaukee.org page, the first sentence in the station's words. */
export function parseNewsletter(plainText: string): NewsletterItem[] {
  const items: NewsletterItem[] = [];
  for (const section of plainText.split(/^\*\* /m).slice(1)) {
    const [headingLine, ...rest] = section.split("\n");
    const body = rest.join("\n").replace(/^-{3,}\s*$/m, "");
    const url = body.match(STATION_URL)?.[0];
    if (!url) continue; // an ad or a partner's item: never in the briefing
    const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    // The first paragraph with words of its own: not a bare link, not a "Check it out (link)" line, not sponsor copy.
    const firstLine = paragraphs
      .filter((p) => !SPONSOR.test(p))
      .flatMap((p) => p.split("\n"))
      .find((line) => line.trim() && !CTA.test(line) && !/^https?:\/\/\S+$/.test(line.trim()));
    if (!firstLine) continue;
    items.push({ heading: headingLine.trim(), url, summary: firstSentence(firstLine) });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

const campaignsSchema = z.object({
  campaigns: z.array(z.object({ id: z.string(), send_time: z.string(), settings: z.object({ title: z.string() }) })),
});
const contentSchema = z.object({ plain_text: z.string() });

export function createNewsletterClient(opts: { apiKey: string; fetch?: typeof fetch; now?: () => Date; timeoutMs?: number }): NewsletterClient {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const region = opts.apiKey.split("-").at(-1);
  const base = `https://${region}.api.mailchimp.com/3.0`;
  const headers = { Authorization: `Basic ${Buffer.from(`x:${opts.apiKey}`).toString("base64")}` };
  let cached: { at: number; value: Newsletter | null } | null = null;

  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 2000) });
    } catch {
      throw new NewsletterUnavailable("Mailchimp did not answer in time");
    }
    if (!response.ok) throw new NewsletterUnavailable(`Mailchimp HTTP ${response.status}`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new NewsletterUnavailable("Unexpected Mailchimp response");
    return parsed.data;
  }

  return {
    async latest() {
      if (cached && now().getTime() - cached.at < CACHE_MS) return cached.value;
      const params = new URLSearchParams({
        status: "sent", sort_field: "send_time", sort_dir: "DESC", count: "20",
        fields: "campaigns.id,campaigns.send_time,campaigns.settings.title",
      });
      const { campaigns } = await get(`/campaigns?${params}`, campaignsSchema);
      const weekly = campaigns.find((c) => c.settings.title.startsWith(WEEKLY));
      let value: Newsletter | null = null;
      if (weekly && now().getTime() - Date.parse(weekly.send_time) <= MAX_AGE_MS) {
        const { plain_text } = await get(`/campaigns/${encodeURIComponent(weekly.id)}/content?fields=plain_text`, contentSchema);
        const date = weekly.settings.title.slice(WEEKLY.length).replace(/^\s*[-–—]\s*/, "").trim();
        value = { title: weekly.settings.title, sentAt: weekly.send_time, date, items: parseNewsletter(plain_text) };
      }
      cached = { at: now().getTime(), value };
      return value;
    },
  };
}

/** The live client; a missing key is the same to the listener as Mailchimp being down. */
export function newsletterFromEnv(): NewsletterClient {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) return { latest: async () => { throw new NewsletterUnavailable("MAILCHIMP_API_KEY is not set"); } };
  return (shared ??= createNewsletterClient({ apiKey }));
}
let shared: NewsletterClient | undefined;
