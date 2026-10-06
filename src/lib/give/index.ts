import { giveEnv, payClientFrom, type PayClient } from "./amazonPay";
import { clerkMemberships, nextPeriod, periodName, type Membership, type MembershipStore } from "./membership";
import { premiumFor } from "./premiums";
import { dollars, LEVELS, tierById, type Tier } from "./tiers";

/** What the give tools need. Null when the five Amazon Pay settings aren't all there: then nothing about giving runs. */
export interface Give {
  tokenSecret: string;
  pay: () => Promise<PayClient>;
  /** Null without Clerk's secret key: giving still works, nothing is remembered. */
  memberships: MembershipStore | null;
}

// One SDK client per server instance.
let payClient: Promise<PayClient> | undefined;

export function giveFromEnv(): Give | null {
  const env = giveEnv();
  if (!env) return null;
  return { tokenSecret: env.tokenSecret, pay: () => (payClient ??= payClientFrom(env)), memberships: clerkMemberships() };
}

export const CARD_LINK_TTL_MS = 15 * 60_000;
export const RETURN_LINK_TTL_MS = 60 * 60_000;

export const GIVE_SPEECH = "Thank you. Radio Milwaukee is listener-supported. This is a demo, so no real money moves. Pick monthly or one time and a level, plus a t-shirt size if it comes with one, and I'll open a secure Amazon Pay page. Or give anytime at radiomilwaukee.org slash give.";
export const GIVE_UNAVAILABLE_SPEECH = "Donations aren't set up yet. You can support Radio Milwaukee at radiomilwaukee.org.";
export const NO_MEMBERSHIP_SPEECH = "I don't see a monthly membership on your account. If you gave without linking, you can cancel at pay.amazon.com.";
export const CANCELLED_SPEECH = "Done. Your monthly membership is cancelled. Thank you for supporting Radio Milwaukee.";
export const CANCEL_FAILED_SPEECH = "I couldn't cancel that just now. Please try again in a minute, or cancel at pay.amazon.com.";
export const confirmCancelSpeech = (m: Membership) => `Cancel your ${dollars(m.amount)} monthly membership? You won't be charged again.`;

const monthDay = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);
export const memberLine = (m: Membership) => `And thanks for being a monthly member since ${monthDay(m.startedAt)}.`;

export const NOT_A_MEMBER_SPEECH = "You're not a member yet. Want to support Radio Milwaukee?";
export const MEMBERSHIP_CANCELLED_SPEECH = "Your monthly membership is cancelled, so you're not a member right now. Want to support Radio Milwaukee again?";
export const MEMBERSHIP_READ_FAILED_SPEECH = "I can't check your membership right now. Please try again in a minute.";

/** A membership put into words once, for my_membership's speech and its card. */
export interface MembershipFacts {
  level: string;
  /** "$20/mo" or "$240 once". */
  amount: string;
  since: string;
  /** "November 2026"; null for a one-time gift. */
  nextCharge: string | null;
  /** "Front Row package, size L"; null when no gift was chosen. */
  gift: string | null;
  perks: string;
  /** The next level up, or null at the top. */
  upgradeTo: string | null;
}

export function membershipFacts(m: Membership): MembershipFacts {
  const tier = tierById(m.tierId)!; // readMembership only passes records whose tier is on the list
  const monthly = tier.kind === "monthly";
  const premium = m.premium && `${tier.level} ${m.premium.items.length > 1 ? "package" : "gift"}${m.premium.size ? `, size ${m.premium.size}` : ""}`;
  const next = LEVELS[LEVELS.findIndex((level) => level.slug === tier.slug) + 1];
  return {
    level: tier.level, amount: monthly ? `${dollars(m.amount)}/mo` : `${dollars(m.amount)} once`, since: monthDay(m.startedAt),
    nextCharge: monthly ? periodName(nextPeriod(m.lastChargedPeriod)) : null, gift: premium ?? null, perks: premiumFor(tier).spoken, upgradeTo: next?.name ?? null,
  };
}

/** "Am I a member?": level, price, since, next charge month (no day: there is no real scheduler), gift and perks, and that it's a demo. */
export function membershipSpeech(m: Membership): string {
  const facts = membershipFacts(m);
  const price = facts.nextCharge ? `${dollars(m.amount)} a month since ${facts.since}. Next charge in ${facts.nextCharge.split(" ")[0]}.` : `${dollars(m.amount)} one time on ${facts.since}.`;
  const perks = facts.gift ? `Your ${facts.gift}${m.premium?.size ? "," : ""} includes ${facts.perks}.` : `${facts.level} includes ${facts.perks}.`;
  return `You're a ${facts.level} member: ${price} ${perks} This is a demo membership — no real money${facts.gift ? ", and nothing ships" : ""}.`;
}

/** "Upgrade me to Front Row": the level's price and gift; the give card opens on it. */
export function levelSpeech(tier: Tier): string {
  const premium = premiumFor(tier);
  const price = tier.kind === "monthly" ? `${dollars(tier.amount)} a month` : `${dollars(tier.amount)} one time`;
  return `Here's ${tier.level}: ${price}, with ${premium.spoken}. ${premium.sized ? "Pick your size and I'll" : "I'll"} open a secure Amazon Pay page. This is a demo, so no real money moves.`;
}
