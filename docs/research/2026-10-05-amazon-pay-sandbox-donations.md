# Amazon Pay sandbox donations: research

**Date:** 2026-10-05 · **For:** the "Give" slice (design: `docs/superpowers/specs/2026-10-05-give-sandbox-design.md`) · **Author:** Claude, for Tarik's review

Every quote below was read on the page linked, on 2026-10-05. Some pages were read through a summarising fetch tool, so a quote can be a lightly trimmed version of the sentence on the page; the meaning was checked. "Not confirmed" means I looked and could not verify it.

Terms used throughout:
- **Checkout Session**: Amazon Pay's record of one checkout attempt; it lives at most 24 hours.
- **Charge Permission**: the buyer's standing approval that lets the merchant charge their Amazon wallet; for a monthly gift it is what we charge each month.
- **Charge**: one actual payment taken against a Charge Permission.
- **APB (Additional Payment Button)**: Amazon Pay's checkout variant where the merchant fixes the amount up front and the buyer goes from the button straight to Amazon's page and back, with no review step on our site.
- **Sandbox**: Amazon Pay's test environment; fake cards, no real money.

## 1. The recurring checkout flow, end to end (US)

**Answer:** Recurring checkout works for US merchants, and the APB variant fits a donation page well: we sign the amount and "monthly" into the button, the buyer approves on Amazon's page, comes back to our result URL, and our server calls Complete Checkout Session. Every later month is our job: we call Create Charge against the stored Charge Permission. Cancelling is Close Charge Permission. **Confidence: high.**

The steps, in order:

