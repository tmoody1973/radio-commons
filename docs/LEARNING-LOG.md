# Learning log

## 2026-10-02: first live calls from Vercel (slice 1)

**What we expected:** Backstory queries take 50–150 ms from a laptop, so a Vercel function next to Convex would answer well under Alexa's 500 ms limit, every time.

**What happened:**
- Warm production calls (20 each, `scripts/smoke.mjs`): `find_station_story` p50 105 ms, p95 179 ms; `get_station_story` p50 111 ms, worst 1,002 ms.
- Right after a deploy, the first calls took 746–835 ms, and the very first search hit our 350 ms Backstory cut-off, so the listener would have heard "I can't reach Radio Milwaukee's stories right now".
- Real use found three problems unit tests didn't: the story search matched the wrong episode on one shared word ("shop"); the story card couldn't read its bundled script inside Vercel's function (fixed by embedding it at install time); Next.js' generated types were missing in CI.
- Alexa+ onboarding stopped at Amazon's access step: their developer-tools role doesn't yet trust our AWS account.

**What we now believe:** Speed is fine once warm; the risk is cold starts, which need either keep-warm traffic or always-on instances before the demo. Every new surface (search quality, the card, the deploy) needs one real end-to-end call before we trust it.

## 2026-10-02: the Alexa+ simulator, measured

**What we expected:** a spoken turn in 3–5 seconds, and Claude following the reply rules (two sentences, at most two places named).

**What happened:**
- The first build took ~10.7 s per turn. Timing every stage showed why: Polly voicing a 70-word reply took 5.5 s, three model passes 3.1 s, reconnecting to the MCP server 0.5–0.9 s, our tools only 0.3 s.
- After streaming the voice through a signed link, capping replies at two sentences and sharing one MCP connection: reply ready in 3.4–4.7 s warm, first sound about 0.5 s later (~3.9 s from release to hearing the answer). A fresh server instance adds 1–3 s.
- A spoken question (Mac `say` voice) was transcribed word for word by Deepgram in 817 ms and answered with the right story.
- Haiku still names four places when told "at most two": prompt rules about length are followed loosely.
- The browser check caught three things no test did: the Play button hidden below a long card, a stale cached card stylesheet breaking the layout, and the trail panel squeezed to unreadable width.
- A published Uniquely Milwaukee summary names a facility resident; the simulator repeated it, as it should repeat published text. The fix is in the editor's review, not the simulator.

**What we now believe:** Voice latency is dominated by speech synthesis, so stream it. Model passes are the floor (about a second each). Look at every screen in a real browser before calling it done. And the simulator is a faithful mirror: whatever the editor publishes, Alexa says.

## 2026-10-02: ask the episode (slice 3), first live runs

**What we expected:** once Backstory returned guarded passages and the card showed them, "What did they say about the stromboli?" after finding the episode would just work.

**What happened:**
- Backstory's guarded search worked first time against real data: "stromboli" found "They call them stromboli." at 10:45, and the three people an editor removed from that episode (who appear four times in the raw transcript) never came back.
- The relevance floor from story search would have rejected almost every detail question: "what did they say about" counts as four words the passage doesn't contain. Detail questions now drop question words and host names first.
- In the simulator, the follow-up failed 4 times out of 5. Claude invented story ids like "this-bites-frugal-dining" instead of looking the story up, even with a rule against guessing. The cause was the simulator: real Alexa+ keeps earlier tool results in the conversation, ours kept only the spoken words. Noting the on-screen story's id in the remembered reply fixed it: 5 of 5, and one tool call instead of two.
- The card didn't refresh for a follow-up about the same story, because an MCP App starts once and the card was rebuilt only when the story changed. Only a real browser run showed it.
- Tapping ▶ 10:45 starts the episode at second 645, measured in the card itself.

**What we now believe:** prompt rules don't stop a model from guessing an id; giving it the id does. Anything the simulator drops from the conversation becomes a failure Alexa+ wouldn't have, so the simulator should carry context the way the real host does. And every flow needs at least one multi-turn run in a real browser, repeated, because single runs hide failures that happen half the time.

## 2026-10-03: redesigning the card to Amazon's guide, and putting real maps on it

**What we expected:** a restyle, mostly CSS, plus dropping a map picture into the card.

**What happened:**
- The design rules existed all along: Amazon's MCP Design Guide for Alexa+ (nine pages) says one title, one or two fields, one action, a 768×480 base scaled up, light and dark, 48 px buttons, and only four layouts. The first card broke nearly all of them because it was designed from a bullet point.
- Amazon's static map took four live tries: coordinates with too many decimals were refused; the default style is satellite, which can't be light or dark; and its zoom numbers didn't line up with the pin math even after a one-level correction. Asking for the exact corners of the area (a bounding box) instead of a zoom made the pins land on the right streets.
- Only a screenshot showed the pins were wrong. Every unit test passed while Ted's Ice Cream sat near West Bend.
- The pan-and-zoom map drifted its pins because each pin was scaled with CSS zoom; sizing them directly fixed it.
- Real places shaped the design: two restaurants share an address, a third is in Mequon, and 9 of 10 have no neighborhood set, so the list shows the street.
- Alexa read a list in the right order but then called the older episode "newer"; a one-line rule fixed it.

**What we now believe:** for anything a person looks at, read the platform's design guide first and check every view in a real browser at real size. For anything with coordinates, overlay the result on the real map before trusting it.

## 2026-10-03: events (slice 4)

**What we expected:** wire Alexa to the Field Guide's events and draw them on the map we already had.

**What happened:**
- The first measurement changed the plan: only 35% of this week's events had a venue on the map. Counting the Field Guide's venue registry raised it to 64%; geocoding 154 venues with Amazon Location (~$1.25) raised it to 97% (62 of 64).
- The venue list held things a script must not touch: DIY venues whose addresses are deliberately private ("Ask A Punk"), multi-park series in one field, and entries like "WI". They were filtered out before any lookup.
- The street-matching rule first rejected "108 East Wells Street" against Amazon's "108 E Wells St"; a dry run caught it before anything was written.
- The first live "near High Stakes" question failed: the Field Guide's first answer after a quiet spell took over 800 ms. A 2-second limit plus waking it when the MCP server starts fixed it.
- Photo-less event tiles pushed their Details button off the card; only the screenshot showed it.
- A merge script ran ahead of CI; branch protection refused the merge, which is exactly what it is for.

**What we now believe:** measure the data before designing the feature; it decides more than the code does. Always dry-run anything that writes to someone else's live data, and filter for privacy first.
