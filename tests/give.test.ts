import { describe, expect, it, vi } from "vitest";
import { LEVELS, TIERS, tierById } from "@/lib/give/tiers";
import { openListener, sealListener } from "@/lib/give/token";
import { ALGORITHM, giveEnv, returnOrigin, buttonConfig, cancelMembership, chargeNextPeriod, checkoutPayload, complete, type PayClient } from "@/lib/give/amazonPay";
import { nextPeriod, periodOf, readMembership, type Membership } from "@/lib/give/membership";

const SECRET = "a-test-secret-that-is-long-enough-000000";
const NOW = Date.parse("2026-10-05T15:00:00Z");

describe("tiers", () => {
  it("are the station's four levels, monthly and one-time, at the real amounts", () => {
    expect(LEVELS.map((l) => [l.name, l.monthly, l.once])).toEqual([
      ["General Admission", "5.00", "60.00"], ["Main Floor", "10.00", "120.00"], ["Front Row", "20.00", "240.00"], ["VIP", "42.00", "500.00"],
    ]);
    expect(TIERS).toHaveLength(8);
    expect(tierById("main-floor-monthly")).toMatchObject({ kind: "monthly", amount: "10.00", level: "Main Floor" });
    expect(tierById("vip-once")).toMatchObject({ kind: "once", amount: "500.00" });
  });
  it("an unknown or inherited id is not a tier", () => {
    for (const id of ["monthly-10", "", "constructor", "__proto__", "vip-monthly ", undefined]) expect(tierById(id)).toBeUndefined();
  });
});

describe("sealed listener token", () => {
  it("round-trips the listener id and hides it", () => {
    const token = sealListener("user_42", SECRET, 15 * 60_000, NOW);
    expect(token).not.toContain("user_42");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(openListener(token, SECRET, NOW + 60_000)).toBe("user_42");
  });
  it("expires", () => {
    const token = sealListener("user_42", SECRET, 15 * 60_000, NOW);
    expect(openListener(token, SECRET, NOW + 15 * 60_000 + 1)).toBeNull();
  });
  it("rejects one changed character, a wrong key, garbage and no secret", () => {
    const token = sealListener("user_42", SECRET, 60_000, NOW);
    const i = Math.floor(token.length / 2);
    const tampered = token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
    expect(openListener(tampered, SECRET, NOW)).toBeNull();
    expect(openListener(token, "another-secret-another-secret-0000", NOW)).toBeNull();
    expect(openListener("nope", SECRET, NOW)).toBeNull();
    expect(openListener(token, "", NOW)).toBeNull();
    expect(() => sealListener("user_42", "", 60_000, NOW)).toThrow();
  });
});

