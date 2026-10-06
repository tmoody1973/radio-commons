import type { StoredPremium } from "./premiums";
import { tierById } from "./tiers";

/**
 * A listener's monthly membership: one small record in their Clerk privateMetadata (server-only), so "cancel my
 * membership" and "member since" work. ponytail: Clerk can't answer "who is due this month?"; a playlist database table
 * when a real scheduler runs (decision 008).
 */
export interface Membership {
  chargePermissionId: string;
  tierId: string;
  amount: string;
  startedAt: number;
  /** "2026-10": the last Milwaukee month charged. */
  lastChargedPeriod: string;
  status: "active" | "cancelled";
  /** The thank-you gift, when one ships: items, size, city and state only. The full address stays with Amazon Pay. */
  premium?: StoredPremium;
}

export interface MembershipStore {
  get(listenerId: string): Promise<Membership | null>;
  set(listenerId: string, membership: Membership): Promise<void>;
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Clerk metadata is data we wrote, but still checked: a malformed record, or an amount not on our tier list, reads as no membership. */
export function readMembership(metadata: unknown): Membership | null {
  const m = (metadata as { membership?: Partial<Membership> } | null)?.membership;
  if (!m || typeof m !== "object") return null;
  const ok = typeof m.chargePermissionId === "string" && m.chargePermissionId !== "" && typeof m.amount === "string" && tierById(m.tierId)?.amount === m.amount
    && typeof m.startedAt === "number" && typeof m.lastChargedPeriod === "string" && PERIOD.test(m.lastChargedPeriod)
    && (m.status === "active" || m.status === "cancelled");
  return ok ? (m as Membership) : null;
}

/** The Milwaukee calendar month of a moment, "2026-10". */
export const periodOf = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit" }).format(ms);

export function nextPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

export const isPeriod = (value: unknown): value is string => typeof value === "string" && PERIOD.test(value);

/** "November 2026". */
export const periodName = (period: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(`${period}-15T12:00:00Z`));

/** The Clerk-backed store, or null without CLERK_SECRET_KEY (the listener app's secret). */
export function clerkMemberships(secretKey = process.env.CLERK_SECRET_KEY): MembershipStore | null {
  if (!secretKey) return null;
  const client = import("@clerk/nextjs/server").then(({ createClerkClient }) => createClerkClient({ secretKey }));
  return {
    async get(listenerId) {
      const user = await (await client).users.getUser(listenerId);
      return readMembership(user.privateMetadata);
    },
    async set(listenerId, membership) {
      // updateUserMetadata merges, so other private metadata is kept.
      await (await client).users.updateUserMetadata(listenerId, { privateMetadata: { membership } });
    },
  };
}
