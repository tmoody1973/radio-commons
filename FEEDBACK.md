# Feedback: the tools, APIs and SDKs behind Radio Commons

Radio Commons is an MCP server (Model Context Protocol, the standard Alexa+ add-ons use to call outside tools) that lets Alexa+ answer from 88Nine Radio Milwaukee's own storytelling and music. It was built October 1–23, 2026 by Tarik Moody with Claude Code, across five repos: [radio-commons](https://github.com/tmoody1973/radio-commons) (the MCP server), [backstory](https://github.com/tmoody1973/backstory) (the story engine), [mke-field-guide](https://github.com/tmoody1973/mke-field-guide) (events and review screens), [rm-playlist-v2](https://github.com/tmoody1973/rm-playlist-v2) (playlists, saved songs, listener memory) and a Remotion project for the demo video.

Every claim below comes from a decision record, a learning-log entry, a code comment or a measurement taken while building. References like `decision 007` point to `docs/decisions/` in the repo that owns the work; `LEARNING-LOG` is `docs/LEARNING-LOG.md`. Where we have no evidence, we say so.

**About the "Would we build with it again?" lines:** Claude drafted them from the decisions we made; Tarik confirms or rewrites each one. Lines still marked *(draft)* have not been confirmed yet.

---

## Amazon

### Alexa+ (MCP add-ons, `alexa-ai` CLI, Design Guide, account linking)

- **Used for:** the whole project is an Alexa+ add-on. The manifest is `alexa/addon-package/addon.json` (MCP integration, example phrases, privacy URL), checked offline by `tests/alexaAddon.test.ts` and deployed with `npm run alexa:deploy`. 23 tools, Echo Show cards as an MCP App, and listener account linking over OAuth 2.1.
- **What worked well:**
  - The MCP route is the right shape for a station. We didn't have to learn a skill-specific interaction model, and one standard server can serve any station, keyed by station id.
  - The [MCP Design Guide for Alexa+](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide-overview.html) is concrete enough to build from: one title, one or two fields, one action, a 768×480 base, light and dark, 48 px touch targets, four layouts. Our first card broke almost every rule because it was designed from a bullet point. Following the guide fixed it (decision 004, LEARNING-LOG Oct 3).
  - The docs give rules you can quote and test against:
    - "Return results within 3 seconds."
    - The recall guidance: "Your tools must be able to return relevant confirmation data so Alexa can answer these recall questions."
    - These shaped our 350 ms Backstory timeout and our remembered numbered lists.
- **What needs work:**
  - **Hackathon entrants can't use the developer tools.** Amazon's forum answer: "Access to the Alexa+ developer tools will not be granted to hackathon participants … The tools are in preview with select partners only." Our onboarding stopped at the access step: "their developer-tools role doesn't yet trust our AWS account" (LEARNING-LOG Oct 2).
    - **Nothing ran on a real device.** No add-on test on a real Echo or in Amazon's web simulator.
    - **No Local Inspector.** It's the card preview in device frames, and it isn't available to entrants (decision 004), so cards follow written rules only.
    - **We built our own simulator instead.** It plays Alexa+ around the real server (decision 002). That cost about two days that would have gone into features.
  - **Documentation gaps we hit:**
    - No proactive notifications for MCP add-ons, so "what's new for me" waits for the listener to ask.
    - Nothing on whether `openLink` works on an Echo Show, or whether a hosted payment page works in its web view (Amazon Pay research, Oct 5).
    - The checkout pages mention a Solutions Architect but not recurring payments or a sandbox.
    - Dynamic client registration isn't supported for account linking.
  - **The agent forgets ids between turns.** In live testing, "save number 3" saved nothing, because the model no longer had the song's id (rm-playlist-v2 decision 009). We now remember the last numbered list on the server for 30 minutes. A documented pattern for this would help every add-on.
  - The `alexa-ai` CLI needs Node.js 24+, while the rest of our stack is on Node 20.
