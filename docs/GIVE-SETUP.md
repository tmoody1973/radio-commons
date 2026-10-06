# Setting up "Support Radio Milwaukee" (Amazon Pay sandbox)

The giving demo runs only in Amazon Pay's **sandbox**: Amazon's test environment, with fake cards and no real money. The code has no switch to turn that off (`SANDBOX` is a constant in `src/lib/give/amazonPay.ts`). Until the five settings below exist, the voice tool and the `/give` pages say "Donations aren't set up yet" and everything else keeps working.

Design and reasons: `docs/superpowers/specs/2026-10-05-give-sandbox-design.md`, `docs/decisions/008-amazon-pay-sandbox-donations.md` (on the `docs/give-plan` branch).

## What Tarik does by hand (about an hour)

### 1. Get a sandbox-only Amazon Pay developer account

1. Go to Amazon Pay's "Get set up for integration" page (developer.amazon.com/docs/amazon-pay-checkout/get-set-up-for-integration.html) and choose the option to **create a developer account that can only access the Sandbox environment**. Pick the US.
2. Do not start a real merchant registration. Real donations need Amazon's prior approval for charities, which we are not asking for.

### 2. Create the sandbox keys (the private key downloads once)

1. In Seller Central, open **Integration Central**.
2. In the marketplace switcher at the top, choose **Sandbox**.
3. Choose the self-developed integration. If it asks about payment type, pick **recurring payments** (monthly memberships need it).
4. Under **API keys**, choose **Create keys**. Your browser downloads a `.pem` file: the private key. **This is the only time Amazon lets you download it.** Keep it somewhere safe (a password manager), never in the repo.
5. From the same page, copy:
   - the **Public Key ID** (starts with `SANDBOX-` or is a long id)
   - the **Merchant ID**
   - the **Store ID** (the `amzn1.application-oa2-client.…` value)

### 3. Make a sandbox test buyer

1. In Seller Central, switch to **Amazon Pay (Sandbox View)**.
2. Go to **Integration → Test Accounts** and create a test buyer with a **new** email address and password. Do not use your real Amazon account's email.
3. The test buyer's wallet has preset fake cards. Cards ending 1111 succeed; 3434 is declined (useful for testing the "didn't go through" page).

### 4. Add the five environment variables in Vercel

Project **radio-commons** → Settings → Environment Variables. Add each for **Production** and **Preview**, and mark the key and the secret **Sensitive** (Vercel never shows a Sensitive value again after you save it).

| Name | Value | Sensitive |
|---|---|---|
| `AMAZON_PAY_PUBLIC_KEY_ID` | Public Key ID from step 2 | no |
| `AMAZON_PAY_PRIVATE_KEY` | the whole `.pem` file contents (see below) | **yes** |
| `AMAZON_PAY_MERCHANT_ID` | Merchant ID | no |
| `AMAZON_PAY_STORE_ID` | Store ID (`amzn1.application-oa2-client.…`) | no |
| `GIVE_TOKEN_SECRET` | output of `openssl rand -base64 32` | **yes** |

For the private key, paste the file exactly as it is, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Vercel keeps the line breaks. (In `.env.local`, where a value must be on one line, replace each line break with the two characters `\n`; the code turns them back.)

`CLERK_SECRET_KEY` (already set for the Apple Music connect page) is what saves monthly memberships. Without it, people can still give; voice cancel and the "member since" line just won't work.

Then redeploy (Deployments → the latest → Redeploy).

For local testing, put the same five names in `.env.local` (never committed).

### 5. Allowed URLs (only if Amazon asks)

If Integration Central asks for allowed JavaScript origins or return URLs, add `https://radio-commons.vercel.app` and `http://localhost:3000`. We have not confirmed that sandbox requires this.

## The end-to-end sandbox test (once the keys exist)

Do this on a phone, with an Alexa account linked to a Radio Milwaukee listener account (or the simulator's "Link Radio Milwaukee account").

1. **Monthly, linked.** Say "I want to support Radio Milwaukee". The card shows DEMO, Monthly / One-time and four levels. Tap **Main Floor $10/mo** (or scan the QR code on a phone). On `/give`, keep the t-shirt, pick size **L**, Continue. Tap the Amazon Pay button, sign in as the **sandbox test buyer**, choose a shipping address (add one if the test buyer has none), continue; Amazon goes through our `/give/review` step and back to its confirm page; confirm. You land on the thanks page: "You're a monthly member (demo)", a receipt with an Amazon Pay reference, and "Main Floor gift: RadioMKE t-shirt (L) ships to <name>, <city>, <state>". *First thing to watch:* this is the first run of the PayAndShip path (see `docs/GIVE-PREMIUMS.md`, "Untested"). In Seller Central (Sandbox View) the charge appears.
2. **Simulate next month.** Tap **Simulate next month (November 2026)**: "Charged $10.00 for November 2026 (simulated)". Tap it twice quickly: still one charge for that month in Seller Central. *First thing to watch:* Amazon's docs suggest a second charge right away is allowed, but nobody has tried it yet. If it's refused, the button shows "declined" and nothing is recorded.
3. **What's new.** Say "what's new for me": the reply ends "And thanks for being a monthly member since October 5."
4. **Cancel.** Say "cancel my Radio Milwaukee membership". Alexa asks "Cancel your $10 monthly membership? You won't be charged again." Say yes. Seller Central shows the Charge Permission as **Closed**; Simulate next month now says there's no active membership.
5. **One-time, no gift.** Choose One-time → **Main Floor $120** → "No gift — all of it goes to the station". Amazon asks for no address (PayOnly). Receipt says "No gift — thank you, it all goes to the station."; nothing stored.
6. **Declines.** Pay with the card ending **3434**: "That didn't go through. Nothing was charged."
7. **Unlinked.** In the simulator without linking: giving works; "cancel my membership" asks you to link your account.

The live eval (`npm run eval:turns`) has two new cases: "I want to support Radio Milwaukee" must show the give card (this fails until the keys are in production), and "cancel my Radio Milwaukee membership" must stop at account linking.

## If something goes wrong

- **"Donations aren't set up yet" after adding the keys:** one of the five is missing or empty in that environment, or the deployment predates them (redeploy).
- **The Amazon Pay button doesn't appear:** the private key is malformed (the server log shows `give_button_sign_failed`), or the Public Key ID doesn't match the key.
- **"That didn't go through" every time:** the server log shows `amazon_pay_failed` with Amazon's `reasonCode`, never any personal data.
- **A key leaked:** it is sandbox-only, so no money is at risk. Create new keys in Integration Central, update Vercel, redeploy, and delete the old key.
