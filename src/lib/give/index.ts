import { giveEnv, payClientFrom, type PayClient } from "./amazonPay";
import { clerkMemberships, type Membership, type MembershipStore } from "./membership";
import { dollars } from "./tiers";

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

export const GIVE_SPEECH = "Thank you. Radio Milwaukee is listener-supported. This is a demo, so no real money moves. Pick monthly or one time and a level on the card; levels with a t-shirt let you pick a size on the screen. Then I'll open a secure Amazon Pay page.";
export const GIVE_UNAVAILABLE_SPEECH = "Donations aren't set up yet. You can support Radio Milwaukee at radiomilwaukee.org.";
export const NO_MEMBERSHIP_SPEECH = "I don't see a monthly membership on your account. If you gave without linking, you can cancel at pay.amazon.com.";
export const CANCELLED_SPEECH = "Done. Your monthly membership is cancelled. Thank you for supporting Radio Milwaukee.";
export const CANCEL_FAILED_SPEECH = "I couldn't cancel that just now. Please try again in a minute, or cancel at pay.amazon.com.";
export const confirmCancelSpeech = (m: Membership) => `Cancel your ${dollars(m.amount)} monthly membership? You won't be charged again.`;

const monthDay = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);
export const memberLine = (m: Membership) => `And thanks for being a monthly member since ${monthDay(m.startedAt)}.`;
