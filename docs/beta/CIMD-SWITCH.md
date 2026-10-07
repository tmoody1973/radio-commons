# Runbook: let ChatGPT sign in without a client ID or secret (Clerk CIMD)

**When:** after October 23, before the first beta invitation. Never during Alexa+ judging: the Clerk setting is shared with Alexa.
**Time:** about 45 minutes, plus the code change (under an hour, done before you start).
**Who:** Tarik (Clerk dashboard, a second ChatGPT account) and Claude (checks, code, page update).

## What this does, in plain English

Clerk is the front desk for Radio Milwaukee accounts. Today ChatGPT shows the front desk a key card (a client ID) and a PIN (the client secret) that we created by hand. Every tester's ChatGPT would need a copy of both.

After the switch, ChatGPT identifies itself by a public web address that only OpenAI controls: `https://chatgpt.com/oauth/client.json`. Clerk checks that address, and nothing secret changes hands. Testers paste our server address and click Create.

Two settings make it work:
- **Publish CIMD support:** the front desk's sign saying "apps can identify themselves by web address". ChatGPT reads this sign; without it, ChatGPT greys the option out ("CIMD is unavailable because the server did not advertise CIMD support", seen on 2026-10-07).
- **Only allow pre-registered clients:** the front desk accepts only web addresses we approved, so other apps can't use the same trick to ask our listeners to sign in.

## Before you start

- [ ] October 23 has passed and the Alexa+ submission is in.
- [ ] Claude has merged the code change in step 3 below to the ChatGPT branch (tests green). It only *adds* the new ID, so it's safe to deploy first.
- [ ] You can sign in to the Clerk dashboard for the instance `creative-dory-9232`.
- [ ] You have a **second ChatGPT account** (a fresh one is best: it plays the tester).
- [ ] **Alexa baseline:** in the Alexa app, confirm Radio Milwaukee's account linking works today (open the skill's settings and check it's linked, or link a test account). We compare after.

## Step 1: approve ChatGPT's address in Clerk (Tarik, 5 min)

1. Open the Clerk dashboard → **OAuth applications** → **Settings** tab → **Client admission**.
2. Pre-register ChatGPT's client ID: `https://chatgpt.com/oauth/client.json`.
   - If Clerk asks for redirect URLs, use `https://chatgpt.com/connector_platform_oauth_redirect` (the one already on our current ChatGPT client).
   - If ChatGPT later shows a different ID (a variant with a number in the middle, `https://chatgpt.com/oauth/<number>/client.json`), pre-register that one too. ChatGPT shows the exact ID on the plugin's settings page.
3. Turn on **Only allow pre-registered clients** (Clerk's wording may differ slightly).

Nothing changes for anyone yet: the sign isn't up.

## Step 2: put the sign up (Tarik, 1 min)

Same page, **Client onboarding** section: turn on **Publish CIMD support**. Leave **Publish DCR support** off.

(The same settings can be changed from the command line: `npx clerk@latest api instance/oauth_application_settings -X PATCH -d '{"client_id_metadata_documents_advertised": true, "client_id_metadata_documents_only_allow_pre_registered_clients": true}'`. Pre-registering a client is dashboard-only.)

**Claude checks the sign is up:**

```
curl -s https://creative-dory-9232.clerk.accounts.dev/.well-known/oauth-authorization-server | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("client_id_metadata_document_supported"), d.get("token_endpoint_auth_methods_supported"))'
```

Expected: `True` and a list containing `none`. On 2026-10-07 this printed `None` (no sign).

## Step 3: our server accepts ChatGPT's new ID (Claude, before the day)

Today the ChatGPT side accepts exactly one client ID (`CLERK_CHATGPT_OAUTH_CLIENT_ID`, in `src/lib/listenerAuth.ts`). The change: accept a short list, so the new `https://chatgpt.com/oauth/client.json` works **and** Tarik's existing connection (the old key card) keeps working. Test first: tokens from either ID are accepted, any other ID is refused, and Alexa's check is unchanged.

## Step 4: the tester run-through (Tarik with Claude, 15 min)

On the **second** ChatGPT account, follow https://chatgpt-dev.rmke.org/beta exactly, as a tester would:

1. Plugins → **Add** → **Add custom MCP server**, name, paste the address, **OAuth**.
2. Open **Advanced OAuth settings** and look (don't change anything): the registration method should show **Client Identifier Metadata Document (CIMD)**, no longer "Unavailable". OpenAI says ChatGPT prefers it automatically when it's offered. Take a screenshot.
3. Tick the warning box, **Create as a plugin**, sign in to Radio Milwaukee, **Allow**.
4. In a new chat: *"@Radio Milwaukee open the station home"*, then save a song (this proves the sign-in reached our server).
5. On the plugin's settings page, note the client ID ChatGPT shows. It should match what you pre-registered in step 1.

Claude then rewrites step 4 of `/beta` to match exactly what the screen showed.

## Step 5: check nothing else moved (10 min)

- [ ] **Alexa:** account linking still shows linked; a signed-in Alexa request (for example saving a song) still works.
- [ ] **Your own ChatGPT** (the old connection): still signed in; save a song.
- [ ] Claude re-runs the full test suite and the Alexa snapshot tests.

Then the invitations can go.

## If something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| CIMD still "Unavailable" in ChatGPT | The sign isn't up | Re-run the step 2 check; re-check the toggle |
| Clerk error during sign-in, such as `invalid_client_metadata` or "client not allowed" | ChatGPT's ID isn't pre-registered exactly, or Clerk rejects part of ChatGPT's document (Auth0 had this: ChatGPT prefers a signed-key method, `private_key_jwt`, and also offers `none`) | Compare the ID on ChatGPT's plugin page with step 1. If it still fails, contact Clerk support with the error, and use the fallback below |
| Sign-in works, but tools keep asking to sign in | Our server refuses the new ID | Claude checks which ID the token carries (without logging the token) and adds it to the list |
| Anything wrong with Alexa | Unexpected | **Undo immediately** (below) |

## Undo (2 minutes)

Turn off **Publish CIMD support** (and, if you like, **Only allow pre-registered clients**). Nothing is deleted. Alexa and your existing ChatGPT connection use their own key cards and keep working. Testers who connected through CIMD would need to reconnect later.

## Fallback if CIMD won't work with Clerk

Make our ChatGPT sign-in client in Clerk a **public client**: it signs in with a one-time check (PKCE) instead of a secret. Testers then paste only the **client ID**, which isn't sensitive and can sit on `/beta` with a Copy button, and pick token method **none**. It's one more step for testers, but there's still no secret, and it changes only ChatGPT's own client, not Alexa's.

## Sources

- OpenAI, Authentication for apps (CIMD, precedence, token methods, `resource`): https://developers.openai.com/apps-sdk/build/auth
- Clerk, MCP server guide and OAuth settings (CIMD, pre-registration, DCR): https://github.com/clerk/clerk-docs/blob/main/docs/guides/ai/mcp/build-mcp-server.mdx
- Auth0 community, CIMD and ChatGPT incompatibility (unresolved): https://community.auth0.com/t/auth0-cimd-registration-appears-incompatible-with-the-current-chatgpt-client-id-metadata-document/203817
