import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOW_IT_WORKS } from "@/lib/howItWorks";
import { LANDING } from "@/lib/landing";
import { spokenDigest, spokenSaved } from "@/lib/speech";

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

// Majestic Theatre, Madison: 8 p.m. Tuesday, October 20 in Chicago time (the UTC date is the 21st).
const MAJESTIC = { venue: "Majestic Theatre", city: "Madison", startsAtMs: Date.parse("2026-10-21T01:00:00Z") };

describe("judges page (/how-it-works)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the landing nav links to it as 'For judges'", () => {
    expect(LANDING.links.judges).toBe("/how-it-works");
    expect(read("src/app/page.tsx")).toContain("<a href={L.links.judges}>For judges</a>");
  });

  it("renders the six sections, in order, as h2 headings", () => {
    expect(Object.values(HOW_IT_WORKS.sections)).toEqual([
      "The two-session demo", "One sentence, five services", "What we remember, and how to erase it", "Try a donation (sandbox)", "Built on Alexa+", "Status",
    ]);
    const page = read("src/app/how-it-works/page.tsx");
    const order = ["demo", "flow", "memory", "give", "alexa", "status"].map((k) => page.indexOf(`{H.sections.${k}}</h2>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(page.indexOf("<Demo />")).toBeLessThan(page.indexOf("<Flow />"));
    expect(page.indexOf("<Memory />")).toBeLessThan(page.indexOf("<Give />"));
    expect(page.indexOf("<Give />")).toBeLessThan(page.indexOf("<Alexa />"));
    expect(page.indexOf("<Alexa />")).toBeLessThan(page.indexOf("<Status />"));
  });

  it("the save runs across five services, in order", () => {
    expect(HOW_IT_WORKS.services.map((s) => s.name)).toEqual(["Playlist", "Finds", "Apple Music", "Concerts", "Backstory"]);
  });

  it("example replies are the real Oct 4 snapshot in the real spoken wording", () => {
    const [save, digest] = HOW_IT_WORKS.sessions;
    expect(HOW_IT_WORKS.sessionsData).toBe("Real data from the playlist, as of October 4, 2026");
    expect(save.reply).toBe(spokenSaved({
      status: "ok", findId: "f", appleMusic: "pending", artist: "Tank & The Bangas", title: "No ID", alreadySaved: false,
      artistId: "a", artistName: "Tank & The Bangas", firstFollow: true, nextShow: MAJESTIC, recentlySaved: false,
      story: { storyId: "s", title: "Studio Milwaukee Session: Tank & The Bangas", show: "Studio Milwaukee" },
    }));
    expect(digest.reply).toBe(spokenDigest([
      { kind: "spins", artistId: "a", artist: "Tank & The Bangas", total: 15, byStation: [{ station: "rhythmlab", count: 10 }, { station: "88nine", count: 3 }, { station: "hyfin", count: 2 }] },
      { kind: "show", artistId: "a", artist: "Tank & The Bangas", ...MAJESTIC },
    ]));
    expect(digest.reply).not.toMatch(/new .* story/);
  });

  it("the donation section sends judges to the Devpost testing instructions, with no credentials in the repo", () => {
    expect(HOW_IT_WORKS.give.credentials).toContain("Devpost testing instructions");
    expect(JSON.stringify(HOW_IT_WORKS.give)).not.toMatch(/password:|@.*\.(com|org)/i);
  });

  it("every status row is live or in this release", () => {
    for (const row of HOW_IT_WORKS.status) expect(["Live", "In this release"]).toContain(row.state);
    // The live site still searches about a day per station until this branch ships.
    expect(HOW_IT_WORKS.status.find((r) => r.feature === "Artist and title search")?.state).toBe("In this release");
  });
});

describe("who built it", () => {
  it("names Tarik's role and tenure on the landing footer and near the top of the judges page", async () => {
    const { LANDING } = await import("@/lib/landing");
    const { HOW_IT_WORKS } = await import("@/lib/howItWorks");
    expect(LANDING.footer).toContain("Director of Strategy and Innovation at Radio Milwaukee");
    expect(HOW_IT_WORKS.builtBy).toMatch(/nearly 20 years/);
  });
});