- **Onboarding (zero to hello world):** the documented path is short (`alexa-ai configure` → `alexa-ai new mcp --mcp-server-url …` → `alexa-ai deploy`). We never got past the access step, so we have no time to report. Our "hello world" became `scripts/smoke.mjs`, which calls the endpoint exactly as Alexa+ does (protocol 2025-11-25).
- **Would we build with it again?** *(draft)* Yes. It's the right channel for a station: 40% of Radio Milwaukee's streaming hours are on smart speakers (Triton, August 2026). We'd want developer-tool access and the Local Inspector before the next build.

### AWS Bedrock (Claude Haiku 4.5, Amazon Nova)

- **Used for:**
  - **Backstory's extraction:** pulling people, places and actions out of transcripts.
  - **The simulator's "Alexa" brain:** Haiku 4.5 through the Converse API with tool use.
  - **A test of Nova 2 Lite with web grounding** for enriching place details (rejected).
- **What worked well:**
  - It kept everything on one AWS account and its credits (Backstory decision 006).
  - A least-privilege IAM user that can only invoke the Haiku profile and Polly was easy to set up for the simulator.
- **What needs work:**
  - **Nova Micro** "paraphrased instead of copying quotes, so the evidence check threw away every This Bites action". Our pipeline only keeps facts backed by a word-for-word quote.
  - **Nova Lite** "failed 3x: broken tool output, then 41+ mentions over the cap" (Backstory LEARNING-LOG).
  - **Nova 2 Lite with grounding**, tested for place details in the build sessions, didn't return reliable details for Milwaukee businesses. We used Amazon Location's place details instead.
  - **Sonnet 5.5 on Bedrock was never run.** It needs a one-time Marketplace subscription, rejects forced tool choice (a code change), and its price wasn't in AWS's pricing service yet (Backstory decision 006).
- **Onboarding:** not recorded.
- **Would we build with it again?** *(draft)* Yes for Claude Haiku on Bedrock. Not Nova for extraction that has to quote word for word.

### Amazon Polly

- **Used for:** the simulator's spoken replies.
- **What worked well:** streaming the audio through a short-lived signed link took Polly out of the critical path (LEARNING-LOG Oct 2).
- **What needs work:** before that change, Polly was the slowest step: a 70-word reply took 5.5 s of a 10.7 s turn.
- **Onboarding:** not recorded.
- **Would we build with it again?** *(draft)* Yes, for the simulator; streaming from the start.

### Amazon Location Service

- **Used for:**
  - Static map pictures on cards (`/api/map`; the key stays on the server).
  - A pan-and-zoom fullscreen map (a browser key limited to map tiles).
  - Geocoding 155 event venues and the places in stories.
  - "Fetch details": phone, website and hours via place search with contact details.
- **What worked well:**
  - It looked up 155 venues for about $1.25, and 154 matched. Venue pin coverage went from 35% to 97% (decision 005, LEARNING-LOG Oct 3).
  - A bounding box instead of a zoom level made pins land exactly.
- **What needs work:**
  - **The static map took four live tries:**
    - Coordinates with too many decimals were refused.
    - The default style is satellite, which can't do light or dark.
    - The zoom numbers didn't line up with our pin math, even after a one-level correction (LEARNING-LOG Oct 3).
  - **Address normalization surprised us:** "108 East Wells Street" came back as "108 E Wells St".
  - **Very new places aren't in the map data yet** (Backstory LEARNING-LOG).
- **Onboarding:** an `aws login` session, then `SearchText` in us-east-1 with a Milwaukee bias. Hello world in minutes; getting the static map right took an evening.
- **Would we build with it again?** *(draft)* Yes. It's cheap and accurate for geocoding. Static maps need better docs on zoom versus bounding box.

### Amazon Pay (sandbox donations)

