import { describe, expect, it } from "vitest";
import { finishCheckout } from "@/lib/give/checkout";
import { handleSimulate } from "@/app/api/give/simulate-next-month/route";
import { sealListener } from "@/lib/give/token";
import { sealGift } from "@/lib/give/premiums";
import { tierById, type Tier } from "@/lib/give/tiers";
import type { Give } from "@/lib/give";
import type { PayClient } from "@/lib/give/amazonPay";
import type { Membership, MembershipStore } from "@/lib/give/membership";

const SECRET = "a-test-secret-that-is-long-enough-000000";
const NOW = Date.parse("2026-10-05T15:00:00Z");
const MEMBER: Membership = { chargePermissionId: "B01-1", tierId: "main-floor-monthly", amount: "10.00", startedAt: NOW, lastChargedPeriod: "2026-10", status: "active" };
const token = (id = "user_1") => sealListener(id, SECRET, 60 * 60_000, NOW);

function memoryStore(initial: Record<string, Membership> = {}): MembershipStore & { saved: Record<string, Membership> } {
  const saved = { ...initial };
  return { saved, get: async (id) => saved[id] ?? null, set: async (id, m) => { saved[id] = m; } };
}

function setup(store: MembershipStore | null = memoryStore(), over: Partial<PayClient> = {}) {
  const charges: string[] = [];
  const addressReads: string[] = [];
  const pay: PayClient = {
    generateButtonSignature: () => "sig",
    getCheckoutSession: async () => ({ status: 200, data: { statusDetails: { state: "Open" }, chargePermissionType: "Recurring", paymentDetails: { chargeAmount: { amount: "10.00", currencyCode: "USD" } } } }),
    completeCheckoutSession: async () => ({ status: 200, data: { chargePermissionId: "B01-1", chargeId: "S01-1" } }),
    createCharge: async (_body, headers) => { charges.push(headers["x-amz-pay-idempotency-key"]); return { status: 201, data: { chargeId: `S01-${charges.length}` } }; },
    closeChargePermission: async () => ({ status: 200, data: {} }),
    updateCheckoutSession: async () => ({ status: 200, data: {} }),
    getChargePermission: async (id) => { addressReads.push(id); return { status: 200, data: { shippingAddress: ADDRESS } }; },
    ...over,
  };
  const give: Give = { tokenSecret: SECRET, pay: async () => pay, memberships: store };
  return { give, charges, addressReads };
}

const ADDRESS = { name: "Sam Rivera", addressLine1: "720 E Capitol Dr", city: "Milwaukee", stateOrRegion: "WI", postalCode: "53212", countryCode: "US" };
const gift = (tierId: string, size: "L" | null = "L") => sealGift(tierById(tierId) as Tier, size ? { gift: true, size } : { gift: false, size: null }, SECRET, 60 * 60_000, NOW);

