import { describe, expect, it } from "vitest";
import { chooseGift, giftLine, NO_GIFT, openGift, PREMIUMS, premiumFor, sealGift, ships, SIZES, storedPremium } from "@/lib/give/premiums";
import { tierById, type Tier } from "@/lib/give/tiers";

const SECRET = "a-test-secret-that-is-long-enough-000000";
const NOW = Date.parse("2026-10-05T15:00:00Z");
const tier = (id: string) => tierById(id) as Tier;

describe("premium catalog", () => {
  it("has the station's four gifts, keyed by level", () => {
    expect(Object.keys(PREMIUMS)).toEqual(["ga", "main-floor", "front-row", "vip"]);
    expect(PREMIUMS.ga).toMatchObject({ shipped: false, sized: false, line: "Green Room newsletter" });
    expect(PREMIUMS["main-floor"]).toMatchObject({ shipped: true, sized: true, line: "RadioMKE t-shirt" });
    expect(PREMIUMS["front-row"]).toMatchObject({ shipped: true, sized: true, line: "Merch package: t-shirt + sticker" });
    expect(PREMIUMS.vip).toMatchObject({ shipped: true, sized: true, line: "VIP: hat, t-shirt, sticker + Studio Milwaukee Sessions for two" });
    expect(SIZES).toEqual(["S", "M", "L", "XL", "XXL"]);
  });
  it("monthly and one-time at a level get the same gift", () => {
    expect(premiumFor(tier("front-row-monthly"))).toBe(premiumFor(tier("front-row-once")));
  });
});

describe("chooseGift (server-side check of the /give form)", () => {
  const frontRow = tier("front-row-monthly");
  it("no choice yet asks the form", () => {
    expect(chooseGift(frontRow, undefined, undefined)).toBe("unchosen");
  });
  it("a gift with a listed size is accepted", () => {
    for (const size of SIZES) expect(chooseGift(frontRow, "yes", size)).toEqual({ gift: true, size });
  });
  it("a t-shirt level needs a size, and only a listed one", () => {
    for (const size of [undefined, "", "XS", "xl", "XXXL", "L "]) expect(chooseGift(frontRow, "yes", size)).toBe("invalid");
  });
  it("no gift needs no size and ignores one", () => {
    expect(chooseGift(frontRow, "no", undefined)).toEqual(NO_GIFT);
    expect(chooseGift(frontRow, "no", "L")).toEqual(NO_GIFT);
  });
  it("anything else for gift is invalid", () => {
    expect(chooseGift(frontRow, "maybe", "L")).toBe("invalid");
  });
  it("General Admission has nothing to ship: no form, never a shipped gift", () => {
    const ga = tier("ga-monthly");
    expect(chooseGift(ga, undefined, undefined)).toEqual(NO_GIFT);
    expect(chooseGift(ga, "yes", "L")).toBe("invalid");
    expect(ships(ga, NO_GIFT)).toBe(false);
  });
  it("ships only a chosen, shipped gift", () => {
    expect(ships(frontRow, { gift: true, size: "L" })).toBe(true);
    expect(ships(frontRow, NO_GIFT)).toBe(false);
  });
});

describe("sealed gift choice", () => {
  const frontRow = tier("front-row-monthly");
  it("round-trips for the same tier and hides the choice", () => {
    const sealed = sealGift(frontRow, { gift: true, size: "L" }, SECRET, 60_000, NOW);
    expect(sealed).not.toContain("front-row");
    expect(openGift(sealed, SECRET, frontRow, NOW)).toEqual({ gift: true, size: "L" });
  });
  it("is refused for another tier, when expired, altered or missing", () => {
    const sealed = sealGift(frontRow, { gift: true, size: "L" }, SECRET, 60_000, NOW);
    expect(openGift(sealed, SECRET, tier("vip-monthly"), NOW)).toBeNull();
    expect(openGift(sealed, SECRET, frontRow, NOW + 60_001)).toBeNull();
    expect(openGift(sealed.slice(0, -2) + "AA", SECRET, frontRow, NOW)).toBeNull();
    expect(openGift(undefined, SECRET, frontRow, NOW)).toBeNull();
  });
  it("re-checks the catalog on open (a sealed but now-invalid size is refused)", () => {
    const sealed = sealGift(frontRow, { gift: true, size: "XS" as never }, SECRET, 60_000, NOW);
    expect(openGift(sealed, SECRET, frontRow, NOW)).toBeNull();
  });
});

describe("receipt line", () => {
  const frontRow = tier("front-row-once");
  it("names the gift, size, and only name, city and state", () => {
    expect(giftLine(frontRow, { gift: true, size: "L" }, { name: "Sam Rivera", city: "Milwaukee", state: "WI" }))
      .toBe("Front Row merch package (L) ships to Sam Rivera, Milwaukee, WI. Full address on file with Amazon Pay. Demo: nothing actually ships.");
  });
  it("without an address from Amazon still points to Amazon Pay", () => {
    expect(giftLine(frontRow, { gift: true, size: "L" }, null)).toBe("Front Row merch package (L) ships to the address on file with Amazon Pay. Demo: nothing actually ships.");
  });
  it("no gift thanks the listener", () => {
    expect(giftLine(frontRow, NO_GIFT, null)).toBe("No gift — thank you, it all goes to the station.");
  });
  it("General Admission names its newsletter", () => {
    expect(giftLine(tier("ga-once"), NO_GIFT, null)).toBe("Your thank-you: the Green Room newsletter.");
  });
});

describe("stored premium (privacy)", () => {
  it("keeps items, size, city and state only, marked not shipped", () => {
    const stored = storedPremium(tier("vip-monthly"), { gift: true, size: "M" }, { name: "Sam Rivera", city: "Milwaukee", state: "WI" });
    expect(stored).toEqual({ items: ["Hat", "RadioMKE t-shirt", "Sticker", "Studio Milwaukee Sessions for two"], size: "M", shipTo: { city: "Milwaukee", state: "WI" }, status: "sandbox — not shipped" });
    expect(JSON.stringify(stored)).not.toContain("Sam");
  });
  it("is nothing for no gift or a level that ships nothing", () => {
    expect(storedPremium(tier("vip-monthly"), NO_GIFT, null)).toBeUndefined();
    expect(storedPremium(tier("ga-monthly"), NO_GIFT, null)).toBeUndefined();
  });
});
