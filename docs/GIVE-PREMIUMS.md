# Membership thank-you gifts (premiums) in the sandbox donation flow

**Date:** 2026-10-05 · **Author:** Claude, for Tarik's review · **Status:** built on `feat/give-premiums`, sandbox only

Radio Milwaukee thanks members with a gift at most levels (radiomilwaukee.org/donate, read 2026-10-05). This page records what Amazon Pay can and can't do to collect a shipping address, the flow we chose, and what we keep about the address.

## The gifts

| Level | Monthly / one time | Gift | Shipped? | Size |
|---|---|---|---|---|
| General Admission | $5 / $60 | Green Room newsletter | no | none |
| Main Floor | $10 / $120 | RadioMKE t-shirt | yes | S, M, L, XL, XXL |
| Front Row | $20 / $240 | Merch package: t-shirt + sticker | yes | t-shirt size |
| VIP | $42 / $500 | VIP package: hat (one size), t-shirt, sticker, plus Studio Milwaukee Sessions for two (not shipped) | yes | t-shirt size |

Tarik's decisions: show the gift, let the listener choose, ship it (in the demo: say where it would ship). The gift is selected by default, next to a plain "No gift — all of it goes to the station" choice. No tax or fair-market-value wording.

## Research: can Amazon Pay collect the shipping address?

Every quote was read on the linked page on 2026-10-05, some through a summarising fetch tool (so a quote can be lightly trimmed; the meaning was checked).

Terms: **APB** (Additional Payment Button) is the checkout we use today: we fix the amount in a signed button and the buyer makes one trip to Amazon. **Standard checkout** sends the buyer to Amazon, back to a "review" URL of ours, then to Amazon again to confirm. **PayOnly** asks Amazon for the wallet only; **PayAndShip** also asks for an address.

### (a) The APB flow: no. The merchant must supply the address.

- Recurring APB: "You must set `addressDetails` with the shipping address provided by the buyer" when the product type is PayAndShip ([Recurring APB: add the button](https://developer.amazon.com/docs/amazon-pay-recurring-apb-checkout/add-the-amazon-pay-button.html)).
- One-time APB: the button sits "at the end of checkout after buyer has already manually entered their shipping address", so you "must provide that information in addressDetails" ([APB overview](https://developer.amazon.com/docs/amazon-pay-apb-checkout/additional-payment-button-overview.html)).
- So APB with a gift would mean building our own address form. We don't want to collect or hold street addresses.

### (b) The standard flow: yes, and it works for recurring.

- PayAndShip: "Offer checkout using buyer's Amazon wallet and address book" ([Amazon Pay script](https://developer.amazon.com/docs/amazon-pay-checkout/amazon-pay-script.html)).
- Recurring standard checkout: `checkoutReviewReturnUrl` is where the buyer lands "after they select their preferred shipping address and payment method" ([Recurring: add the button](https://developer.amazon.com/docs/amazon-pay-recurring-checkout/add-the-amazon-pay-button.html)).
- On return we call Update Checkout Session with the amount, payment intent, result URL and monthly frequency; "Once there are no constraints, the response will return a unique `amazonPayRedirectUrl`" ([Recurring: set payment info](https://developer.amazon.com/docs/amazon-pay-recurring-checkout/set-payment-info.html)). Then Complete Checkout Session, as today.

### Does recurring support PayAndShip?

Yes. The recurring guides (both APB and standard) describe PayAndShip for recurring; the difference is only who supplies the address. **Confidence: high.**

### Where does the address come back?

- Checkout Session `shippingAddress`: "Shipping address selected by the buyer", "Null for PayOnly product type" ([Checkout Session API](https://developer.amazon.com/docs/amazon-pay-api-v2/checkout-session.html)).
- After completion: "buyer and shipping details must be obtained from the getChargePermission() function call" (same page). The Charge Permission object has the same `shippingAddress` field ([Charge Permission API](https://developer.amazon.com/docs/amazon-pay-api-v2/charge-permission.html)).
- Amazon "permanently deletes Checkout Session objects and any associated information after 30 days" (Checkout Session API).

## The flow we built

- **No gift** (General Admission, or "No gift — all of it goes to the station"): unchanged. APB, PayOnly, one trip to Amazon.
- **A shipped gift:** standard checkout with PayAndShip. The `/give` page asks gift or no gift and a t-shirt size (checked on the server against the gift list), then signs a button whose payload holds only the review URL, store, and for monthly the frequency. Amazon collects the address. Amazon returns the buyer to `/give/review`, a server route with no page: it sets the amount (from our tier list, never the browser) with Update Checkout Session and redirects straight to Amazon's confirm page. Amazon returns to `/give/thanks`, which completes as before and then reads the address from Get Charge Permission (one path for a first visit and a reload).
- The gift choice (tier, gift or not, size) travels in a sealed token (AES-256-GCM, like the listener token), never as plain URL parameters after the `/give` page.

## What we keep about the address

- **On screen:** the name, city and state ("Front Row merch package (L) ships to Sam Rivera, Milwaukee, WI · address on file with Amazon Pay"). The street is never shown.
- **Stored (monthly, linked accounts only, in Clerk privateMetadata):** the gift's items, the size, city and state, and `status: "sandbox — not shipped"`. No name, no street, no postcode. The full address stays with Amazon Pay. One-time gifts store nothing, as before.
- **Voice:** "what's new for me" keeps its membership line only. Nothing ships in the sandbox, so Alexa makes no shipping claims.

## Untested until a real sandbox checkout

1. That the sandbox accepts PayAndShip with a signed `payloadJSON` whose payload has `checkoutReviewReturnUrl` and recurring metadata but no `paymentDetails` (the docs show both pieces separately, not this exact combination).
2. That Update Checkout Session returns `amazonPayRedirectUrl` on the first call with our fields (if Amazon reports constraints, the review route sends the buyer to "That didn't go through").
3. That Get Charge Permission returns `shippingAddress` with `city` and `stateOrRegion` for a recurring PayAndShip permission in sandbox.
4. Sandbox test buyers' address books: whether they come with a preset address or the tester has to add one on Amazon's page.

**Overall confidence: high** that the standard flow is the right one (APB explicitly needs our own address form); **medium** on the exact payloads until the first sandbox run.
