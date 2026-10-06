# Friction log — Radio Commons (Alexa+ track)

*Draft by Claude from the repo's history; Tarik reviews each entry before submission.*

Tarik Moody (Radio Milwaukee) built Radio Commons, an MCP server (a web service that hands an AI assistant a set of named tools it can call) that lets Alexa+ answer from a public radio station's own stories, playlist, events and a listener's saved songs. Built October 2–5, 2026, with Claude Code; every entry below cites the commit, file or doc where the friction shows up.

## Amazon tools and services

### 1. Alexa+ developer tools (`alexa-ai` CLI, web simulator) — onboard the add-on and test it on Alexa+
- **Steps:** Followed the Alexa+ MCP quickstart: install the `alexa-ai` CLI, `alexa-ai configure`, then `alexa-ai new mcp` / `alexa-ai deploy`, then test in Amazon's web simulator and on an Echo Show.
- **Expected:** A hackathon entrant on the Alexa+ track can configure the CLI and try the add-on in Amazon's simulator. **Actual:** Onboarding stopped at Amazon's access step ("their developer-tools role doesn't yet trust our AWS account"). Amazon then confirmed on the hackathon forum: "Access to the Alexa+ developer tools will not be granted to hackathon participants … The tools are in preview with select partners only."
- **Severity:** Blocker (the add-on could never be run on Alexa+ itself during the hackathon).
- **Workaround:** Built our own Echo Show simulator: Claude Haiku 4.5 on Amazon Bedrock plays Alexa+, calls the real MCP server through the official MCP client, Amazon Polly speaks the reply. We committed the add-on manifest and a test that checks it against the server, but could not deploy it.
- **CLI and manifest, never validated:** The `alexa-ai` CLI was never installed or run on the build machine (checked 2026-10-06: not on PATH, no shell history), because developer-tool access is not granted to hackathon entrants. So the manifest `alexa/addon-package/addon.json` was written by hand from the docs (commit `ad4dbe0`, 2026-10-04) and could not be validated: the `spokenForm` IPA field (a pronunciation spelling) is a placeholder and the icons are placeholders.
- **Suggestion:** State on the hackathon page and at the top of the quickstart that track entrants will not get developer-tool access, and either give entrants a sandbox add-on stage or publish a downloadable reference simulator (a host that speaks MCP + MCP Apps the way Alexa+ does) so everyone tests against the same behavior. Also publish a JSON schema or validator for `addon.json` that works without CLI access, and document the IPA field with an example.
- **Evidence:** `docs/LEARNING-LOG.md:11`; `docs/decisions/002-alexa-simulator.md:5`; `docs/superpowers/specs/2026-10-02-alexa-simulator-design.md:7` (forum link); `README.md:80`; commit `ad4dbe0` (manifest + `tests/alexaAddon.test.ts`).

