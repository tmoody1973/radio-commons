# Radio Commons: "Support Radio Milwaukee" with Amazon Pay (sandbox demo) — design

**Date:** 2026-10-05 · **Status:** draft for Tarik's approval · **Owner:** Tarik Moody (decisions), Claude (draft)
**Research:** `docs/research/2026-10-05-amazon-pay-sandbox-donations.md` (sources and quotes for every Amazon Pay claim below)
**Decision record draft:** `docs/decisions/007-amazon-pay-sandbox-donations.md`

## Goal

A listener says "I want to support Radio Milwaukee" and, in under a minute, becomes a monthly member (or makes a one-time gift) with Amazon Pay, from a card Alexa shows them. Later they can say "cancel my membership" and it is cancelled. Everything runs in Amazon Pay's **sandbox** (Amazon's test environment: fake cards, no real money), and every screen says **DEMO**. The station approved sandbox only.

Why it matters for judging: it closes the loop from "listener hears the station" to "listener funds the station" (Potential Impact), and monthly giving is the core of public radio's revenue, which Alexa+'s own checkout doesn't offer today (its reference page mentions no recurring payments, and it needs onboarding through an Amazon Solutions Architect).

## The demo, exactly

**Voice, turn 1**
> **Listener:** Alexa, I want to support Radio Milwaukee.
> **Alexa:** Thank you. Radio Milwaukee is listener-supported. This is a demo, so no real money moves. Pick one time or monthly and an amount on the card, and I'll open a secure Amazon Pay page.

**Card (MCP App, light and dark, existing tokens)**
- Title "Support Radio Milwaukee", a **DEMO · no real charge** badge.
- Two-way switch: **Monthly** (selected) | **One-time**.
- Three amount buttons: **$10 · $25 · $50** (amounts are an open question for Tarik).
- Each button opens the `/give` page with `openLink`. Under the buttons: "Or open radio-commons.vercel.app/give on your phone" and a QR code of the same link, for an Echo Show where opening a browser is not confirmed.

**Screen: `/give` (listener's phone or browser)**
- Banner across the top: **DEMO — Amazon Pay sandbox. No real money is charged.**
- "**$10 every month** to Radio Milwaukee. Today: $10.00. No fees or tax added. Cancel any time by voice or at pay.amazon.com."
- The gold **Amazon Pay** button. Nothing else to fill in.

**Screen: Amazon Pay's sandbox page.** The listener signs in with the sandbox test buyer and confirms. (Amazon's page, not ours.)

**Screen: `/give/thanks`**
- "**Thank you. You're a monthly member (demo).**"
- Receipt: "$10.00 · October 5, 2026 · Amazon Pay reference P01-…-…" (Alexa+ requires "deliver a receipt").
- "To cancel, say: Alexa, cancel my Radio Milwaukee membership."
- Sandbox only: a **Simulate next month** button → "Charged $10.00 for November (simulated)", with a new reference.

**Voice, later**
> **Listener:** Alexa, what's new for me?
> **Alexa:** (the usual digest) … And thanks for being a monthly member since October 5.

> **Listener:** Alexa, cancel my Radio Milwaukee membership.
> **Alexa:** Cancel your $10 monthly membership? You won't be charged again.
> **Listener:** Yes.
> **Alexa:** Done. Your monthly membership is cancelled. Thank you for supporting Radio Milwaukee.

## How it works, step by step

