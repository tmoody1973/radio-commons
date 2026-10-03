import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";

// Backstory's public queries (tmoody1973/backstory convex/public.ts): published stories only.
const matchSchema = z.object({
  storyId: z.string(), title: z.string(), show: z.string(), showSlug: z.string(), attribution: z.string(),
  publishedAt: z.number(), hint: z.string(), imageUrl: z.string().nullable(),
});
const storySchema = z.object({
  storyId: z.string(), show: z.string(), title: z.string(), summary: z.string(), publishedAt: z.number(),
  attribution: z.string(), audioUrl: z.string(), permalink: z.string().nullable(), imageUrl: z.string().nullable().default(null),
  mentions: z.array(z.object({ entityType: z.string(), name: z.string(), quote: z.string(), startMs: z.number(), relatedPlace: z.string().nullable() })),
  places: z.array(z.object({
    name: z.string(), category: z.string(), lat: z.number().nullable(), lng: z.number().nullable(), neighborhood: z.string().nullable(), quote: z.string(),
    address: z.string().nullish(), // the map service's full label
  })),
  topics: z.array(z.object({ topic: z.string(), confidence: z.number(), quote: z.string() })),
  actions: z.array(z.object({ kind: z.string(), label: z.string(), quote: z.string(), place: z.string().nullable() })),
});

const passageSchema = z.object({ text: z.string(), startMs: z.number(), speaker: z.string().nullable() });
const askSchema = z.object({ status: z.enum(["ok", "not_allowed", "not_found"]), passages: z.array(passageSchema) });

export type Passage = z.infer<typeof passageSchema>;
export type AskResult = z.infer<typeof askSchema>;
export type StoryCardMatch = z.infer<typeof matchSchema>;
export type Story = z.infer<typeof storySchema>;

export class BackstoryUnavailable extends Error {}

export interface BackstoryClient {
  searchStoryCards(text: string, showSlug?: string): Promise<StoryCardMatch[]>;
  getStory(storyId: string): Promise<Story | null>;
  /** Short, guarded transcript passages from one published episode (Backstory decides what's allowed). */
  askStory(storyId: string, question: string): Promise<AskResult>;
}

type Query = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Every call races a timeout (the Alexa+ round trip must stay under 500 ms) and validates the reply. */
export function createBackstoryClient({ query, timeoutMs = 350 }: { query: Query; timeoutMs?: number }): BackstoryClient {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        query(name, args),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new BackstoryUnavailable(`${name} timed out after ${timeoutMs} ms`)), timeoutMs);
        }),
      ]);
      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new BackstoryUnavailable(`${name} returned an unexpected shape`);
      return parsed.data;
    } catch (error) {
      throw error instanceof BackstoryUnavailable ? error : new BackstoryUnavailable(`${name} failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    searchStoryCards: (text, showSlug) =>
      call("public:searchStoryCards", showSlug ? { text, showSlug } : { text }, z.array(matchSchema)),
    getStory: (storyId) => call("public:getStory", { storyId }, storySchema.nullable()),
    askStory: (storyId, question) => call("public:askStory", { storyId, question }, askSchema),
  };
}

export function backstoryFromEnv(): BackstoryClient {
  const url = process.env.BACKSTORY_CONVEX_URL;
  if (!url) throw new Error("BACKSTORY_CONVEX_URL is not set");
  const convex = new ConvexHttpClient(url);
  return createBackstoryClient({ query: (name, args) => convex.query(makeFunctionReference<"query">(name), args) });
}