### 2. Alexa+ add-on docs — response-time budget
- **Steps:** Designed every tool around the quickstart's latency rule, then later read the functional requirements page.
- **Expected:** One number. **Actual:** The MCP quickstart says "Your MCP server must meet a round-trip query response latency of less than 500 ms." The functional requirements page says "Return results within 3 seconds. If processing takes longer, surface an interim message." (both re-read 2026-10-05). The 500 ms rule drove the design: a 350 ms cut-off on every station-data call, a warm-up call when the server starts, a region pinned next to the database, and story search limited to about a day of plays because deeper scans took 1.3–2 s. Later features (search, digest) quietly moved to 1.5–2 s limits under the 3-second reading.
- **Severity:** High (it shaped the architecture and cut features, and we still don't know which number reviewers enforce).
- **Workaround:** Kept 350 ms for simple lookups; gave search 2 s and the digest 1.5 s; moved slow work (Apple Music add, story lookup) into background jobs so the reply reads stored results.
- **Suggestion:** Reconcile the two pages into one stated budget, say whether it is measured at the server or end to end, and say how an MCP tool should "surface an interim message" (the tool protocol has no obvious way to speak one).
- **Evidence:** `docs/superpowers/specs/2026-10-02-story-tools-design.md:26,100`; `docs/decisions/001-radio-commons-foundation.md:5,15`; `src/lib/backstory.ts:52-53`; `src/app/api/mcp/route.ts:13-15`; `src/lib/playlist.ts:122-128`; commit `4322f6c` (search depth); `docs/HACKATHON.md:51`.

### 3. MCP toolkit Local Inspector — see how our card renders on an Alexa+ screen
- **Steps:** Designed the on-screen card (an MCP App, i.e. a small web page Alexa+ shows next to its answer) to Amazon's MCP Design Guide and wanted to preview it in real device frames.
- **Expected:** Use the Local Inspector the quickstart links to. **Actual:** Not available to hackathon participants, so we could not check fidelity or what the real screen's security rules allow.
- **Severity:** High (unverifiable risk on the most visible part of the add-on).
- **Workaround:** Followed the written design rules; our simulator applies no security restrictions, so we guessed conservatively: no outside photos on event tiles "which a real Alexa+ screen would block", an explicit list of allowed image/audio hosts. Still unverified: whether the pan-and-zoom map's background workers (separate scripts a map library starts) are allowed on a real screen.
- **Suggestion:** Publish the exact Content Security Policy (the browser rule list of what a card may load) that Alexa+ applies to MCP Apps, including workers and image hosts, and ship the Local Inspector as a standalone open download.
- **Evidence:** `docs/decisions/004-alexa-design-guide.md:17,19`; `src/lib/card/views.ts:178`; `src/lib/mcp.ts:32-43`; commits `9dc6e27`, `8f1f050` (allowed hosts added one at a time).

### 4. Alexa+ add-on docs — what happens when a customer opens the add-on by name
- **Steps:** Read eight Alexa+ add-on pages on 2026-10-04 and 2026-10-06 looking for first-use, launch, welcome or discovery behavior: Overview, Functional Requirements, The Conversation Surface, MCP Client and App Lifecycle, Evaluate Your UX, Test Your Customer Experience, Components and Patterns, and Write a Great Alexa+ Store Listing (all under https://developer.amazon.com/docs/alexaplus/add-ons/).
- **Expected:** Guidance on what a customer hears and sees when they invoke the add-on by name with no request, and how Alexa+ routes a request to an add-on.
- **Actual:** The Store Listing page says "Your add-on name is also your invocation name: the phrase customers can say to reach your CX", and Functional Requirements says to "return a useful, contextually relevant summary when the customer asks 'What can you do?'". But none of the eight pages we read describes the launch or first-turn experience (no welcome, greeting or start-screen pattern; Components and Patterns covers only List, Carousel, Card and Map), and MCP Client and App Lifecycle does not say how Alexa+ decides which add-on handles a request.
- **Severity:** Medium (we had to guess the first-use experience; the invocation name's pronunciation field, `addon.json` `spokenForm`, also could not be validated, see entry 1).
- **Workaround:** Built a `what_can_you_do` tool and a capabilities card (PR #66) and made the simulator's start screen show it, labelled as a simulation of what Alexa+ would show.
- **Suggestion:** Document the bare-invocation turn ("Alexa, Radio Commons"): what the add-on receives and whether a card can be shown. Explain how routing between add-ons works. Add a "welcome / what can you do" pattern to Components and Patterns.
- **Evidence:** The eight pages above (read 2026-10-04/06); PR #66; `alexa/addon-package/addon.json`.

### 5. Amazon Music Web API — save a song to the listener's Amazon Music library
- **Steps:** Looked for a way to let a listener save a played song to Amazon Music, as we do for Apple Music.
- **Expected:** An Alexa+ add-on can save to the listener's Amazon Music library. **Actual:** The Amazon Music Web API is invite-only (closed beta, "contact your Business Development representative"), and its documented scopes have no "save to library". Tarik confirmed he cannot apply for access.
- **Severity:** Medium (an Alexa+ add-on can save to Apple Music but not to Amazon's own service).
- **Workaround:** Kept Apple Music only; the write-up says so in one honest line.
- **Suggestion:** Open the Music Web API to Alexa+ add-on builders, or give add-ons an Alexa-native "save to the listener's Amazon Music library" action.
- **Evidence:** `/Users/tarikmoody/Projects/radio-commons-video/plans/listener-gaps-plan.md` (gap 1 and its friction-log section); no Amazon doc URL was recorded in the plan.

### 6. Alexa+ add-on docs — start audio on a speaker
- **Steps:** Wanted "play HYFIN" to work from inside the add-on on an Echo Dot.
- **Expected:** A documented way to hand a live stream to Alexa's own player. **Actual:** The functional requirements cover video playback, but an MCP add-on has no documented way to start audio. A station's add-on can describe the station but cannot play it. Not tested on a device.
- **Severity:** Medium (a radio station's core use, and it is not possible).
- **Workaround:** Plan: test the exact handoff phrase on a real Echo and say what happens.
- **Suggestion:** An add-on result type that says "play this stream URL" through Alexa's player.
- **Evidence:** `listener-gaps-plan.md` (gap 2); no Amazon doc URL was recorded in the plan.

### 7. Account linking for add-ons — make Alexa+ start linking when a tool needs the listener's account
- **Steps:** Implemented Amazon's spec (OAuth 2.1, a sign-in standard; PKCE S256; protected-resource metadata at `/.well-known/oauth-protected-resource`), with six tools that need a linked account.
- **Expected:** A tool can signal "account needed" from inside the tool. **Actual:** Amazon wants an HTTP 401 response, but an MCP tool cannot set the HTTP status, so a gate in front of the MCP endpoint has to read the raw request, including JSON-RPC batches (several calls in one request), to spot a linked-only tool. Separately, our tool descriptions said "Requires a linked account", which invites the AI to skip the tool for an unlinked listener, so the 401 that starts linking would never be sent; we rewrote all six to "Always call this tool … the tool starts account linking itself".
- **Severity:** Medium (works now, but every add-on author has to discover both halves).
- **Workaround:** HTTP-level gate (`gateAuthTools`), batch-aware, with `invalid_token` when a bad token was sent; a test pins the description wording.
- **Suggestion:** Add a sample to the account-linking page showing the 401 + `WWW-Authenticate` gate for one tool among many, and a line on how to word tool descriptions so the host still calls linked tools for unlinked listeners.
- **Evidence:** `src/lib/listenerAuth.ts:59-84`; `src/lib/sim/mcpClient.ts:24-25`; commits `d50ec8d`, `91d4259`, `fb93ebb`; `tests/mcp.test.ts` ("linked-account tools tell the host to always call them").

### 8. Alexa+ add-on docs — what the host remembers between turns
- **Status:** Per Amazon's docs, not observed on a device. The invented-id failures below were seen in our own simulator (Claude Haiku 4.5 on Bedrock), not on Alexa+.
- **Steps:** Built "save number 3" after a numbered song list, and follow-up questions about a story on screen.
- **Expected:** Clear guidance on whether earlier tool results (ids, lists) stay in the conversation. **Actual:** The docs say Alexa+ keeps conversation context and that "Your tools must be able to return relevant confirmation data so Alexa can answer these recall questions", but no doc states how long tool results stay in context (the Components and patterns page, https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html, implies recall within a conversation but gives no limit); we built server-side screen memory because of it. In our tests the AI invented ids (`this-bites-frugal-dining`, `king_tuff_twisted_on_a_train`) when it lost them, and "save #3" saved nothing.
- **Severity:** Medium (wrong song saved, or nothing, with no error the listener can act on).
- **Workaround:** The server remembers the numbered list it last showed each linked listener for 30 minutes; tools accept title/artist as well as ids; a named song beats a number.
- **Suggestion:** Document exactly which parts of a tool result Alexa+ keeps across turns and for how long, with a worked "save number 3" example.
- **Evidence:** `docs/HACKATHON.md:9`; `docs/superpowers/specs/2026-10-02-story-tools-design.md:27`; `docs/LEARNING-LOG.md:36`; commits `11984d4`, `51ba44d`, `90bb9c0`; `src/lib/mcp.ts:180-183,514`.

### 9. Amazon Location Service — a static map picture with pins in the right place
- **Steps:** Requested a static map image of story places and drew numbered pins over it.
- **Expected:** Pass center + zoom, get the area our pin math expects. **Actual:** Four live tries: coordinates with too many decimals were refused; the default style is Satellite; the zoom level counts 256-px tiles and still didn't match after a one-level correction. Every unit test passed while a Wauwatosa pin sat near West Bend.
- **Severity:** Medium (wrong pins look broken to a listener; caught only by screenshot).
- **Workaround:** Ask for the exact bounding box instead of a zoom; request the Standard style, `@2x`, 6-decimal coordinates; log Amazon's error reason.
- **Suggestion:** In the static-map docs, state the coordinate precision limit, the default style, the tile size behind `zoom`, and show a bounding-box example for overlaying your own markers.
- **Evidence:** commits `cb56eaa`, `4ed1316`, `af8a900`, `025b3ab`; `docs/LEARNING-LOG.md:48-49`.

### 10. Amazon Polly (simulator voice) — speak a reply quickly
- **Steps:** `SynthesizeSpeech` with the generative engine (voice Ruth), MP3, waiting for the full audio before playing.
- **Expected:** About 0.5 s (our design budget). **Actual:** 5.5 s to voice a 70-word reply, over half of a 10.7 s turn.
- **Severity:** Medium (simulator only, but it decided whether the demo felt like Alexa).
- **Workaround:** Stream Polly's audio to the browser through a short-lived signed link and cap replies at two sentences: about 3.9 s from button release to hearing the answer.
- **Suggestion:** Put a first-byte vs full-synthesis latency table per engine in the Polly docs, and a "stream to a browser" sample for the generative engine.
- **Evidence:** commit `7fd1ea7`; `docs/LEARNING-LOG.md:20-21`; `docs/superpowers/specs/2026-10-02-alexa-simulator-design.md:77`; `src/lib/sim/tts.ts:3-8`, `src/lib/sim/speak.ts:8`.

### 11. Alexa+ add-on docs — tools cannot tell whether the device has a screen
- **Steps:** Wanted a shorter spoken answer on a speaker and a fuller one on an Echo Show.
- **Expected:** A device hint reaches the tool call. **Actual:** Device details go to the card (`hostContext`) but not to the tool call, so a tool cannot pick a shorter spoken answer for a speaker. Whether Alexa+ sends any hint in tool calls is not yet verified on a device.
- **Severity:** Low (answers are the same length everywhere).
- **Workaround:** None; one answer for every device.
- **Suggestion:** A device-class hint in the tool call's `_meta`.
- **Evidence:** `listener-gaps-plan.md` (gap 4).

### 12. Amazon Bedrock Converse (Claude Haiku 4.5) — carry a trimmed conversation history
- **Steps:** Sent the last few turns of the conversation with each Converse call.
- **Expected:** Any recent window of turns is accepted. **Actual:** Bedrock rejects a conversation that opens with an assistant turn, so a trimmed window can fail.
- **Severity:** Low (one-line fix once known).
- **Workaround:** Trim history to start at the first listener turn.
- **Suggestion:** Show this rule, and the error text it produces, in the Converse API's message-ordering section with a trimming example.
- **Evidence:** `src/lib/sim/turn.ts:50-55`; commit `21702ec`.

### 13. Alexa+ add-on docs — proactive updates
- **Steps:** Wanted "what's new for me" to reach listeners when a followed artist announces a show.
- **Expected:** A documented way for an MCP add-on to notify. **Actual:** Not documented for MCP add-ons.
- **Severity:** Low (feature cut, not broken).
- **Workaround:** The digest waits for the listener to ask.
- **Detail:** As far as we found, proactive notifications exist only for smart-home devices, so "tell me when an artist I follow books a show" cannot be delivered; listeners have to ask.
- **Suggestion:** Say plainly whether MCP add-ons can send notifications, and if not, whether it is planned; ideally offer opt-in add-on notifications that respect Alexa's existing quiet hours.
- **Evidence:** `docs/HACKATHON.md:85`; `src/lib/howItWorks.ts:60`.

### 14. Account linking for add-ons — what the add-on should say first
- **Steps:** Planned the linking flow for screenless devices, where linking goes through a phone push.
- **Expected:** Guidance on the first spoken line. **Actual:** Amazon gives no guidance on what the add-on should say before the handoff, so every add-on will word it differently.
- **Severity:** Low.
- **Workaround:** Wrote our own wording.
- **Suggestion:** A standard spoken line, or let the add-on supply one sentence that Alexa reads before the handoff.
- **Evidence:** `listener-gaps-plan.md` (gap 5).

## Other tools

### 15. Vercel — story card script unreadable at runtime
- **Steps / Actual:** The MCP Apps bundle read from disk at runtime failed in Vercel functions with `EBADF`. **Severity:** High (card broken in production). **Workaround:** Embed the bundle at install time (`scripts/embed-app-bundle.mjs`). **Suggestion:** Vercel docs: a note on reading non-JS assets from `node_modules` in functions. **Evidence:** commit `351d9da`; `docs/LEARNING-LOG.md:10`.

### 16. Vercel — cold starts against a 500 ms budget
- **Actual:** First calls after a deploy took 746–1,002 ms versus 105–180 ms warm; the first search hit our 350 ms cut-off. **Severity:** Medium. **Workaround:** Pin `iad1` near Convex; open the database client and wake the Field Guide when the server starts. **Suggestion:** A documented keep-warm option for latency-bound MCP endpoints. **Evidence:** `docs/decisions/001-radio-commons-foundation.md:15`; `docs/LEARNING-LOG.md:8-9`; `src/app/api/mcp/route.ts:10-20`; commit `3a22fbd`.

### 17. Apple MusicKit — add a saved song to the listener's library
- **Actual:** `authorize()` rejects with a generic `AUTHORIZATION_ERROR` when the Apple ID has no Apple Music subscription, the same error as a declined prompt. **Severity:** Medium (listener sees "try again" with no way forward). **Workaround:** Show "saving to your library needs an Apple Music subscription" on that error. **Suggestion:** A distinct error code for "no subscription". **Evidence:** commit `c7892c1`.

### 18. Convex — production import worked in tests, would fail live
- **Actual:** The live database connection cannot run transactions while the in-memory test database can, so the Concert Picks import would have failed every time in production. **Severity:** Medium (caught by review, not tests). **Workaround:** A test on a database that refuses transactions. **Suggestion:** Make the test driver refuse transactions the way production does, or document the difference. **Evidence:** `docs/LEARNING-LOG.md:78` (work in the Backstory repo).

### 19. Clerk and `mcp-handler` — OAuth details for Alexa+ account linking
- **Actual:** Clerk's OAuth tokens carry no `aud` (audience) claim, so the token is bound by issuer + client id instead; hash-routed sign-in did not return to the connect page; `mcp-handler`'s `protectedResourceHandler` cannot list `scopes_supported`. **Severity:** Low. **Workaround:** Local issuer/client-id check; fixed redirect; generate the metadata ourselves. **Suggestion:** Clerk: an `aud` option per OAuth app; `mcp-handler`: a scopes parameter. **Evidence:** `src/lib/listenerAuth.ts:41`; commit `becb0b3`; `src/app/.well-known/oauth-protected-resource/route.ts:3-10`.

### 20. Next.js on GitHub Actions — typecheck in CI
- **Actual:** Generated route types were missing in CI, so typecheck failed. **Severity:** Low. **Workaround:** Generate route types before typecheck. **Evidence:** commit `e5ad353`; `docs/LEARNING-LOG.md:10`.

### 21. GitHub Actions — `next/font` Google Fonts downloads failing CI
- **Steps:** Ran CI on pull requests that build the Next.js app.
- **Expected:** The build passes. **Actual:** CI failed on `next/font` Google Fonts downloads and passed on re-run. Re-runs overwrite the visible conclusion, which is why it looked clean.
- **Severity:** Low.
- **Workaround:** Re-run the job.
- **Suggestion:** Self-host fonts (`next/font/local`).
- **Evidence:** GitHub Actions runs 37255213140 (attempt 2, branch `fix/dates-and-tomorrow`, 2026-10-05) and 37249831163 (attempt 2, `feat/listener-memory`, 2026-10-05) in tmoody1973/radio-commons; also seen on PR #63's run on 2026-10-04.

### 22. Our own data (NPR Cadence) — HYFIN schedule has gaps
- **Steps:** Read HYFIN's schedule from NPR Cadence for what's-on answers.
- **Expected:** A complete weekly schedule. **Actual:** HYFIN's schedule has no weekends and no midnight to 6 a.m. This is our station-side data, not an Amazon issue; recorded so the write-up does not overclaim.
- **Severity:** Low.
- **Workaround:** None in the add-on.
- **Suggestion:** Station-side fix in the Cadence schedule.
- **Evidence:** `listener-gaps-plan.md` (gap 6).
