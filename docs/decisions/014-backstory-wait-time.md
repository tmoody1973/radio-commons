# 014 — Wait up to 1.5 seconds for Backstory, not 0.35

**Decision** — Radio Commons waits up to 1.5 seconds for an answer from Backstory (the story engine) before telling the listener it can't reach the stories, instead of 0.35 seconds.

**Why this came up** — Rehearsing the demo video on 2026-10-21, "What's the tomato martini at Birch?" answered "I can't reach Radio Milwaukee's stories right now", then worked when asked again. The server log said `public:askStory timed out after 350 ms`. The first question after a quiet spell is slow: the server has to open a fresh connection to Backstory, and Backstory has to load that episode's transcript (0.4–0.5 seconds measured that evening). The next question takes 40–90 milliseconds. The 0.35-second limit was set on day one (decision 001) against a 500-millisecond Alexa budget; Amazon's published guidance is that a tool should answer within 3 seconds, and the playlist and events connections had already been given 1.5–2 seconds. At stake: the first question of a demo take, or of a real listener's evening, failing for no visible reason.

**Options**
- *Raise the limit to 1.5 seconds* — one number; cold questions get room; warm ones are as fast as before. Cost: when Backstory really is down, the listener waits 1.5 seconds instead of 0.35 to hear so.
- *Keep 0.35 seconds and retry once* — usually works on the second try; more code, and the worst case is slower than one 1.5-second wait.
- *Ping Backstory every few minutes to keep it warm* — a new scheduled job to run and watch; it doesn't help a brand-new server copy, which is part of the slow first call.

**What we chose and why** — Raise the limit to 1.5 seconds (Tarik, 2026-10-21; Claude recommended it). It fixes the cause, the limit, with the smallest change, and matches what the other connections already use.

**What we gave up** — A fast "can't reach the stories" when Backstory is genuinely down: up to 1.5 seconds of silence first. And decision 001's 500-millisecond target no longer holds for a cold first question.

**How we'll know if this was right** — In the production logs, no `public:askStory` or `public:searchStoryCards` "timed out" lines on first questions after a quiet hour, across the recording session and the week after; and the slowest logged story call stays under 1.5 seconds.

**What actually happened** —
