import { backstoryFromEnv } from "@/lib/backstory";
import { handleMap } from "@/lib/map/staticMap";

export const preferredRegion = "iad1";

export async function GET(request: Request) {
  const key = process.env.AMAZON_LOCATION_API_KEY;
  if (!key) return new Response("Maps are not configured.", { status: 503 });
  return handleMap(new URL(request.url).searchParams, { backstory: backstoryFromEnv(), key, fetchImage: (url) => fetch(url) });
}
