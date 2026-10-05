import { describe, expect, it, vi } from "vitest";
import { linkItems } from "@/lib/briefing";

const items = [
  { heading: "Un-beet-able", url: "https://radiomilwaukee.org/concerts/2026-09-30/milwaukee-concerts-this-week", summary: "Beet Street." },
  { heading: "A way forward", url: "https://radiomilwaukee.org/podcast/uniquely-milwaukee/2026-10-01/my-way-out-milwaukee", summary: "VR class." },
  { heading: "A new perspective", url: "https://radiomilwaukee.org/podcast/cinebuds/2026-09-30/milwaukee-muslim-film-festival-2026-schedule", summary: "Film fest." },
];

describe("linkItems", () => {
  it("Concert Picks → picks (no lookup); a published story → story; anything else → the page; newsletter order kept", async () => {
    const storyForPage = vi.fn(async (url: string) => {
      await new Promise((r) => setTimeout(r, url.includes("my-way-out") ? 20 : 1)); // resolve out of order
      return url.includes("my-way-out") ? { storyId: "jn7mwo", title: "Through tech and teaching, My Way Out provides a path forward" } : null;
    });
    const linked = await linkItems(items, { storyForPage });
    expect(linked.map((i) => i.action)).toEqual([
      { kind: "picks" },
      { kind: "story", storyId: "jn7mwo", title: "Through tech and teaching, My Way Out provides a path forward" },
      { kind: "page", url: items[2].url },
    ]);
    expect(storyForPage).not.toHaveBeenCalledWith(items[0].url);
  });
  it("a failed lookup is a page link, never a failed briefing", async () => {
    const linked = await linkItems([items[1]], { storyForPage: async () => { throw new Error("down"); } });
    expect(linked[0].action).toEqual({ kind: "page", url: items[1].url });
  });
});
