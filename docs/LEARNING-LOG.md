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
