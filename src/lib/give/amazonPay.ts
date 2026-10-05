import { SITE } from "@/lib/card/tokens";
import type { Membership } from "./membership";
import type { Tier } from "./tiers";

/** Amazon's button docs use V2; the SDK's default is the older one, so it is set explicitly in both places. */
export const ALGORITHM = "AMZN-PAY-RSASSA-PSS-V2";
// ponytail: sandbox is a constant, not an env var. Real money is a deliberate code change, never a config flip.
export const SANDBOX = true;
const USD = "USD";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/**
 * Where Amazon sends the buyer back: always the fixed SITE, never a request header (an attacker-chosen Host would land
 * in a URL we sign). The one exception is a local dev server, whose own localhost origin is used so the flow works there.
 */
export function returnOrigin(headers: Headers, nodeEnv = process.env.NODE_ENV, site = SITE): string {
  if (nodeEnv !== "production") {
    const host = headers.get("host") ?? "";
    const origin = `${headers.get("x-forwarded-proto") ?? "http"}://${host}`;
    if (LOCAL_ORIGIN.test(origin) && !headers.get("x-forwarded-host")) return origin;
  }
  return new URL(site).origin;
}

export interface GiveEnv { publicKeyId: string; privateKey: string; merchantId: string; storeId: string; tokenSecret: string }

/** All five settings, or null: the tool and pages then say donations aren't set up, and nothing else changes. */
export function giveEnv(env: Record<string, string | undefined> = process.env): GiveEnv | null {
  const { AMAZON_PAY_PUBLIC_KEY_ID: publicKeyId, AMAZON_PAY_PRIVATE_KEY: pem, AMAZON_PAY_MERCHANT_ID: merchantId, AMAZON_PAY_STORE_ID: storeId, GIVE_TOKEN_SECRET: tokenSecret } = env;
  if (!publicKeyId || !pem || !merchantId || !storeId || !tokenSecret) return null;
  // Env files often store a PEM on one line with literal "\n"s.
  return { publicKeyId, privateKey: pem.replace(/\\n/g, "\n"), merchantId, storeId, tokenSecret };
}

interface ApiResponse { status: number; data: Record<string, unknown> }
/** The part of the SDK's WebStoreClient we use; tests pass a fake. */
export interface PayClient {
  generateButtonSignature(payload: string): string;
  getCheckoutSession(id: string): Promise<ApiResponse>;
  completeCheckoutSession(id: string, payload: object): Promise<ApiResponse>;
  createCharge(payload: object, headers: Record<string, string>): Promise<ApiResponse>;
  closeChargePermission(id: string, payload: object): Promise<ApiResponse>;
}

/** The SDK client. Node runtime only (it signs with node:crypto). */
export async function payClientFrom(env: GiveEnv): Promise<PayClient> {
  const { WebStoreClient } = await import("@amazonpay/amazon-pay-api-sdk-nodejs");
  return new WebStoreClient({ publicKeyId: env.publicKeyId, privateKey: env.privateKey, region: "us", sandbox: SANDBOX, algorithm: ALGORITHM }) as PayClient;
}

const money = (amount: string) => ({ amount, currencyCode: USD });

/** The APB ("Additional Payment Button") checkout: amount fixed and signed here, one trip to Amazon, wallet only. */
export function checkoutPayload(tier: Tier, storeId: string, returnUrl: string) {
  return {
    webCheckoutDetails: { checkoutResultReturnUrl: returnUrl, checkoutMode: "ProcessOrder" },
    storeId,
    chargePermissionType: tier.kind === "monthly" ? "Recurring" : "OneTime",
    ...(tier.kind === "monthly" ? { recurringMetadata: { frequency: { unit: "Month", value: "1" }, amount: money(tier.amount) } } : {}),
    paymentDetails: { paymentIntent: "AuthorizeWithCapture", chargeAmount: money(tier.amount), presentmentCurrency: USD },
    merchantMetadata: { merchantStoreName: "Radio Milwaukee (demo)", noteToBuyer: "DEMO: Amazon Pay sandbox, no real money." },
  };
}