describe("finishCheckout with a thank-you gift", () => {
  it("a shipped gift reads the address and keeps only items, size, city and state with the membership", async () => {
    const store = memoryStore();
    const { give, addressReads } = setup(store);
    const result = await finishCheckout({ give, tierId: "main-floor-monthly", token: token(), gift: gift("main-floor-monthly"), sessionId: "cs-1", now: NOW });
    expect(result).toMatchObject({ kind: "paid", choice: { gift: true, size: "L" }, shipTo: { name: "Sam Rivera", city: "Milwaukee", state: "WI" } });
    expect(addressReads).toEqual(["B01-1"]);
    expect(store.saved.user_1.premium).toEqual({ items: ["RadioMKE t-shirt"], size: "L", shipTo: { city: "Milwaukee", state: "WI" }, status: "sandbox — not shipped" });
    const saved = JSON.stringify(store.saved);
    for (const secret of ["Sam", "Capitol", "53212"]) expect(saved).not.toContain(secret);
  });

  it("no gift reads no address and stores no premium", async () => {
    const store = memoryStore();
    const { give, addressReads } = setup(store);
    const result = await finishCheckout({ give, tierId: "main-floor-monthly", token: token(), gift: gift("main-floor-monthly", null), sessionId: "cs-1", now: NOW });
    expect(result).toMatchObject({ kind: "paid", choice: { gift: false }, shipTo: null });
    expect(addressReads).toEqual([]);
    expect(store.saved.user_1).toEqual(MEMBER);
  });

  it("a missing, altered or other tier's gift token counts as no gift", async () => {
    for (const g of [undefined, "garbage", gift("vip-monthly")]) {
      const { give, addressReads } = setup(memoryStore());
      expect(await finishCheckout({ give, tierId: "main-floor-monthly", token: token(), gift: g, sessionId: "cs-1", now: NOW })).toMatchObject({ choice: { gift: false }, shipTo: null });
      expect(addressReads).toEqual([]);
    }
  });

  it("a one-time gift shows where it ships and stores nothing", async () => {
    const store = memoryStore();
    const { give } = setup(store, { getCheckoutSession: async () => ({ status: 200, data: { statusDetails: { state: "Open" }, chargePermissionType: "OneTime", paymentDetails: { chargeAmount: { amount: "120.00", currencyCode: "USD" } } } }) });
    expect(await finishCheckout({ give, tierId: "main-floor-once", token: token(), gift: gift("main-floor-once"), sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "paid", shipTo: { city: "Milwaukee" }, recorded: null });
    expect(store.saved).toEqual({});
  });
});

describe("finishCheckout (/give/thanks)", () => {
  it("an unknown tier is not found; no setup is not set up", async () => {
    expect(await finishCheckout({ give: setup().give, tierId: "monthly-10", token: null, sessionId: "cs-1", now: NOW })).toEqual({ kind: "not_found" });
    expect(await finishCheckout({ give: null, tierId: "main-floor-monthly", token: null, sessionId: "cs-1", now: NOW })).toEqual({ kind: "not_set_up" });
  });

  it("a linked monthly gift is paid and recorded as an active membership for this month", async () => {
    const store = memoryStore();
    const result = await finishCheckout({ give: setup(store).give, tierId: "main-floor-monthly", token: token(), sessionId: "cs-1", now: NOW });
    expect(result).toMatchObject({ kind: "paid", reference: "S01-1", recorded: true, nextPeriod: "2026-11" });
    expect(store.saved.user_1).toEqual(MEMBER);
  });

  it("a reload keeps the original start date", async () => {
    const store = memoryStore({ user_1: { ...MEMBER, startedAt: 1 } });
    await finishCheckout({ give: setup(store).give, tierId: "main-floor-monthly", token: token(), sessionId: "cs-1", now: NOW });
    expect(store.saved.user_1.startedAt).toBe(1);
  });

  it("an unlinked or expired-token monthly gift is paid but not recorded", async () => {
    const store = memoryStore();
    for (const t of [null, "garbage", sealListener("user_1", SECRET, 1, NOW - 10)]) {
      expect(await finishCheckout({ give: setup(store).give, tierId: "main-floor-monthly", token: t, sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "paid", recorded: null });
    }
    expect(store.saved).toEqual({});
  });

  it("a one-time gift stores nothing", async () => {
    const store = memoryStore();
    const { give } = setup(store, { getCheckoutSession: async () => ({ status: 200, data: { statusDetails: { state: "Open" }, chargePermissionType: "OneTime", paymentDetails: { chargeAmount: { amount: "120.00", currencyCode: "USD" } } } }) });
    expect(await finishCheckout({ give, tierId: "main-floor-once", token: token(), sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "paid", recorded: null });
    expect(store.saved).toEqual({});
  });

  it("an amount mismatch or a bad session id fails without recording", async () => {
    const store = memoryStore();
    const { give } = setup(store, { getCheckoutSession: async () => ({ status: 200, data: { statusDetails: { state: "Open" }, chargePermissionType: "Recurring", paymentDetails: { chargeAmount: { amount: "1.00", currencyCode: "USD" } } } }) });
    expect(await finishCheckout({ give, tierId: "main-floor-monthly", token: token(), sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "failed" });
    expect(await finishCheckout({ give: setup(store).give, tierId: "main-floor-monthly", token: token(), sessionId: "../x", now: NOW })).toMatchObject({ kind: "failed" });
    expect(await finishCheckout({ give: setup(store).give, tierId: "main-floor-monthly", token: token(), sessionId: null, now: NOW })).toMatchObject({ kind: "failed" });
    expect(store.saved).toEqual({});
  });

  it("a 202 is pending (and still recorded: the permission exists)", async () => {
    const { give } = setup(memoryStore(), { completeCheckoutSession: async () => ({ status: 202, data: { chargePermissionId: "B01-1" } }) });
    expect(await finishCheckout({ give, tierId: "main-floor-monthly", token: token(), sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "pending", recorded: true });
  });

  it("a failed Clerk write still shows the receipt, flagged", async () => {
    const failing: MembershipStore = { get: async () => null, set: async () => { throw new Error("clerk down"); } };
    expect(await finishCheckout({ give: setup(failing).give, tierId: "main-floor-monthly", token: token(), sessionId: "cs-1", now: NOW })).toMatchObject({ kind: "paid", recorded: false });
  });
});

describe("POST /api/give/simulate-next-month", () => {
  const post = (give: Give | null, body: unknown) => handleSimulate({ give, body, now: NOW });

  it("charges the next month once, keyed <chargePermissionId>-<period>, and records it", async () => {
    const store = memoryStore({ user_1: MEMBER });
    const { give, charges } = setup(store);
    const res = await post(give, { t: token(), period: "2026-11" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "charged", period: "2026-11", label: "November 2026", amount: "10.00", reference: "S01-1", next: "2026-12" });
    expect(charges).toEqual(["B01-1-2026-11"]);
    expect(store.saved.user_1.lastChargedPeriod).toBe("2026-11");
  });

  it("a double click for the same month charges once", async () => {
    const { give, charges } = setup(memoryStore({ user_1: MEMBER }));
    await post(give, { t: token(), period: "2026-11" });
    const again = await post(give, { t: token(), period: "2026-11" });
    expect(await again.json()).toMatchObject({ status: "already", period: "2026-11", next: "2026-12" });
    expect(charges).toEqual(["B01-1-2026-11"]);
  });

  it("refuses a skipped month, a bad period, a bad token, no membership, and no setup", async () => {
    const { give, charges } = setup(memoryStore({ user_1: MEMBER, user_2: { ...MEMBER, status: "cancelled" } }));
    expect((await post(give, { t: token(), period: "2027-03" })).status).toBe(409);
    expect((await post(give, { t: token(), period: "next" })).status).toBe(400);
    expect((await post(give, { t: "garbage", period: "2026-11" })).status).toBe(401);
    expect((await post(give, null)).status).toBe(401);
    expect((await post(give, { t: token("user_2"), period: "2026-11" })).status).toBe(404);
    expect((await post(give, { t: token("user_3"), period: "2026-11" })).status).toBe(404);
    expect((await post(null, { t: token(), period: "2026-11" })).status).toBe(503);
    expect(charges).toEqual([]);
  });

  it("a decline is reported and nothing is recorded", async () => {
    const store = memoryStore({ user_1: MEMBER });
    const { give } = setup(store, { createCharge: async () => { throw Object.assign(new Error("402"), { response: { status: 400 } }); } });
    const res = await post(give, { t: token(), period: "2026-11" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ status: "declined" });
    expect(store.saved.user_1.lastChargedPeriod).toBe("2026-10");
  });
});
