import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
