import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOW_IT_WORKS } from "@/lib/howItWorks";
import { LANDING } from "@/lib/landing";

describe("landing page content", () => {
  it("three things to ask, each with a real card image that exists", () => {
    expect(LANDING.pillars.map((p) => p.label)).toEqual(["Stories", "Music", "Events"]);
    for (const p of LANDING.pillars) {
      expect(existsSync(join(process.cwd(), "public", p.image))).toBe(true);
      expect(p.alt.length).toBeGreaterThan(20);
    }
  });
  it("the numbers match the research (Triton, Aug 2026: 40% vs 29% and 27%)", () => {
    expect(LANDING.stats[0].value).toBe("40%");
    expect(LANDING.stats[0].text).toMatch(/29%.*27%/);
  });
  it("the claim keeps its qualifier and links to the research", () => {
    expect(LANDING.claim).toMatch(/^As far as we can find/);
    expect(LANDING.links.research).toBe("https://github.com/tmoody1973/radio-commons/blob/main/docs/research/2026-10-04-landscape.md");
  });
  it("no demo section until a video exists", () => {
    expect(LANDING.demoVideoUrl).toBeNull();
  });
});

describe("judges page (/how-it-works)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the landing nav links to it as 'For judges'", () => {
    expect(LANDING.links.judges).toBe("/how-it-works");
    expect(read("src/app/page.tsx")).toContain("<a href={L.links.judges}>For judges</a>");
  });

  it("renders the five sections, in order, as h2 headings", () => {
    expect(Object.values(HOW_IT_WORKS.sections)).toEqual([
      "The two-session demo", "One sentence, five services", "What we remember, and how to erase it", "Built on Alexa+", "Status",
    ]);
    const page = read("src/app/how-it-works/page.tsx");
    const order = ["demo", "flow", "memory", "alexa", "status"].map((k) => page.indexOf(`{H.sections.${k}}</h2>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(page.indexOf("<Demo />")).toBeLessThan(page.indexOf("<Flow />"));
    expect(page.indexOf("<Memory />")).toBeLessThan(page.indexOf("<Alexa />"));
    expect(page.indexOf("<Alexa />")).toBeLessThan(page.indexOf("<Status />"));
  });

  it("the save runs across five services, in order", () => {
    expect(HOW_IT_WORKS.services.map((s) => s.name)).toEqual(["Playlist", "Finds", "Apple Music", "Concerts", "Backstory"]);
  });

  it("example replies don't invent shows or counts: the live parts stay bracketed", () => {
    for (const s of HOW_IT_WORKS.sessions) expect(s.reply).toMatch(/\[venue\].*\[day\]/);
  });

  it("every status row is live or in this release", () => {
    for (const row of HOW_IT_WORKS.status) expect(["Live", "In this release"]).toContain(row.state);
  });
});