/** What Amazon's checkout.js renderButton takes. The signature covers exactly payloadJSON, so the browser can't change the amount. */
export function buttonConfig(signer: Pick<PayClient, "generateButtonSignature">, env: Pick<GiveEnv, "merchantId" | "publicKeyId" | "storeId">, tier: Tier, returnUrl: string) {
  const payloadJSON = JSON.stringify(checkoutPayload(tier, env.storeId, returnUrl));
  return {
    merchantId: env.merchantId,
    publicKeyId: env.publicKeyId,
    ledgerCurrency: USD,
    checkoutLanguage: "en_US",
    productType: "PayOnly",
    placement: "Other",
    buttonColor: "Gold",
    sandbox: SANDBOX,
    createCheckoutSessionConfig: { payloadJSON, signature: signer.generateButtonSignature(payloadJSON), algorithm: ALGORITHM },
  };
}
export type ButtonConfig = ReturnType<typeof buttonConfig>;

export type CompleteResult =
  | { status: "paid"; chargePermissionId: string; reference: string }
  | { status: "pending"; chargePermissionId: string; reference: string }
  | { status: "mismatch" }
  | { status: "failed" };

const str = (value: unknown) => (typeof value === "string" ? value : "");
const field = (data: Record<string, unknown>, ...path: string[]) =>
  str(path.reduce<unknown>((at, key) => (at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined), data));
const logFailure = (step: string, error: unknown) => {
  const response = (error as { response?: { status?: number; data?: { reasonCode?: string } } })?.response;
  console.error(JSON.stringify({ event: "amazon_pay_failed", step, status: response?.status ?? null, reasonCode: response?.data?.reasonCode ?? null }));
};
const outcome = (status: "paid" | "pending", data: Record<string, unknown>): CompleteResult => {
  const chargePermissionId = field(data, "chargePermissionId");
  return { status, chargePermissionId, reference: field(data, "chargeId") || chargePermissionId };
};

/** Checks the session is for this tier (never trusting the URL alone), then completes it. 200 = paid, 202 = pending. */
export async function complete(pay: PayClient, sessionId: string, tier: Tier): Promise<CompleteResult> {
  try {
    const { data } = await pay.getCheckoutSession(sessionId);
    const type = tier.kind === "monthly" ? "Recurring" : "OneTime";
    const amountOk = field(data, "paymentDetails", "chargeAmount", "amount") === tier.amount && field(data, "paymentDetails", "chargeAmount", "currencyCode") === USD;
    if (!amountOk || field(data, "chargePermissionType") !== type) return { status: "mismatch" };
    const state = field(data, "statusDetails", "state");
    if (state === "Completed") return outcome("paid", data); // a reload of the thanks page
    if (state !== "Open") return { status: "failed" };
    const done = await pay.completeCheckoutSession(sessionId, { chargeAmount: money(tier.amount) });
    return outcome(done.status === 202 ? "pending" : "paid", done.data);
  } catch (error) {
    logFailure("complete", error);
    return { status: "failed" };
  }
}

/** One month's charge. The key makes a retry or a double click for the same period charge once. */
export async function chargeNextPeriod(pay: PayClient, membership: Membership, period: string): Promise<{ status: "charged"; reference: string } | { status: "declined" }> {
  try {
    const { data } = await pay.createCharge(
      { chargePermissionId: membership.chargePermissionId, chargeAmount: money(membership.amount), captureNow: true, canHandlePendingAuthorization: false },
      { "x-amz-pay-idempotency-key": `${membership.chargePermissionId}-${period}` },
    );
    return { status: "charged", reference: field(data, "chargeId") };
  } catch (error) {
    logFailure("charge", error);
    return { status: "declined" };
  }
}

export async function cancelMembership(pay: PayClient, chargePermissionId: string): Promise<void> {
  await pay.closeChargePermission(chargePermissionId, { closureReason: "Listener cancelled by voice", cancelPendingCharges: true });
}