describe("give env", () => {
  const FULL = { AMAZON_PAY_PUBLIC_KEY_ID: "SANDBOX-AAA", AMAZON_PAY_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----", AMAZON_PAY_MERCHANT_ID: "M1", AMAZON_PAY_STORE_ID: "amzn1.application-oa2-client.x", GIVE_TOKEN_SECRET: SECRET };
  it("is null when any of the five is missing", () => {
    expect(giveEnv(FULL)).toMatchObject({ publicKeyId: "SANDBOX-AAA", merchantId: "M1", storeId: FULL.AMAZON_PAY_STORE_ID, tokenSecret: SECRET });
    for (const key of Object.keys(FULL)) expect(giveEnv({ ...FULL, [key]: "" })).toBeNull();
  });
  it("turns a one-line PEM's literal \\n into newlines", () => {
    expect(giveEnv(FULL)!.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
  });
});

describe("checkout payload", () => {
  const url = "https://radio-commons.vercel.app/give/thanks?tier=main-floor-monthly&t=sealed";
  it("monthly: recurring APB, wallet only, the tier's amount", () => {
    const payload = checkoutPayload(tierById("main-floor-monthly")!, "store_1", url);
    expect(payload).toMatchObject({
      webCheckoutDetails: { checkoutResultReturnUrl: url, checkoutMode: "ProcessOrder" },
      storeId: "store_1",
      chargePermissionType: "Recurring",
      recurringMetadata: { frequency: { unit: "Month", value: "1" }, amount: { amount: "10.00", currencyCode: "USD" } },
      paymentDetails: { paymentIntent: "AuthorizeWithCapture", chargeAmount: { amount: "10.00", currencyCode: "USD" } },
    });
  });
  it("one-time: OneTime, no recurring metadata", () => {
    const payload = checkoutPayload(tierById("vip-once")!, "store_1", url);
    expect(payload.chargePermissionType).toBe("OneTime");
    expect(payload).not.toHaveProperty("recurringMetadata");
    expect(payload.paymentDetails.chargeAmount.amount).toBe("500.00");
  });
  it("the button config signs exactly the JSON it sends, in sandbox, with PSS V2, PayOnly", () => {
    const sign = vi.fn((json: string) => `sig:${json.length}`);
    const config = buttonConfig({ generateButtonSignature: sign }, { merchantId: "M1", publicKeyId: "SANDBOX-AAA", storeId: "store_1" }, tierById("ga-monthly")!, url);
    expect(sign).toHaveBeenCalledWith(config.createCheckoutSessionConfig.payloadJSON);
    expect(config).toMatchObject({ merchantId: "M1", publicKeyId: "SANDBOX-AAA", sandbox: true, productType: "PayOnly", ledgerCurrency: "USD" });
    expect(config.createCheckoutSessionConfig.algorithm).toBe(ALGORITHM);
    expect(ALGORITHM).toBe("AMZN-PAY-RSASSA-PSS-V2");
    expect(JSON.parse(config.createCheckoutSessionConfig.payloadJSON).paymentDetails.chargeAmount.amount).toBe("5.00");
  });
});

const session = (over: Record<string, unknown> = {}) => ({
  checkoutSessionId: "cs_1",
  statusDetails: { state: "Open" },
  chargePermissionType: "Recurring",
  paymentDetails: { chargeAmount: { amount: "10.00", currencyCode: "USD" } },
  ...over,
});

function fakePay(over: Partial<PayClient> = {}): PayClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    generateButtonSignature: () => "sig",
    getCheckoutSession: async (id) => { calls.push(`get:${id}`); return { status: 200, data: session() }; },
    completeCheckoutSession: async (id, body) => { calls.push(`complete:${id}:${JSON.stringify(body)}`); return { status: 200, data: { ...session(), statusDetails: { state: "Completed" }, chargePermissionId: "B01-1", chargeId: "S01-1" } }; },
    createCharge: async (body, headers) => { calls.push(`charge:${JSON.stringify(body)}:${headers["x-amz-pay-idempotency-key"]}`); return { status: 201, data: { chargeId: `S01-${headers["x-amz-pay-idempotency-key"]}`, statusDetails: { state: "Captured" } } }; },
    closeChargePermission: async (id, body) => { calls.push(`close:${id}:${JSON.stringify(body)}`); return { status: 200, data: {} }; },
    ...over,
  };
}

describe("complete", () => {
  const tier = tierById("main-floor-monthly")!;
  it("200 is paid, with the charge permission and the tier's amount sent back", async () => {
    const pay = fakePay();
    expect(await complete(pay, "cs_1", tier)).toEqual({ status: "paid", chargePermissionId: "B01-1", reference: "S01-1" });
    expect(pay.calls[1]).toBe('complete:cs_1:{"chargeAmount":{"amount":"10.00","currencyCode":"USD"}}');
  });
  it("202 is pending", async () => {
    const pay = fakePay({ completeCheckoutSession: async () => ({ status: 202, data: { ...session(), chargePermissionId: "B01-1" } }) });
    expect(await complete(pay, "cs_1", tier)).toMatchObject({ status: "pending", chargePermissionId: "B01-1" });
  });
  it("refuses a session whose amount or type isn't the tier's, without completing it", async () => {
    for (const over of [{ paymentDetails: { chargeAmount: { amount: "1.00", currencyCode: "USD" } } }, { chargePermissionType: "OneTime" }, { paymentDetails: { chargeAmount: { amount: "10.00", currencyCode: "EUR" } } }]) {
      const pay = fakePay({ getCheckoutSession: async () => ({ status: 200, data: session(over) }) });
      expect(await complete(pay, "cs_1", tier)).toEqual({ status: "mismatch" });
      expect(pay.calls.some((c) => c.startsWith("complete"))).toBe(false);
    }
  });
  it("an already completed session (a reload) is shown as paid without completing again", async () => {
    const pay = fakePay({ getCheckoutSession: async () => ({ status: 200, data: session({ statusDetails: { state: "Completed" }, chargePermissionId: "B01-1", chargeId: "S01-1" }) }) });
    expect(await complete(pay, "cs_1", tier)).toMatchObject({ status: "paid", chargePermissionId: "B01-1" });
    expect(pay.calls.some((c) => c.startsWith("complete"))).toBe(false);
  });
  it("a declined or failed call is failed, never thrown", async () => {
    const pay = fakePay({ completeCheckoutSession: async () => { throw Object.assign(new Error("400"), { response: { status: 400, data: { reasonCode: "PaymentMethodNotAllowed" } } }); } });
    expect(await complete(pay, "cs_1", tier)).toEqual({ status: "failed" });
    expect(await complete(fakePay({ getCheckoutSession: async () => ({ status: 200, data: session({ statusDetails: { state: "Canceled" } }) }) }), "cs_1", tier)).toEqual({ status: "failed" });
  });
});