- **Used for:** "I want to support Radio Milwaukee". Monthly membership or a one-time gift, through a signed Amazon Pay button and checkout session, a charge permission, a charge for "simulate next month", and closing the permission to cancel by voice. It's the sandbox only; no real money moves, and Alexa says so. SDK: `@amazonpay/amazon-pay-api-sdk-nodejs` 2.3.6.
- **What worked well:**
  - Recurring payments are supported for US merchants.
  - The sandbox is complete, with test buyers and forced declines: card ending 1111 succeeds, 3434 declines (Amazon Pay decision 008, research Oct 5).
- **What needs work:**
  - **The private key can be downloaded exactly once** ("This is the only time Amazon lets you download it", `docs/GIVE-SETUP.md`).
  - **Real Amazon logins are refused in the sandbox** with "Your order can't be completed with this account", and the message doesn't say why.
  - **Signature algorithm names don't match:**
    - The SDK README uses `AMZN-PAY-RSASSA-PSS`; the button docs use `AMZN-PAY-RSASSA-PSS-V2`.
  - **Donations need prior approval** under the Acceptable Use Policy ("Donations and Charitable Solicitations"). The status of Alexa's own donation feature in 2026 isn't documented.
  - **Monthly charges don't run themselves.** The merchant schedules them; we stand in with a "Simulate next month" button.
  - **Undocumented:**
    - Whether a second charge is accepted immediately.
    - How long an idempotency key lives.
    - How the hosted page behaves on an Echo Show.
  - **Several steps are still untested end to end:** shipping a thank-you gift needs a second checkout flow (`docs/GIVE-PREMIUMS.md`).
- **Onboarding:** "about an hour by hand" (`docs/GIVE-SETUP.md`): a sandbox account, keys from Integration Central, a test buyer, five server settings, a redeploy.
- **Would we build with it again?** *(draft)* Yes, as the natural payment path inside Alexa. We'd want clearer guidance for nonprofits and recurring donations.

---

## The protocol layer

### Model Context Protocol: `mcp-handler`, `@modelcontextprotocol/*`, MCP Apps (`ext-apps`)

- **Used for:**
  - **The endpoint:** `/api/mcp`, Streamable HTTP, protocol 2025-11-25, through `mcp-handler` 2.x.
  - **The Echo Show cards:** an MCP App (`ui://radio-commons/story-card.html`).
  - **The simulator:** it uses the official MCP client and the official `ext-apps` app bridge to host cards the way a real host does.
- **What worked well:**
  - `mcp-handler` speaks the exact protocol version Alexa+ uses through the official library, and the MCP Apps package builds on the same library (decision 001).
  - Because the simulator uses the official client, "the simulator calls the server exactly the way an Alexa+ add-on is called" (decision 002). Our MCP-contract tests and smoke script are worth as much as a device test.
  - Tool descriptions are a strong routing lever. A single sentence ("for what's new at the station this week, use `station_briefing`") moved a phrase from one tool to another.
- **What needs work:**
  - **The card's bundled script couldn't be read inside a Vercel function.** We embed it at install time (`npm ci` runs a postinstall step).
  - **An MCP App starts once.** Our card didn't refresh on a follow-up about the same story; only a real browser run showed it (LEARNING-LOG Oct 2).
  - **Card security settings must list every image and audio host** (for example the podcast CDN domains). A missing one fails silently.
  - **The host model paraphrases tool text.** Our briefing tool returns the newsletter's exact sentences, and the simulator's model retold them in its own words. MCP has no way to mark text "speak verbatim".
- **Onboarding:** `npm ci`, `npm run dev`, then `node scripts/smoke.mjs http://localhost:3000/api/mcp "frugal dining"`. Under an hour to a working tool.
- **Would we build with it again?** *(draft)* Yes. It's the reason one server can serve any station and any MCP host.

---

## Platform and data

### Vercel

- **Used for:** hosting the MCP server, simulator and landing page, and the Field Guide.
- **What worked well:**
  - **Warm calls are fast:** `find_station_story` p50 105 ms, p95 179 ms (LEARNING-LOG Oct 2).
  - **Server settings are write-only once saved.** Good for keys like Mailchimp's, which can't be limited to reading.