1. **Render the button.** `amazon.Pay.renderButton()` takes `merchantId`, `publicKeyId`, `ledgerCurrency` (USD), `checkoutLanguage`, `productType`, `placement`, `sandbox`, and `createCheckoutSessionConfig` = `{ payloadJSON, signature, algorithm }`. The signature is made on our server: "Generate a signature using the helper function provided in the Amazon Pay SDKs." ([Add the Amazon Pay button](https://developer.amazon.com/docs/amazon-pay-checkout/add-the-amazon-pay-button.html))
2. **What goes in the signed payload (recurring APB).** From Amazon's example: `webCheckoutDetails.checkoutResultReturnUrl`, `"checkoutMode": "ProcessOrder"`, `storeId`, `"chargePermissionType": "Recurring"`, `paymentDetails` (`"paymentIntent": "AuthorizeWithCapture"`, `chargeAmount`), and `recurringMetadata` (`"frequency": { "unit": "Month", "value": "1" }` plus `amount`). For one-time gifts, the same payload with `"chargePermissionType": "OneTime"` and no `recurringMetadata`. ([Recurring APB: add the button](https://developer.amazon.com/docs/amazon-pay-recurring-apb-checkout/add-the-amazon-pay-button.html))
3. **Buyer approves on Amazon.** "The buyer will complete checkout on an Amazon Pay hosted page", then is sent to `checkoutResultReturnUrl` with the Checkout Session ID as a query parameter (same page).
4. **Our server completes it.** "Amazon Pay will not finalize the `paymentIntent` until you confirm checkout with Complete Checkout Session." The request's `chargeAmount` "must match the Checkout Session object `paymentDetails.chargeAmount`". "Any Checkout Session that is not confirmed within 24 hours will be cancelled." A 200 means done; a 202 means authorization is still pending. Store the `chargePermissionId` for later payments. ([Verify and complete checkout](https://developer.amazon.com/docs/amazon-pay-recurring-checkout/verify-and-complete-checkout.html))
   - "Once Checkout Session moves to a 'Completed' state, the Checkout Session can no longer be used to perform another payment, or retry a charge." ([Checkout Session API](https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html))
5. **Later months.** "You are still responsible for calling Create Charge to charge the buyer for each billing cycle." Amazon uses the frequency only "to calculate Charge Permission expiration data and in buyer communication." ([Upgrading from one-time to recurring](https://developer.amazon.com/docs/amazon-pay-checkout/upgrading-from-onetime-to-recurring.html)) Create Charge takes `chargePermissionId`, `chargeAmount`, `captureNow`, and optionally `canHandlePendingAuthorization`. ([Manage recurring payments](https://developer.amazon.com/docs/amazon-pay-recurring-checkout/manage-recurring-payments.html))
6. **Declines.** Soft decline: check the Charge Permission is still "Chargeable", then retry. Hard decline: send the buyer to `https://payments.amazon.com/jr/your-account/ba/{ChargePermissionId}` to change their card (same page).
7. **Cancel.** "When subscribers cancel, invoke Close Charge Permission" (same page). Close takes `closureReason` (up to 255 characters) and `cancelPendingCharges`. Buyers can also cancel themselves at pay.amazon.com, which closes it with reason `BuyerClosed`. ([Charge Permission API](https://developer.amazon.com/docs/amazon-pay-api-v2/charge-permission.html))
8. **Lifecycle.** States: Chargeable, NonChargeable (for example `PaymentMethodExpired`), Closed (`MerchantClosed`, `BuyerClosed`, `AmazonCanceled`, or expired). Recurring permissions expire 13 months after confirmation, and each new charge resets that clock (search summary of the Charge Permission page; the 13 months also appears on the upgrade page). Frequency units: "Year, Month, Week, Day, Variable".
9. **Notifications (IPN, Instant Payment Notifications: Amazon's server-to-server messages when a payment object changes state).** Configured in Seller Central under Settings → Integration Settings. Messages carry `ObjectType` (CHARGE_PERMISSION, CHARGE, REFUND, CHARGEBACK), `ObjectId`, `ChargePermissionId`, `NotificationType`. Amazon's own advice: "Make a GET API call for the transaction specified in the message to determine transaction state." Retries on 5xx and timeouts, "every hour for the next 3 hours". In sandbox, "HTTP is an acceptable alternative" to HTTPS. ([Set up IPN](https://developer.amazon.com/docs/amazon-pay-checkout/set-up-instant-payment-notifications.md))

**APB versus standard checkout.** Standard checkout sends the buyer to Amazon to pick a card, back to our review page, then our server calls Update Checkout Session to get an `amazonPayRedirectUrl`, sends the buyer to Amazon again, and finally completes ([Set payment info](https://developer.amazon.com/docs/amazon-pay-recurring-checkout/set-payment-info.html)). That review page exists so a shop can recalculate shipping and tax. A donation has neither, so **APB is the fit**: one trip to Amazon, amount fixed in the signed button.

**PayOnly versus PayAndShip.** `PayOnly`: "Offer checkout using only the buyer's Amazon wallet". `PayAndShip` also collects a shipping address. A donation with no thank-you gift is `PayOnly`. (If the station ever mails a premium, that becomes `PayAndShip`.)

**Is recurring available to US merchants?** Yes: the recurring APB guide lists "US (USD)" first among supported regions.

**Not confirmed:**
- Whether a sandbox merchant has to switch Integration Central from its default ("One-time Payments, Single Authorization") to a recurring setting before recurring payloads are accepted. Plan to choose recurring there when creating keys.
- The maximum length of `merchantMetadata.customInformation` (the design avoids depending on it).
- Whether an IPN endpoint can be set per Checkout Session; I found only the account-wide setting.

## 2. Official Node SDK

**Answer:** `@amazonpay/amazon-pay-api-sdk-nodejs` **2.3.6**, published **2026-10-02** (checked with `npm view` on 2026-10-05; previous release 2.3.4 on 2025-07-30). Apache-2.0. One runtime dependency, `axios` 1.20.0. No `engines` field on npm; the README says Node 10+. It uses Node's `crypto` module, so it runs on Vercel's **Node.js runtime** (the Next.js default for route handlers), **not** the Edge runtime. **Confidence: high.**

From the [GitHub README](https://github.com/amzn/amazon-pay-api-sdk-nodejs):
- Config: `publicKeyId`, `privateKey` (a file path or the key as a string), `region` (`'us'`), `sandbox` (true/false), optional `algorithm`.
- `generateButtonSignature(payload)`: "Signatures generated by this helper function are only valid for Checkout v2 front-end buttons".
- `WebStoreClient` methods we need: `getCheckoutSession`, `completeCheckoutSession`, `createCharge`, `getChargePermission`, `closeChargePermission`.
- Idempotency: the README passes `'x-amz-pay-idempotency-key'` as a header on create calls.
- The `algorithm` default in the README is `AMZN-PAY-RSASSA-PSS`; the button docs show `AMZN-PAY-RSASSA-PSS-V2`. Use V2 and set it explicitly in both places.

## 3. Sandbox: credentials, test buyers, simulations

**Answer:** Tarik can get sandbox-only credentials without a live merchant approval, create a test buyer in Seller Central, and force declines with a request header. Nothing in the docs blocks charging a recurring permission again right away, so "simulate next month" is just an immediate Create Charge. **Confidence: high on the steps; medium on the immediate re-charge (not yet tried).**

- **Account:** "Sign up for an Amazon Pay merchant account", or "create a developer account that can only access the Sandbox environment". ([Get set up for integration](https://developer.amazon.com/docs/amazon-pay-checkout/get-set-up-for-integration.html))
- **Keys:** Integration Central → choose **Sandbox** in the marketplace switcher → API keys → Create keys. "Creating the key pair will automatically download the private key (.pem) file", and "This is the only time that you will be able to download the private key file" (same page). Also note the Merchant ID and the Store ID (the `amzn1.application-oa2-client…` value).
- **Test buyer:** Seller Central → **Amazon Pay (Sandbox View)** → Integration → **Test Accounts**. "Do not use the email address for your Production account". The cards are "preset, fictitious charge cards for testing". ([Sandbox accounts](https://developer.amazon.com/docs/amazon-pay-checkout/amazon-pay-sandbox-accounts.md))
- **Simulated cards in a test buyer's wallet** ([Sandbox simulations](https://developer.amazon.com/docs/amazon-pay-checkout/sandbox-simulations.html)): ending 1111/0005/4444/9424/0000 succeed; 3064 ends in `BuyerCanceled`; 3434 ends in `Declined`; 0701 is pending for 30 seconds; 4354 is pending then hard-declined.
- **Simulation header** `x-amz-pay-simulation-code` (left out of the signature): on Complete Checkout Session `BuyerCanceled`, `AmazonCanceled`, `Declined`, `AuthorizationInitiated`; on Create Charge `SoftDeclined`, `HardDeclined`, `AmazonRejected`, `TransactionTimedOut`, `CaptureInitiated` and the `Pending…` variants; on Close Charge Permission `AmazonClosed` (same page).
- "Sandbox requests do not result in live transactions." ([Test your integration](https://developer.amazon.com/docs/amazon-pay-checkout/test-your-integration.html))

**Not confirmed:** that sandbox accepts a second Create Charge minutes after the first on a monthly permission (docs say frequency is used only for expiry and buyer messages, so it should). First thing to try once keys exist.

## 4. Donations and nonprofits

**Answer:** Amazon Pay accepts donations, but only with **prior approval**. Its Acceptable Use Policy (last updated July 31, 2026) lists "Donations and Charitable Solicitations — includes charities and non-profit organizations…" under the heading **"Items and Activities Requiring Prior Approval"**, which "require prior approval before registration for our payment services". Amazon also has a charity FAQ and charity pricing. This blocks nothing in the **sandbox** demo; it does have to happen before any real money. **Confidence: high on the policy; low on the current state of Alexa Donations.**

- Policy: [Amazon Pay Acceptable Use Policy](https://pay.amazon.com/help/6023).
- [FAQ for charitable organizations](https://pay.amazon.com/help/TJE7FMHVRAJEJUZ): "Charitable organizations that register with Amazon Pay can have their supporters making donations", and it mentions "An option to set up sustained giving functionality on your website, using APIs" (that is, monthly giving).
- [Fees for charitable organizations](https://pay.amazon.com/help/MK6Z63AAJQZ32PD): "2.2% processing fee and $0.30 authorization fee" for US donations.
- **Alexa Donations** (voice giving through Amazon Pay, $5–$200, 380+ 501(c)(3) charities) was announced in an [Amazon Pay blog post of October 27, 2021](https://pay.amazon.com/blog/Pay-It-Forward-Amazon-Pay-and-Alexa-are-making-it-even-easier-to-give-back). Its sign-up page, `pay.amazon.com/non-profits`, now shows the general Amazon Pay home page with nothing about nonprofits. **Not confirmed** whether Alexa Donations still exists or works with Alexa+ in 2026.
- **Not confirmed:** whether approval checks 501(c)(3) status by name (an older, third-party-quoted version of the policy said "without a valid 501(c)(3)"; the current text no longer has that phrase).

## 5. Alexa+ rules for sending a listener to an outside payment page

**Answer:** The add-on functional requirements say nothing about links, `openLink`, deep links, tracking parameters, donations or children. What they do say about payments: "Complete the payment flow using your existing payment processor functionality or integrations" and "Display correct payment amount, confirm payment method, deliver a receipt, and prevent double-charges", plus "Communicate the full price breakdown (base price, taxes, fees, total) before purchase confirmation" (Section 8, Transaction Flow). Nothing forbids a card button that opens our own page. **Confidence: medium** (absence of a rule is not permission; the certification reviewer may still have views).

- Source: [Alexa+ add-on functional requirements](https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html). Also relevant there: disclose all data types collected and keep a valid privacy policy URL (Section 5); answer within 3 seconds (already quoted in `docs/HACKATHON.md`).
- [Checkout integration](https://developer.amazon.com/docs/alexaplus/add-ons/checkout-integration.html): "Requires Amazon Pay merchant onboarding. Refer to the Network Token Integration Guide provided by your Solutions Architect." I saw no mention of recurring payments or a sandbox on that page; it is out of scope except as a next step.
- **Not confirmed:** what `openLink` does on an Echo Show (no confirmed browser hand-off) versus the Alexa app on a phone (opens the browser). The design shows a short URL and a QR code on the card as a fallback.
- **Not confirmed:** whether Amazon Pay's hosted page works inside an in-app web view; Amazon generally expects a full browser.
- Our own rules carry over: no personal data in URLs, and no tracking parameters (we add none).

## 6. Security

**Answer:** Keep the private key in a Vercel **Sensitive** environment variable (unreadable after creation, production and preview only), sign everything on the server, never take an amount from the browser, use idempotency keys on every charge, treat IPNs as "go and check" hints, and identify the listener with a short-lived encrypted token instead of an id in the URL. **Confidence: high.**

- **Signing key:** Vercel: Sensitive variables are "non-readable once created" and can be created "only… in the preview and production environments". Build logs redact sensitive values of 32+ characters. ([Vercel docs, last updated 2026-08-28](https://vercel.com/docs/environment-variables/sensitive-environment-variables)) Local development uses a sandbox key in `.env.local` (never committed). The key is sandbox-only, so a leak costs a key rotation, not money.
- **Amounts:** the page offers a fixed list (for example $10 / $25 / $50); the server maps the chosen tier to an amount and signs it into the button. The signature means the browser cannot change the amount; on return we check the session's amount is one of ours before completing.
- **Idempotency key:** sent on every Create Charge, built from the Charge Permission and the billing period (for example `cp…-2026-11`), so a retried or doubled run cannot charge twice. This is how we meet the Alexa+ "prevent double-charges" requirement (question 5). **Not confirmed:** how long Amazon remembers an idempotency key.
- **Webhooks:** Amazon advises calling the GET API on receipt rather than trusting the message body; for the demo we skip IPN entirely and read state with Get Charge Permission when we need it. If IPN is added later, verify the SNS (Amazon Simple Notification Service, which delivers IPNs) message signature first.
- **Linking a gift to the listener:** the card's button URL carries a token sealed with AES-256-GCM (a standard encryption mode that also detects tampering) holding `{ listenerId, expires }`, valid 15 minutes. The URL shows only ciphertext; the listener's Clerk id never appears readable, and no name or email is involved. Same pattern as the existing `src/lib/sim/speakToken.ts`, with encryption added. The `/give` page puts a fresh sealed token into the signed `checkoutResultReturnUrl`, so the listener is still known when Amazon sends them back, with no cookie and no reliance on `customInformation`.
