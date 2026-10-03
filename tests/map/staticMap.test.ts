import { describe, expect, it } from "vitest";
import { handleMap, staticMapUrl } from "@/lib/map/staticMap";
import { fakeBackstory, STORY } from "../fixtures";

const ok = async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
const deps = (over = {}) => ({ backstory: fakeBackstory(), key: "v1.public.secret", fetchImage: ok, ...over });
const params = (q: string) => new URLSearchParams(q);

describe("staticMapUrl", () => {
  it("asks Amazon for a 2x image of the same area (twice the pixels, one zoom level closer)", () => {
    const url = new URL(staticMapUrl({ center: { lat: 43, lng: -88 }, zoom: 11.5 }, 300, 250, "dark", "KEY"));
    expect(url.origin + url.pathname).toBe("https://maps.geo.us-east-1.amazonaws.com/v2/static/map");
    expect(Object.fromEntries(url.searchParams)).toEqual({ center: "-88,43", zoom: "12.5", width: "600", height: "500", "color-scheme": "Dark", key: "KEY" });
  });
});

describe("handleMap", () => {
  it("returns the map picture for a published story's places, cached for a day", async () => {
    const res = await handleMap(params(`story=${STORY.storyId}&w=300&h=250&theme=light&n=3`), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });
  it("refuses unknown stories and out-of-range sizes, and never takes coordinates from the address", async () => {
    let fetched = "";
    const spy = async (url: string) => { fetched = url; return ok(); };
    expect((await handleMap(params("story=jn7000000000000000000000000000000&w=300&h=250"), deps())).status).toBe(404);
    expect((await handleMap(params(`story=${STORY.storyId}&w=5000&h=250`), deps())).status).toBe(400);
    expect((await handleMap(params(`story=${STORY.storyId}&w=300&h=250&n=99`), deps())).status).toBe(400);
    await handleMap(params(`story=${STORY.storyId}&w=300&h=250&center=0,0&lat=1`), deps({ fetchImage: spy }));
    expect(fetched).toContain("center=-88.01");
  });
  it("a story with no pinned places has no map; Amazon errors never show the key", async () => {
    const noPins = fakeBackstory({ getStory: async () => ({ ...STORY, places: [] }) });
    expect((await handleMap(params(`story=${STORY.storyId}&w=300&h=250`), deps({ backstory: noPins }))).status).toBe(404);
    const res = await handleMap(params(`story=${STORY.storyId}&w=300&h=250`), deps({ fetchImage: async () => new Response("denied", { status: 403 }) }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret");
  });
});