- **What needs work:**
  - **Cold starts:** the first calls after a deploy took 746–1,000 ms, over Alexa's 500 ms budget (decision 001). We warm the server before demos.
  - **A changed setting reaches the app only on the next deploy.** That isn't obvious when adding a key.
  - **Preview deploys sit behind Vercel's login by default,** so we couldn't point our simulator at a preview to check a card change. We rendered locally instead.
- **Onboarding:** `vercel link`, `vercel env add …`, `vercel deploy --prod`. Minutes.
- **Would we build with it again?** *(draft)* Yes; it's where the station's other apps already live.

### Next.js 16

- **Used for:** the Radio Commons app and the Field Guide (App Router, server actions).
- **What needs work:**
  - **Generated route types** were missing in CI until the build ran first. They also caused a local type error for a typed layout (`LayoutProps<"/connect">`) until regenerated.
  - **The Amazon Pay SDK needs the Node runtime,** not Edge.
- **Onboarding:** standard. **Would we build with it again?** *(draft)* Yes.

### Convex (Backstory and the playlist database)

- **Used for:**
  - **Backstory's stories, transcripts and job pipeline:** transcribe → extract → geocode, run by the Convex scheduler and a `jobs` table.
  - **Daily imports:** cron jobs bring in each show.
  - **The playlist database:** plays, saved songs and listener memory.
  - **Radio Commons** reads both through public queries.
- **What worked well:**
  - "Mutations are serializable transactions, so two overlapping ingests can't both insert" (`convex/stories.ts`).
  - "A step's output and its job status save in the same transaction" (Backstory decision 003). That made reruns and retries safe.
  - `convex-test` let us test real queries and mutations in memory. 300 Backstory tests run in about 30 s.
  - Adding a show is a short settings entry plus one cron line. On Oct 5 we added a sixth show and imported 16 interviews; all went through transcription and extraction without an error.
- **What needs work:**
  - **Node actions time out at 10 minutes.** Long transcriptions are polled once a minute instead of awaited.
  - **There's no job dashboard** beyond our own table.
  - **The first call after a deploy can time out** for an app with a tight budget like ours (350 ms).
  - **Rules differ from typical database habits:** no `.filter()` in queries, indexes for everything. They are well documented in the project's generated AI guidelines file, but easy to get wrong from memory.
- **Onboarding:** `npx convex dev` gives a working backend in minutes.
- **Would we build with it again?** *(draft)* Yes. Transactions plus the scheduler made a multi-step AI pipeline simple.

### Neon Postgres, Drizzle ORM and PGlite (Field Guide)

- **Used for:** the event guide's database (events, venues, picks), through `drizzle-orm/neon-http`, with tests on PGlite, an in-memory Postgres.
- **What worked well:**
  - Postgres features we needed came built in: trigram matching (`pg_trgm`) for duplicate venues, and `pgvector`.
  - The free tier was enough. PGlite runs 448 tests with no cloud database.
- **What needs work:**
  - **The serverless HTTP driver can't run transactions, but PGlite can.** Our Concert Picks import passed every test and would have failed every time in production. A fresh code review caught it.
  - We now order writes so a crash converges on re-run, and pin the behavior with a test database that refuses transactions (LEARNING-LOG Oct 4). A warning in the driver docs, or a PGlite mode that mimics it, would save others this.
- **Onboarding:** create a database, set `DATABASE_URL`, `npm run db:migrate`. Quick.
- **Would we build with it again?** *(draft)* Yes, with the transaction limit designed in from day one.

### Trigger.dev (Field Guide and playlist jobs)