1. **Voice → tool.** Alexa calls the new tool `support_radio_milwaukee` (no linked account needed). If the listener's account is linked, the tool already knows their listener id (the existing `listenerIdFrom`; non-auth tools still receive it).
2. **Tool → card.** The tool returns the short reply and a card whose six buttons point to `https://radio-commons.vercel.app/give?tier=monthly-10&t=<sealed>`. `t` is a token sealed with AES-256-GCM (encryption that also detects tampering) holding `{ listenerId, expires: now + 15 min }`. An unlinked listener gets no `t`. No name, email or readable id goes in the URL.
3. **`/give` page (server component).** Reads `tier` and looks it up in a fixed list (`monthly-10` → $10.00 monthly; anything not in the list → 404). Opens `t` if present. Builds the Amazon Pay payload on the server: APB checkout (Amazon's "Additional Payment Button" variant: amount fixed up front, one trip to Amazon), `checkoutMode: "ProcessOrder"`, `productType: "PayOnly"` (wallet only, no shipping), `paymentIntent: "AuthorizeWithCapture"`, the amount, and for monthly `chargePermissionType: "Recurring"` with `recurringMetadata: { frequency: { unit: "Month", value: "1" }, amount }`. `checkoutResultReturnUrl` = `/give/thanks?tier=…&t=<fresh sealed token, 1 hour>`. Signs it with the SDK's `generateButtonSignature`. The page renders Amazon's `checkout.js` button with `sandbox: true`.
4. **Amazon Pay sandbox.** The listener approves. Amazon sends them to `/give/thanks?…&amazonCheckoutSessionId=…`.
5. **`/give/thanks` (server).** `getCheckoutSession(id)`; check its amount and type match `tier` from our list (never trust the URL alone); `completeCheckoutSession(id, { chargeAmount })`. A 200 means paid; a 202 means pending (show "processing, check back in a minute"). Any other result: a plain "That didn't go through; nothing was charged" with a retry link.
6. **Record (monthly only, linked listener only).** Save `{ chargePermissionId, amount, startedAt, lastChargedPeriod: "2026-10", status: "active" }` to the listener's Clerk `privateMetadata` (a server-only data slot on each Clerk user; see "Storage" below). One-time gifts store nothing: Amazon holds the receipt and the thanks page shows it.
7. **"What's new for me".** The existing `whats_new_for_me` tool reads the membership in parallel with the digest and adds one sentence if the listener is an active member. About 30 minutes of work, so it is in.
8. **Cancel.** New tool `cancel_membership` (needs a linked account; joins `AUTH_TOOLS`). Its description tells Alexa to confirm first. It calls `closeChargePermission(id, { closureReason: "Listener cancelled by voice", cancelPendingCharges: true })`, then sets the record to `cancelled`. No membership on file → "I don't see a monthly membership on your account. If you gave without linking, you can cancel at pay.amazon.com."

### How the monthly charge runs

- **For the demo: no scheduler.** The **Simulate next month** button on `/give/thanks` (and a `POST /api/give/simulate-next-month` behind it) calls `createCharge` on the stored Charge Permission for the next period, with idempotency key `<chargePermissionId>-<period>` so a double click charges once. The route refuses unless `AMAZON_PAY_SANDBOX=true` and the caller holds a valid sealed token for that listener.
- **For real money later (not built now):** a daily Vercel Cron job (one line in `vercel.json`, protected by `CRON_SECRET`) calls the same charge function for every member whose period is due. That is when storage moves to a Convex table with an index on the next charge date (Clerk metadata can't be queried by date). Declines follow Amazon's guidance: soft decline → retry; hard decline → email the listener Amazon's "update your payment method" link.

### Storage: is it even needed?

- **One-time gifts:** no.
- **Monthly, for voice cancel and the "member since" line:** yes, one small record per listener: the Charge Permission id. Without it we can't charge again or cancel by voice.
- **Where (recommended): Clerk `privateMetadata`** on the listener's user. Radio Commons already uses Clerk; nothing to add to the shared playlist Convex deployment (whose shared, unversioned state caused an outage on 2026-04-24), and no second repo to change. Ceiling: it can't answer "who is due this month?", which only matters once a real scheduler exists.
- **Alternative:** a `memberships` table in the playlist Convex DB, keyed by `listenerId` (the same opaque id as `finds` and `listenerFollows`), going through `listenerGuard`. Right for production, more work now (a PR in rm-playlist-v2 plus a deploy).
- "Alexa, delete my Finds" keeps erasing Finds and follows only. Membership is a payment relationship with its own cancel command; the privacy page gets one line saying so.

## Components and files (radio-commons)

| File | What |
| --- | --- |
| `src/lib/give/tiers.ts` | The fixed list of tiers (id → amount, monthly or one-time). Pure. |
| `src/lib/give/token.ts` | `sealListener` / `openListener` (AES-256-GCM, key from `GIVE_TOKEN_SECRET`). Pure. |
| `src/lib/give/amazonPay.ts` | SDK client from env; `buttonConfig(tier, returnUrl)`, `complete(sessionId, tier)`, `chargeNextPeriod(membership, period)`, `cancel(chargePermissionId)`. Node runtime only. |
| `src/lib/give/membership.ts` | Read and write the membership in Clerk `privateMetadata`. |
| `src/app/give/page.tsx` | The DEMO page with the Amazon Pay button. |
| `src/app/give/thanks/page.tsx` | Completes checkout, records, shows the receipt and the simulate button. |
| `src/app/api/give/simulate-next-month/route.ts` | Sandbox-only next-period charge. |
| `src/lib/mcp.ts` | Tools `support_radio_milwaukee` and `cancel_membership`; one sentence in `whats_new_for_me`. |
| `src/lib/listenerAuth.ts` | Add `cancel_membership` to `AUTH_TOOLS`. |
| `src/lib/card/views.ts`, `src/lib/card/page.ts` | The give card view; its buttons use the existing `openLink` path. |
| `src/lib/maps.ts` | Let `isOpenableLink` accept our own `/give` URL. |
| `src/lib/sim/brain.ts` | Simulator phrases for the two new tools. |
| `src/app/privacy/page.tsx` | One paragraph: what a gift stores (Charge Permission id, amount, dates) and how to cancel. |
| `alexa/addon-package/addon.json` | Example phrases: "support Radio Milwaukee", "cancel my Radio Milwaukee membership". |

New dependency: `@amazonpay/amazon-pay-api-sdk-nodejs` 2.3.6 (one dependency of its own, `axios`). Environment variables (all server-side): `AMAZON_PAY_PUBLIC_KEY_ID`, `AMAZON_PAY_PRIVATE_KEY` (Sensitive), `AMAZON_PAY_MERCHANT_ID`, `AMAZON_PAY_STORE_ID`, `AMAZON_PAY_SANDBOX=true`, `GIVE_TOKEN_SECRET` (Sensitive, 32 random bytes). No playlist (Convex) changes.

## What Tarik does by hand

1. Sign up for a **sandbox-only Amazon Pay developer account** (or a merchant account) for Radio Milwaukee, US.
2. In Seller Central → Integration Central, switch to **Sandbox**, choose the self-developed integration (pick recurring payments if offered), **Create keys**. The private key `.pem` downloads once: keep it. Copy the Public Key ID, Merchant ID and Store ID.
3. Seller Central → **Amazon Pay (Sandbox View)** → Integration → **Test Accounts**: create a test buyer with a new email and password (not your real ones).
4. Add the six environment variables in Vercel (production and preview, the two key ones marked **Sensitive**) and in `.env.local`; redeploy.
5. Add `https://radio-commons.vercel.app` (and the localhost URL) wherever Integration Central asks for allowed JavaScript origins / return URLs, if it asks. (Not confirmed that sandbox requires it.)

## Risks

- **Echo Show and in-app browsers.** Not confirmed that `openLink` opens a browser on an Echo Show, or that Amazon Pay's page works inside an app's web view. Mitigation: short URL and QR code on the card; record the demo video on a phone.
- **Certification view of an outside payment page.** The add-on rules don't forbid it and say to use "your existing payment processor"; a reviewer could still object. Mitigation: it is a sandbox demo, labelled; native checkout is the stated next step.
- **Immediate re-charge in sandbox.** Expected to work (Amazon uses the frequency only for expiry and buyer messages), not yet tried. First task once keys exist; if it fails, the simulate button shows the charge it would make instead.
- **Real-money approval.** Amazon Pay lists donations under "Items and Activities Requiring Prior Approval". Irrelevant in sandbox; needed before production.
- **Latency.** The `whats_new_for_me` membership read adds a Clerk API call; run it in parallel with the digest and drop the sentence if it takes over 300 ms.

## What we won't build

- Real money, or anything that switches the sandbox flag off.
- A scheduler for monthly charges (the button stands in), IPN webhooks, decline emails, refunds.
- Alexa+ native checkout (one-time only, needs a Solutions Architect, no documented sandbox): named as the next step in the submission.
- Gift premiums, shipping, tax receipts, donor CRM sync, changing the amount of an existing membership.
- A separate account system: unlinked listeners can still give, they just can't cancel by voice.

## Testing

**Unit (vitest, no network):**
- `tiers`: unknown tier rejected; amounts formatted as Amazon strings ("10.00").
- `token`: round trip; expired token rejected; one changed character rejected; wrong key rejected.
- `amazonPay.buttonConfig`: monthly payload has `Recurring` + `recurringMetadata` + `PayOnly` + `ProcessOrder`; one-time has neither; return URL carries `t`, never a raw id.
- `complete`: refuses when the session's amount isn't the tier's; 200 → paid, 202 → pending (SDK mocked).
- `chargeNextPeriod`: idempotency key is `<id>-<period>`; same period twice sends the same key.
- `cancel_membership`: no record → the pay.amazon.com reply; record → close called once, status `cancelled`.
- `support_radio_milwaukee`: linked listener gets `t`, unlinked doesn't; reply mentions "demo".
- The simulate route refuses when `AMAZON_PAY_SANDBOX` isn't `true`.

**Sandbox end to end (manual, with the test buyer, on a phone):**
1. Monthly $10 → thanks page shows a reference; Seller Central sandbox shows the charge.
2. Simulate next month → a second charge; double-click → still one charge for that period.
3. "What's new for me" → the member sentence.
4. "Cancel my membership" → Charge Permission Closed in Seller Central; simulate now refuses.
5. One-time $25 → receipt, nothing stored.
6. Declines: card ending 3434 at checkout → "didn't go through"; `x-amz-pay-simulation-code: HardDeclined` on simulate → a clear message, nothing recorded.
7. Unlinked listener in the simulator → can give; cancel by voice gives the pay.amazon.com reply.

## Effort

About **18 hours** (range 15–24): tiers, token and Amazon Pay wrapper with tests 5 h; `/give` and thanks pages 4 h; tools, card and simulator 4 h; cancel and the "member since" line 2 h; sandbox setup and end-to-end debugging 3 h (most of the uncertainty). Tarik's manual steps: about 1 hour.

## Open questions for Tarik

1. **Amounts:** $10 / $25 / $50 for both monthly and one-time, or the station's real membership levels?
2. **Storage:** Clerk metadata for the demo (recommended), or a Convex `memberships` table now so the production path is ready?
3. **Account:** sandbox-only developer account in your name, or start Radio Milwaukee's real merchant registration (which triggers the donations prior-approval review)?
4. **Is Radio Milwaukee's 501(c)(3) status fine to state on the page** ("Radio Milwaukee is a 501(c)(3) nonprofit"), or leave tax language off the demo?
