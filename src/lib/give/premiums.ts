import { open, seal } from "./token";
import type { Tier } from "./tiers";

/**
 * Each level's thank-you gift (radiomilwaukee.org/donate, read 2026-10-05). The server checks every gift choice and
 * size against this list; the browser's choice is never trusted. Research and flow: docs/GIVE-PREMIUMS.md.
 */
export const SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof SIZES)[number];

export interface Premium {
  /** On the receipt: "Front Row merch package". */
  name: string;
  /** On the card, under the level. */
  line: string;
  items: readonly string[];
  /** Has a t-shirt, so the listener picks a size. Hats are one size. */
  sized: boolean;
  /** Something goes in the mail, so Amazon Pay collects an address (PayAndShip). */
  shipped: boolean;
}

export const PREMIUMS: Readonly<Record<string, Premium>> = {
  ga: { name: "Green Room newsletter", line: "Green Room newsletter", items: ["Green Room newsletter"], sized: false, shipped: false },
  "main-floor": { name: "Main Floor gift: RadioMKE t-shirt", line: "RadioMKE t-shirt", items: ["RadioMKE t-shirt"], sized: true, shipped: true },
  "front-row": { name: "Front Row merch package", line: "Merch package: t-shirt + sticker", items: ["RadioMKE t-shirt", "Sticker"], sized: true, shipped: true },
  vip: {
    name: "VIP package", line: "VIP: hat, t-shirt, sticker + Studio Milwaukee Sessions for two",
    items: ["Hat", "RadioMKE t-shirt", "Sticker", "Studio Milwaukee Sessions for two"], sized: true, shipped: true,
  },
};

export const premiumFor = (tier: Tier): Premium => PREMIUMS[tier.slug];

export interface GiftChoice { gift: boolean; size: Size | null }
export const NO_GIFT: GiftChoice = { gift: false, size: null };

const isSize = (value: unknown): value is Size => SIZES.includes(value as Size);

/** The /give form's answer, checked: "unchosen" shows the form, "invalid" shows it again with a note. */
export function chooseGift(tier: Tier, gift: string | undefined, size: string | undefined): GiftChoice | "unchosen" | "invalid" {
  const premium = premiumFor(tier);
  if (!premium.shipped) return gift === undefined || gift === "no" ? NO_GIFT : "invalid";
  if (gift === undefined) return "unchosen";
  if (gift === "no") return NO_GIFT;
  if (gift !== "yes") return "invalid";
  if (!premium.sized) return { gift: true, size: null };
  return isSize(size) ? { gift: true, size } : "invalid";
}

/** True when Amazon Pay should collect a shipping address. */
export const ships = (tier: Tier, choice: GiftChoice) => choice.gift && premiumFor(tier).shipped;

/** The choice, sealed for the return URLs so it can't be edited after /give checked it. */
export const sealGift = (tier: Tier, choice: GiftChoice, secret: string, ttlMs: number, now = Date.now()) =>
  seal({ tier: tier.id, gift: choice.gift, size: choice.size }, secret, ttlMs, now);

/** The sealed choice for this tier, re-checked against the catalog, or null. */
export function openGift(token: string | undefined | null, secret: string, tier: Tier, now = Date.now()): GiftChoice | null {
  const value = open(token, secret, now) as { tier?: unknown; gift?: unknown; size?: unknown } | undefined;
  if (!value || typeof value !== "object" || value.tier !== tier.id) return null;
  if (value.gift === false) return NO_GIFT;
  const choice = chooseGift(tier, value.gift === true ? "yes" : undefined, typeof value.size === "string" ? value.size : undefined);
  return typeof choice === "object" ? choice : null;
}

/** Only what the receipt shows. The street never leaves Amazon Pay. */
export interface ShipTo { name: string; city: string; state: string }

const giftName = (tier: Tier, choice: GiftChoice) => `${premiumFor(tier).name}${choice.size ? ` (${choice.size})` : ""}`;

export function giftLine(tier: Tier, choice: GiftChoice, shipTo: ShipTo | null): string {
  const premium = premiumFor(tier);
  if (!premium.shipped) return `Your thank-you: the ${premium.name}.`;
  if (!ships(tier, choice)) return "No gift — thank you, it all goes to the station.";
  const where = shipTo ? `${shipTo.name}, ${shipTo.city}, ${shipTo.state}. Full address on file with Amazon Pay.` : "the address on file with Amazon Pay.";
  return `${giftName(tier, choice)} ships to ${where} Demo: nothing actually ships.`;
}

export interface StoredPremium { items: readonly string[]; size: Size | null; shipTo: { city: string; state: string } | null; status: "sandbox — not shipped" }

/** What the membership keeps: no name, street or postcode (privacy). Undefined when nothing ships. */
export function storedPremium(tier: Tier, choice: GiftChoice, shipTo: ShipTo | null): StoredPremium | undefined {
  if (!ships(tier, choice)) return undefined;
  return { items: premiumFor(tier).items, size: choice.size, shipTo: shipTo && { city: shipTo.city, state: shipTo.state }, status: "sandbox — not shipped" };
}
