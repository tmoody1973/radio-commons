# 008 — Listener gifts and monthly memberships through an Amazon Pay sandbox page, not Alexa+ checkout

**Status:** draft, awaiting Tarik's approval (2026-10-05)

**Decision** — "Alexa, I want to support Radio Milwaukee" shows a card that opens a Radio Commons web page (`/give`) running Amazon Pay's sandbox checkout (Amazon's test environment: fake cards, no real money), for one-time gifts and monthly memberships, labelled DEMO; "cancel my membership" closes the monthly gift by voice.

**Why this came up** — Monthly members are how public radio pays its bills, and the hackathon judges "Potential Impact". The station approved a demo with no real money. The obvious route, Alexa+'s own checkout, needs onboarding through an Amazon Solutions Architect, has no documented sandbox, and its reference page says nothing about recurring payments. Getting this wrong means either a demo that can't show monthly giving or a payment flow that touches real money before the station has approved it.

**Options**
- *Alexa+ native checkout* — the most "Alexa" experience, paid without leaving the conversation. Costs: Solutions Architect onboarding we can't schedule before October 23, no sandbox to demo safely, and no monthly giving.
- *A card that opens our own page with Amazon Pay's sandbox checkout* (chosen) — Amazon Pay supports monthly ("Recurring") payments for US merchants and has a full sandbox with test buyers and forced declines. Costs: the listener leaves the conversation for a web page, we write and secure the payment code ourselves, and it is not confirmed that an Echo Show will open the page (the card adds a QR code and short link).
- *Link to the station's existing donation page* — no new payment code at all. Costs: real money, nothing to do with Amazon, no voice cancel, nothing the judges haven't seen before.

**What we chose and why** — The second (Tarik chose the approach, "Option A"; Claude drafted the details, 2026-10-05). It is the only option that shows monthly giving, end to end, with no real money, before the deadline. Amazon's add-on rules say to "complete the payment flow using your existing payment processor", which this does. Native checkout stays in the submission as the next step.

**What we gave up** — It isn't paid inside the conversation. Monthly charges don't run on their own: a "Simulate next month" button stands in for a scheduler. Listeners who haven't linked their account can give but can't cancel by voice. Going live would still need Amazon Pay's prior approval for donations, a real scheduler and decline handling.

**How we'll know if this was right** — On a phone, with the sandbox test buyer: a $10 monthly gift completes in under a minute from the voice request; "Simulate next month" adds exactly one charge however many times it is pressed; "cancel my membership" shows the Charge Permission (Amazon's standing approval to charge the buyer) as Closed in Seller Central; and the demo video uses this flow without edits around a failure.

**What actually happened** —
