# Requests and 5 O'Clock Shadow — implementation plan (slice 5 of 6)

> Executed natively (Tarik's choice since slice 1). Spec: `docs/superpowers/specs/2026-10-06-chatgpt-app-design.md`, "Requests and 5 O'Clock Shadow".

**Goal:** From ChatGPT, a signed-in listener drafts a song request or a 5 O'Clock Shadow suggestion (88Nine's daily 5 pm cover song), sees exactly what will be sent, taps **Send**, and the station's inbox receives it. Nothing sends without the tap. ChatGPT door only.

**Decisions (Tarik, 2026-10-07):** email via Resend (his account, `RESEND_API_KEY`), sent from `rmke.org` (verified), to `digital@radiomilwaukee.org` (`STATION_REQUEST_INBOX`). 5 O'Clock Shadow = a daily 5 pm cover: song, original artist, cover artist.

## Design

- **One tool, `send_station_request`** (chat door only, sign-in required): `kind` (`song_request` | `five_oclock_shadow`), `song`, `artist`, `coverArtist` (5 O'Clock Shadow), `note` (optional, ≤ 300), `token` (only the card sends it).
- **Draft call (no token):** validates, returns a preview card. Its **Send** button carries a sealed token (AES-GCM via the existing `seal`/`open` helpers, key separated by purpose from `GIVE_TOKEN_SECRET`, 30-minute expiry) holding the listener id and the exact request. The token lives only in the card HTML (`_meta`), which the model never sees, so only the listener's tap can send.
- **Send call (token):** the token must open, be unexpired, and name the calling listener; then the daily cap is checked, the email sent, the cap counted. The card turns into "Sent to Radio Milwaukee ✓". Any failure turns the card into a plain message (no silent failure, no "sent" claim).
- **Daily cap:** 3 per listener per Milwaukee day, stored in the listener's Clerk private metadata beside the membership record (`CLERK_SECRET_KEY`). Without it, requests are unavailable (fail closed).
- **Email:** plain text, sanitised one-line subject; no listener name, email or id in the message. Logs record only `{event, kind}`.
- **No new dependencies:** Resend's REST API through `fetch`.

## Tasks (TDD each)

1. `src/lib/requests.ts`: validation, email text, token seal/open, daily cap (store interface + Clerk store), Resend sender. Unit tests `tests/requests.test.ts`.
2. Views `request` and `request-status` + chat styles. Tests in `tests/chatCard.test.ts`.
3. Register the tool on the chat door only; sign-in schemes, status line, widget-callable. Tests in `tests/chatDoor.test.ts` (draft hides the token from the model; send with a forged, expired or other listener's token is refused; cap; Alexa tool list unchanged).
4. Env on Preview: `STATION_REQUEST_INBOX` (Claude), `CLERK_SECRET_KEY` (Tarik). Hand test: draft → Send → email arrives at digital@radiomilwaukee.org.