const MEMBER: Membership = { chargePermissionId: "B01-1", tierId: "main-floor-monthly", amount: "10.00", startedAt: NOW, lastChargedPeriod: "2026-10", status: "active" };

describe("chargeNextPeriod", () => {
  it("charges the stored amount with idempotency key <chargePermissionId>-<period>", async () => {
    const pay = fakePay();
    const result = await chargeNextPeriod(pay, MEMBER, "2026-11");
    expect(result).toEqual({ status: "charged", reference: "S01-B01-1-2026-11" });
    expect(pay.calls[0]).toBe('charge:{"chargePermissionId":"B01-1","chargeAmount":{"amount":"10.00","currencyCode":"USD"},"captureNow":true,"canHandlePendingAuthorization":false}:B01-1-2026-11');
  });
  it("the same period twice sends the same key (Amazon charges once)", async () => {
    const pay = fakePay();
    await chargeNextPeriod(pay, MEMBER, "2026-11");
    await chargeNextPeriod(pay, MEMBER, "2026-11");
    expect(pay.calls[0]).toBe(pay.calls[1]);
  });
  it("a decline is declined, never thrown", async () => {
    const pay = fakePay({ createCharge: async () => { throw Object.assign(new Error("400"), { response: { status: 400 } }); } });
    expect(await chargeNextPeriod(pay, MEMBER, "2026-11")).toEqual({ status: "declined" });
  });
});

describe("cancelMembership", () => {
  it("closes the charge permission and cancels pending charges", async () => {
    const pay = fakePay();
    await cancelMembership(pay, "B01-1");
    expect(pay.calls).toEqual(['close:B01-1:{"closureReason":"Listener cancelled by voice","cancelPendingCharges":true}']);
  });
});

describe("membership periods and records", () => {
  it("periods are Milwaukee months", () => {
    expect(periodOf(Date.parse("2026-11-01T03:00:00Z"))).toBe("2026-10"); // 10 PM Oct 31 in Milwaukee
    expect(nextPeriod("2026-10")).toBe("2026-11");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });
  it("reads only a well-formed membership from Clerk metadata", () => {
    expect(readMembership({ membership: MEMBER })).toEqual(MEMBER);
    expect(readMembership({})).toBeNull();
    expect(readMembership({ membership: { ...MEMBER, amount: 10 } })).toBeNull();
    expect(readMembership({ membership: { ...MEMBER, status: "weird" } })).toBeNull();
    expect(readMembership(null)).toBeNull();
  });
});

describe("return URL origin", () => {
  const SITE = "https://radio-commons.vercel.app";
  const h = (headers: Record<string, string | undefined>) => new Headers(Object.entries(headers).filter((pair): pair is [string, string] => pair[1] !== undefined));
  it("in production is always SITE, whatever Host or X-Forwarded-Host say", () => {
    for (const headers of [
      { host: "evil.example" }, { host: "radio-commons.vercel.app", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
      { host: "localhost:3000" }, { "x-forwarded-host": "localhost:3000" }, {},
    ]) expect(returnOrigin(h(headers), "production", SITE)).toBe(SITE);
  });
  it("the page's return URL can't be steered by a spoofed host in production", () => {
    const url = `${returnOrigin(h({ host: "evil.example", "x-forwarded-host": "evil.example" }), "production", SITE)}/give/thanks?tier=ga-monthly`;
    const config = buttonConfig({ generateButtonSignature: () => "sig" }, { merchantId: "M1", publicKeyId: "K", storeId: "S" }, tierById("ga-monthly")!, url);
    expect(JSON.parse(config.createCheckoutSessionConfig.payloadJSON).webCheckoutDetails.checkoutResultReturnUrl).toBe(`${SITE}/give/thanks?tier=ga-monthly`);
  });
  it("in development allows only an exact localhost or 127.0.0.1 origin", () => {
    expect(returnOrigin(h({ host: "localhost:3000" }), "development", SITE)).toBe("http://localhost:3000");
    expect(returnOrigin(h({ host: "127.0.0.1:3077" }), "development", SITE)).toBe("http://127.0.0.1:3077");
    for (const headers of [{ host: "localhost.evil.example" }, { host: "evil.example" }, { host: "localhost:3000", "x-forwarded-host": "evil.example" }, { host: "localhost:3000/x" }, { host: "localhost:3000", "x-forwarded-proto": "javascript" }]) {
      expect(returnOrigin(h(headers), "development", SITE)).toBe(SITE);
    }
  });
});
