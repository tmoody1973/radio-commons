import { complete } from "./amazonPay";
import type { Give } from "./index";
import { nextPeriod, periodOf } from "./membership";
import { openListener } from "./token";
import { tierById, type Tier } from "./tiers";

// Amazon's Checkout Session ids are UUID-like; anything else never reaches the API.
const SESSION_ID = /^[A-Za-z0-9-]{1,100}$/;

export type ThanksResult =
  | { kind: "not_found" }
  | { kind: "not_set_up" }
  | { kind: "failed"; tier: Tier }
  /** recorded: true saved, false the save failed, null nothing to save (one-time or not linked). */
  | (Paid & { kind: "paid" })
  | (Paid & { kind: "pending" });
interface Paid { tier: Tier; reference: string; recorded: boolean | null; nextPeriod: string }

interface FinishInput { give: Give | null; tierId: string | undefined; token: string | null | undefined; sessionId: string | null | undefined; now: number }

/** /give/thanks: complete the checkout Amazon sent back, then (monthly, linked) remember the membership. */
export async function finishCheckout({ give, tierId, token, sessionId, now }: FinishInput): Promise<ThanksResult> {
  const tier = tierById(tierId);
  if (!tier) return { kind: "not_found" };
  if (!give) return { kind: "not_set_up" };
  if (!sessionId || !SESSION_ID.test(sessionId)) return { kind: "failed", tier };
  const result = await complete(await give.pay(), sessionId, tier);
  if (result.status === "mismatch" || result.status === "failed") return { kind: "failed", tier };
  const listenerId = tier.kind === "monthly" ? openListener(token, give.tokenSecret, now) : null;
  const recorded = listenerId ? await record(give, listenerId, tier, result.chargePermissionId, now) : null;
  return { kind: result.status, tier, reference: result.reference, recorded, nextPeriod: nextPeriod(periodOf(now)) };
}

// ponytail: joining again overwrites the record; the earlier Charge Permission stays open at Amazon (sandbox only).
async function record(give: Give, listenerId: string, tier: Tier, chargePermissionId: string, now: number): Promise<boolean> {
  if (!give.memberships || !chargePermissionId) return false;
  try {
    const existing = await give.memberships.get(listenerId);
    if (existing?.chargePermissionId === chargePermissionId) return true; // a reload of the thanks page
    await give.memberships.set(listenerId, { chargePermissionId, tierId: tier.id, amount: tier.amount, startedAt: now, lastChargedPeriod: periodOf(now), status: "active" });
    return true;
  } catch {
    console.error(JSON.stringify({ event: "membership_write_failed" }));
    return false;
  }
}