- **Used for:** scheduled event ingestion, deduplication and enrichment (Field Guide), the playlist poller, and the daily Concert Picks import.
- **What worked well:** the run dashboard and deep links to runs make debugging a failed import quick.
- **What needs work:**
  - **Server settings live separately from the app's,** and are easy to forget. Three API keys were never copied to production, so 439 Ticketmaster events and two other sources went stale.
  - **The CLI couldn't set environment variables for us, and a token we created was rejected by the API.** Tarik had to add the CDS token in the dashboard by hand (build sessions, Oct 4).
  - **On the free plan, a job every minute all month hits the ceiling.** It caused a playlist outage on Aug 25: about 340 songs missed, 266 recovered (rm-playlist-v2 incident report). We upgraded to $10/month.
  - Code under `src/ingestion/` needs a separate Trigger deploy as well as Vercel.
- **Onboarding:** `npx trigger.dev@latest login`, then deploy. The first task runs within an hour; keeping settings in sync is the ongoing cost.
- **Would we build with it again?** *(draft)* For scheduled scraping with retries, yes, on a paid plan. Backstory deliberately chose Convex's own scheduler instead, to avoid a second service writing into the database (Backstory decision 003).

### GitHub Actions (CI) and branch protection

- **Used for:** typecheck, tests and build on every pull request; `main` requires the check.
- **What worked well:** branch protection refused a merge that tried to run ahead of CI, "exactly what it is for" (LEARNING-LOG). CI also caught missing generated types that local runs hid.
- **What needs work:** a docs-only pull request still waits a few minutes for the full build check, and auto-merge is off by default for the repo.
- **Would we build with it again?** *(draft)* Yes.

---

## Content and AI services

### NPR CDS (Content Distribution Service)

- **Used for:** everything Backstory knows about a story starts in CDS:
  - Podcast episodes and their audio.
  - Station articles: premieres, Studio Milwaukee sessions, Concert Picks, artist interviews.
  - Photos and web addresses.
- **What worked well:**
  - **Quoted lyrics are marked consistently** (italic lines with line breaks), so we remove them before any AI sees the text. Zero lyric lines stored (LEARNING-LOG Oct 4).
  - **Canonical web addresses on every story** let three systems connect without a shared id: the newsletter, Backstory and the briefing.
- **What needs work:**
  - **No transcripts,** only show notes and an MP3 (Backstory decision 002). We transcribe everything ourselves.
  - **Results come back oldest first unless you sort explicitly,** despite the docs (comment in `convex/lib/cds.ts`).
  - **Some series documents return 404** (Ladies First), so show artwork has to be optional.
  - **Collections don't match how the station thinks about its content:**
    - Artist interviews and Concert Picks have no collection of their own.
    - We find interviews by web address inside a general feed of about 20 stories a week.
    - A 100-result window had to be searched twice to find a 16th interview.
  - **Audio flags** ("not downloadable", "not streamable") are set on audio the station itself plays on its website, so the flags can't drive playback decisions. Tarik decided case by case (decisions 006 and 009).
- **Onboarding:** a station token and the query API. A first story list takes minutes; learning which collection holds what took days.
- **Would we build with it again?** *(draft)* Yes; it's the station's publishing system. Per-section collections and transcripts would remove most of our workarounds.

### Deepgram (Nova-3)

- **Used for:** transcribing every podcast episode and interview (Backstory), and speech-to-text in the simulator.
- **What worked well:**
  - In a 19-episode bake-off, Nova-3 spelled 84% of answer-key names right versus 74% for Amazon Transcribe, at $0.0043/min versus $0.024/min (about 5.5× cheaper). It fetches audio straight from its URL (Backstory decision 009).
  - A spoken question in the simulator was transcribed word for word in 817 ms.
