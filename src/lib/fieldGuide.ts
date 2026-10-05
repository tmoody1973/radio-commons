import { z } from "zod";

// The MKE Field Guide's read-only public API (tmoody1973/mke-field-guide src/app/api/public): upcoming events only.
const eventSchema = z.object({
  id: z.string(), title: z.string(), startAt: z.string(), endAt: z.string().nullable(),
  venue: z.object({
    name: z.string(), address: z.string().nullable(), lat: z.number().nullable(), lng: z.number().nullable(), neighborhood: z.string().nullable(),
  }).nullable(),
  category: z.string().nullable(), isFree: z.boolean().nullable(), priceMin: z.number().nullable(), priceMax: z.number().nullable(),
  imageUrl: z.string().nullable(), url: z.string(), calendarUrl: z.string(), isStationEvent: z.boolean(),
  pick: z.object({ curator: z.string(), role: z.string().nullable(), blurb: z.string() }).nullable(),
  distanceMiles: z.number().optional(),
});
const listSchema = z.object({ events: z.array(eventSchema) });

export type PublicEvent = z.infer<typeof eventSchema>;
export type When = "tonight" | "today" | "tomorrow" | "this-weekend" | "this-week";
export interface EventQuery { q?: string; when?: When; near?: { lat: number; lng: number }; radiusMiles?: number; free?: boolean; ids?: string[]; limit?: number }

export class FieldGuideUnavailable extends Error {}

export interface FieldGuideClient {
  events(query: EventQuery): Promise<PublicEvent[]>;
  picks(): Promise<PublicEvent[]>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Every call has a deadline and a checked shape; anything else is "unavailable", never partial data. */
export function createFieldGuideClient({ baseUrl, fetch: get = fetch, timeoutMs = 2000 }: { baseUrl: string; fetch?: Fetch; timeoutMs?: number }): FieldGuideClient {
  async function call(path: string): Promise<PublicEvent[]> {
    try {
      const response = await get(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new FieldGuideUnavailable(`${path} answered ${response.status}`);
      const parsed = listSchema.safeParse(await response.json());
      if (!parsed.success) throw new FieldGuideUnavailable(`${path} returned an unexpected shape`);
      return parsed.data.events;
    } catch (error) {
      throw error instanceof FieldGuideUnavailable ? error : new FieldGuideUnavailable(`${path} failed: ${String(error)}`);
    }
  }
  return {
    events: (query) => {
      const params = new URLSearchParams();
      if (query.q) params.set("q", query.q);
      if (query.when) params.set("when", query.when);
      if (query.near) params.set("near", `${query.near.lat},${query.near.lng}`);
      if (query.radiusMiles) params.set("radius", String(query.radiusMiles));
      if (query.free) params.set("free", "1");
      if (query.ids?.length) params.set("ids", query.ids.join(","));
      if (query.limit) params.set("limit", String(query.limit));
      return call(`/api/public/events?${params}`);
    },
    picks: () => call("/api/public/picks"),
  };
}

export function fieldGuideFromEnv(): FieldGuideClient {
  return createFieldGuideClient({ baseUrl: process.env.FIELD_GUIDE_URL ?? "https://mke-field-guide.vercel.app" });
}
