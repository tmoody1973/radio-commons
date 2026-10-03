import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { FieldGuideUnavailable, type FieldGuideClient, type PublicEvent } from "@/lib/fieldGuide";
import { frameBounds, mapFrame, type Frame } from "@/lib/map/geo";

const STATIC_MAP = "https://maps.geo.us-east-1.amazonaws.com/v2/static/map";
const STORY_ID = /^[a-z0-9]{1,64}$/;
/** The card's inline map size at its 768-px base canvas: the only size this route draws. */
export const MAP_W = 300;
export const MAP_H = 250;
const KNOWN = new Set(["story", "events", "anchor", "ai", "w", "h", "n", "theme", "v"]);
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_EVENT_PINS = 3;

/** The events with a pin, in the order given. */
export const pinnedEvents = (events: PublicEvent[]) =>
  events.flatMap((e) => (e.venue?.lat != null && e.venue?.lng != null ? [{ ...e, lat: e.venue.lat, lng: e.venue.lng }] : []));

/** An events map's points: the events (in order), then the starred story place. Shared by the card and this route so both draw one frame. */
export function eventMapPoints(events: PublicEvent[], anchor: { lat: number; lng: number } | null) {
  return [...pinnedEvents(events).map(({ lat, lng }) => ({ lat, lng })), ...(anchor ? [anchor] : [])];
}

/** The story's places that have a pin, in story order. */
export const pinnedPlaces = (story: Story) =>
  story.places.flatMap((p) => (p.lat !== null && p.lng !== null ? [{ ...p, lat: p.lat, lng: p.lng }] : []));

/** Amazon's static map of `frame` at w×h, in its sharp (@2x) form so it stays crisp on a 1.67× screen. */
export function staticMapUrl(frame: Frame, w: number, h: number, theme: "light" | "dark", key: string): string {
  // The exact corners of the pins' frame rather than a zoom number: Amazon's zoom convention didn't line up with
  // the pins in a live check (2026-10-03). Amazon allows at most 14 decimal places; 6 is about 10 cm.
  const { sw, ne } = frameBounds(frame, w, h);
  const params = new URLSearchParams({
    style: "Standard", // Amazon's default is Satellite, which has no light/dark
    "bounding-box": [sw.lng, sw.lat, ne.lng, ne.lat].map((n) => n.toFixed(6)).join(","),
    width: String(w),
    height: String(h),
    "color-scheme": theme === "dark" ? "Dark" : "Light",
    key,
  });
  return `${STATIC_MAP}@2x?${params}`;
}

interface MapDeps {
  backstory: BackstoryClient;
  fieldGuide?: FieldGuideClient;
  key: string;
  fetchImage: (url: string) => Promise<Response>;
}

const fail = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain" } });
const int = (value: string | null, min: number, max: number, fallback?: number) => {
  if (value === null && fallback !== undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * GET /api/map: a published story's places on an Amazon map. Positions come only from Backstory, never the
 * request, so this can't be used to fetch arbitrary maps on our account; responses are cached for a day.
 */
export async function handleMap(query: URLSearchParams, deps: MapDeps): Promise<Response> {
  if (query.has("events")) return eventsMap(query, deps);
  const storyId = query.get("story") ?? "";
  const n = int(query.get("n"), 1, 10, 10);
  const [w, h] = [Number(query.get("w")), Number(query.get("h"))];
  // Only the card's own size and known settings: anything else would be a fresh, uncached Amazon call.
  const unknown = [...query.keys()].some((key) => !KNOWN.has(key));
  if (!STORY_ID.test(storyId) || w !== MAP_W || h !== MAP_H || n === null || unknown) return fail(400, "Bad map request.");
  let story: Story | null;
  try {
    story = await deps.backstory.getStory(storyId);
  } catch (error) {
    if (error instanceof BackstoryUnavailable) return fail(503, "Stories are unavailable right now.");
    throw error;
  }
  const places = story ? pinnedPlaces(story).slice(0, n) : [];
  if (places.length === 0) return fail(404, "No mapped places for that story.");
  return picture(places, w, h, query, deps);
}

async function picture(points: { lat: number; lng: number }[], w: number, h: number, query: URLSearchParams, deps: MapDeps): Promise<Response> {
  const theme = query.get("theme") === "dark" ? "dark" : "light";
  const image = await deps.fetchImage(staticMapUrl(mapFrame(points, w, h), w, h, theme, deps.key));
  if (!image.ok) {
    // Amazon's reason, minus anything that could carry the key.
    const reason = (await image.text().catch(() => "")).slice(0, 300).replace(/key=[^&\s"]*/gi, "key=…");
    console.error(JSON.stringify({ map: "amazon_error", status: image.status, type: image.headers.get("x-amzn-errortype"), reason }));
    return fail(502, "The map is unavailable right now.");
  }
  return new Response(image.body, {
    status: 200,
    headers: { "content-type": image.headers.get("content-type") ?? "image/png", "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}

/** An events map: positions from the Field Guide by id, plus the story place (from Backstory) the listener asked near. */
async function eventsMap(query: URLSearchParams, deps: MapDeps): Promise<Response> {
  const ids = (query.get("events") ?? "").split(",");
  const anchorStory = query.get("anchor");
  const ai = int(query.get("ai"), 0, 50, 0);
  const unknown = [...query.keys()].some((key) => !KNOWN.has(key));
  const [w, h] = [Number(query.get("w")), Number(query.get("h"))];
  if (!deps.fieldGuide || ids.length > MAX_EVENT_PINS || !ids.every((id) => EVENT_ID.test(id)) || (anchorStory !== null && !STORY_ID.test(anchorStory))
    || ai === null || w !== MAP_W || h !== MAP_H || unknown) return fail(400, "Bad map request.");
  let events: PublicEvent[];
  let anchor: { lat: number; lng: number } | null = null;
  try {
    const found = await deps.fieldGuide.events({ ids });
    events = ids.flatMap((id) => found.filter((e) => e.id === id));
    if (anchorStory) {
      const story = await deps.backstory.getStory(anchorStory);
      const place = story ? pinnedPlaces(story)[ai] : undefined;
      anchor = place ? { lat: place.lat, lng: place.lng } : null;
    }
  } catch (error) {
    if (error instanceof FieldGuideUnavailable || error instanceof BackstoryUnavailable) return fail(503, "Events are unavailable right now.");
    throw error;
  }
  const points = eventMapPoints(events, anchor);
  if (points.length === 0) return fail(404, "No mapped events.");
  return picture(points, w, h, query, deps);
}