- **What needs work:**
  - **Name hints are capped at 500 tokens per request.**
  - **Unusual proper names still come out wrong:** "Jake Bowers" for Jake Bauers in the Brewers interview, which an editor has to catch.
  - **Labels are per word.** Our first speaker labels were wrong because we labeled whole utterances (our bug, documented in Backstory's LEARNING-LOG).
- **Onboarding:** an API key and one HTTP call; no SDK needed. Minutes.
- **Would we build with it again?** *(draft)* Yes. Better names for less money was decisive.

### Anthropic Claude (Haiku 4.5)

- **Used for:**
  - Extracting people, places, events and actions from transcripts, each backed by a word-for-word quote.
  - The simulator's assistant.
  - Event tagging in the Field Guide.
- **What worked well:**
  - It copied quotes exactly where Nova paraphrased.
  - Identical counts on repeated runs.
  - $0.008 for a 4-minute episode, $0.029 for a 17-minute one (Backstory decision 006).
  - It followed show-specific instructions well. For the artist interviews we told it guests aren't always musicians, and Jeff Levering and all 28 baseball people he named came out as people, not artists.
- **What needs work:**
  - **Topic selection hit only 67% acceptance** against an 85% target, so we moved topics to a classifier (Jev, below).
  - **In the simulator it invented story ids** ("this-bites-frugal-dining") until we put the real id in front of it. "Prompt rules don't stop a model from guessing an id; giving it the id does" (LEARNING-LOG Oct 2).
  - **Length limits are followed loosely:** it named four places when told "at most two".
- **Would we build with it again?** *(draft)* Yes.

### Jev (topic classifier)

- **Used for:** picking each story's topics from a fixed list (Backstory decision 007).
- **What worked well:** 93% of topics accepted, 91% of the answer key found, 7 of 7 on blind controls, about $0.001 per episode. "Select instead of generate" makes the supporting quotes exact by design.
- **What needs work:** one more vendor and key. Its quotes are whole passages, sometimes a generic intro.
- **Would we build with it again?** *(draft)* Yes, for classification against a fixed list.

### Mailchimp Marketing API

- **Used for:** `station_briefing` reads the newest "Radio Milwaukee Newsletter" campaign (titles, send times and plain-text content only) and turns it into a spoken briefing (decision 007).
- **What worked well:**
  - The plain-text version of the newsletter is clean enough to parse without AI: headings start with `**`, and each item has one station link.
  - `fields=` lets us request only the campaign fields we need.
- **What needs work:**
  - **API keys can't be limited to reading.** A key can do anything in the account, including subscribers. We keep it on the server only, and never request lists, members or reports. A read-only scope would make this safe to give a developer.
  - **The region is the suffix of the key** (`-us7`), which is easy to miss.
  - **Links come out as "text (url)",** so we strip them before Alexa speaks.
  - **The parser depends on the newsletter's current layout;** a redesign needs a code change.
- **Onboarding:** an API key and two GET requests. The first campaign list came back in minutes.
- **Would we build with it again?** *(draft)* Yes, ideally with a read-only key.

### Firecrawl

- **Used for:**
  - "Find booking link" in Backstory's place directory: a web search for a restaurant's reservation page, 2 credits per search.
  - The Field Guide's fallback scraper for JavaScript-rendered or Cloudflare-protected event sites.
- **What worked well:** it gets past sites where a plain fetch returns 403.
  - In our comparison of place-enrichment options in the build sessions, its search found booking pages that map providers don't carry: SerpApi, Foursquare, Google Places and Amazon Location place search.
- **What needs work:** results are suggestions only; an editor still confirms each link. One missing production key took a Field Guide source offline (see Trigger.dev).
- **Would we build with it again?** *(draft)* Yes, as a fallback and for search.

### Clerk (listener account linking and staff sign-in)

- **Used for:** the OAuth 2.1 authorization server that Alexa account linking talks to, for saved songs, follows, memory and membership. Also staff sign-in for the Field Guide's admin screens.
- **What worked well:**
  - A spike passed every check, including:
    - PKCE S256.
    - The RFC 8707 `resource` parameter that Alexa sends.
    - Refresh tokens with rotation.
    - Verifiable RS256 tokens.
    - `authenticateRequest({ acceptsToken: "oauth_token" })` (rm-playlist-v2 spike, Oct 4).
  - Clerk has a guide for this exact setup: an MCP server.
- **What needs work:**
  - **Access tokens have no `aud` claim,** so we verify `iss` and `azp` instead.
  - **It was tested only against a script that imitates Alexa,** since real Alexa wasn't available.
  - **Clerk's path-routed sign-in steps 404'd** on a page that wasn't a catch-all route; we switched to hash routing.
- **Would we build with it again?** *(draft)* Yes.

### Apple Music (MusicKit)

- **Used for:** "Save that song" also adds it to the listener's Apple Music library, in a background job.
- **What needs work:**
  - **Library access needs a subscription,** and the terms for a public app were still to be confirmed before the demo (rm-playlist-v2 finds design).
  - **Amazon Music has no open API:** its Web API is a closed beta.
- **Would we build with it again?** *(draft)* Yes, but we'd rather offer Amazon Music inside an Alexa product.

### Music data: MusicBrainz, Discogs, Genius, Spinitron, StreamGuys (playlist enrichment)

- **Used for:**
  - Song facts behind "tell me about this song":
    - Credits and relationships from MusicBrainz.
    - Release credits from Discogs.
    - Song details from Genius, never lyrics.
  - What each station played: Spinitron.
  - Now-playing: StreamGuys.
- **What needs work:**
  - **Rate limits shape the design:**
    - MusicBrainz allows 1 request per second and Discogs 60 per minute, so enrichment runs in the background.
    - Genius matches are accepted only on an exact artist and title match.
  - **StreamGuys keeps only about 17 minutes of history,** which made the Aug 25 outage unrecoverable for one station.
  - Discogs' and Genius's terms for this use still need confirming (rm-playlist-v2 music-recall spec, incident report).

### Ticketmaster and AXS (concert listings)

- **Used for:** upcoming shows for artists the stations play, and the Field Guide's event listings.
- **What needs work:** nothing API-specific recorded. Our one incident was our own: a key missing in production (see Trigger.dev).

---

## Building and demo tooling

### Claude Code

- **Used for:** building all five repos with Tarik: specs, plans, test-first code, reviews, deploys, and these documents.
- **What worked well:**
  - **A fresh reviewer at the end of each feature paid for itself.** Two of its findings would have broken Concert Picks on day one: the transaction limit, and a daily re-import that brought back deleted picks. In Backstory a second review "caught three privacy gaps the first build missed".
  - **Test-first fixes made every review finding provable.** The briefing's four review findings each got a test that failed first.
- **What needs work:**
  - **Reading source material late.** The first card was designed from a one-line note while Amazon's full design guide sat unread (decision 004). We now require reading every design file and guide before building.
  - **Parallel sessions on one repo collided twice:**
    - Two decisions were both numbered 008.
    - A README tool count went stale within a day.
- **Would we build with it again?** *(draft)* Yes.

### Playwright and ego-browser (browser checks and demo capture)

- **Used for:** checking every card in a real browser before calling a feature done, and recording demo clips.
- **What worked well:** browser checks caught what tests didn't:
  - A Play button hidden below a long card.
  - A stale cached stylesheet.
  - Map pins in the wrong place.
  - Briefing rows 5 and 6 off the Echo Show 8 screen.
- **What needs work:**
  - **ego-browser's "Agent is in control" overlay appears in screen recordings,** so capture uses the page's own frames instead.
  - **On Oct 5 an ego-browser page command timed out repeatedly,** and its helper names differed from the examples we had. We fell back to a Playwright script using the installed Chrome.
- **Would we build with it again?** *(draft)* Yes, both.

### Remotion and ElevenLabs (demo video)

- **Used for:** the demo video, built from code. A scene file drives the timeline, narration is generated and measured, and clips are fitted with a speed cap so the 60-second cut fits. ElevenLabs (`eleven_v4`) voices the narration.
- **What worked well:** the whole edit can be re-rendered after a script change.
- **What needs work:** not recorded yet.
- **Would we build with it again?** *(draft)* Not yet decided.
