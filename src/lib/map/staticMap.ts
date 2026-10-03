import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { mapFrame, type Frame } from "@/lib/map/geo";

const STATIC_MAP = "https://maps.geo.us-east-1.amazonaws.com/v2/static/map";
const STORY_ID = /^[a-z0-9]{1,64}$/;

/** The story's places that have a pin, in story order. */
export const pinnedPlaces = (story: Story) =>
  story.places.flatMap((p) => (p.lat !== null && p.lng !== null ? [{ ...p, lat: p.lat, lng: p.lng }] : []));

/** Amazon's static map of `frame` at w×h, fetched at twice the pixels one zoom closer so it stays sharp on a 1.67× screen. */
export function staticMapUrl(frame: Frame, w: number, h: number, theme: "light" | "dark", key: string): string {
  const params = new URLSearchParams({
    center: `${frame.center.lng},${frame.center.lat}`,
    zoom: String(frame.zoom + 1),
    width: String(w * 2),
    height: String(h * 2),
    "color-scheme": theme === "dark" ? "Dark" : "Light",
    key,
  });
  return `${STATIC_MAP}?${params}`;
}

interface MapDeps {
  backstory: BackstoryClient;
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
  const storyId = query.get("story") ?? "";
  const w = int(query.get("w"), 100, 800);
  const h = int(query.get("h"), 100, 800);
  const n = int(query.get("n"), 1, 10, 10);
  if (!STORY_ID.test(storyId) || w === null || h === null || n === null) return fail(400, "Bad map request.");
  let story: Story | null;
  try {
    story = await deps.backstory.getStory(storyId);
  } catch (error) {
    if (error instanceof BackstoryUnavailable) return fail(503, "Stories are unavailable right now.");
    throw error;
  }
  const places = story ? pinnedPlaces(story).slice(0, n) : [];
  if (places.length === 0) return fail(404, "No mapped places for that story.");
  const theme = query.get("theme") === "dark" ? "dark" : "light";
  const image = await deps.fetchImage(staticMapUrl(mapFrame(places, w, h), w, h, theme, deps.key));
  if (!image.ok) {
    console.error(JSON.stringify({ map: "amazon_error", status: image.status }));
    return fail(502, "The map is unavailable right now.");
  }
  return new Response(image.body, {
    status: 200,
    headers: { "content-type": image.headers.get("content-type") ?? "image/png", "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
