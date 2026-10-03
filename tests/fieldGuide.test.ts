import { describe, expect, it } from "vitest";
import { createFieldGuideClient, FieldGuideUnavailable } from "@/lib/fieldGuide";
import { EVENT } from "./fixtures";

const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

describe("Field Guide client", () => {
  it("asks for events with only the settings given, and validates what comes back", async () => {
    let asked = "";
    const client = createFieldGuideClient({ baseUrl: "https://fg.test", fetch: async (url) => { asked = String(url); return ok({ events: [EVENT] })(); } });
    expect(await client.events({ when: "tonight", near: { lat: 43.06, lng: -87.99 }, radiusMiles: 1, free: true })).toEqual([EVENT]);
    expect(asked).toBe("https://fg.test/api/public/events?when=tonight&near=43.06%2C-87.99&radius=1&free=1");
  });
  it("a bad shape, an error status or a slow answer is 'unavailable', never partial data", async () => {
    await expect(createFieldGuideClient({ baseUrl: "https://fg.test", fetch: ok({ events: [{ title: 1 }] }) }).events({})).rejects.toBeInstanceOf(FieldGuideUnavailable);
    await expect(createFieldGuideClient({ baseUrl: "https://fg.test", fetch: async () => new Response("", { status: 500 }) }).picks()).rejects.toBeInstanceOf(FieldGuideUnavailable);
    const slow = createFieldGuideClient({ baseUrl: "https://fg.test", timeoutMs: 20, fetch: (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))) });
    await expect(slow.events({})).rejects.toBeInstanceOf(FieldGuideUnavailable);
  });
  it("waits up to two seconds by default, so a cold Field Guide still answers", async () => {
    // Like real fetch: answers after 1.2 s unless the deadline aborts it first.
    const coldButFine = createFieldGuideClient({ baseUrl: "https://fg.test", fetch: (_url, init) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ events: [EVENT] }))), 1200);
      init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); });
    }) });
    expect(await coldButFine.events({})).toEqual([EVENT]);
  });
});

