# 003: Let Alexa quote the transcript, behind editor-controlled guardrails

**Decision:** Alexa can answer detail questions about a published episode with short, word-for-word passages from its transcript, but only for episodes an editor allows, and never a passage that names anyone an editor removed or kept off Alexa.

**Why this came up:** Listeners remember details, not summaries: "What did Ann say about the stromboli?" Until now Alexa could only read what an editor published (a summary and about 20 approved quotes), so most detail questions went unanswered. The full transcript has the answer, but nobody has reviewed it. It contains private individuals (residents in Uniquely Milwaukee stories), things an editor deliberately kept off Alexa, and transcription slips. Getting this wrong means Alexa saying a private person's name out loud on a smart speaker.

**Options:**
1. **Guarded passages (chosen).** Search one episode's transcript, return at most 3 short passages with timestamps. A per-episode switch decides (This Bites on by default, Uniquely Milwaukee off). Any passage naming a removed person, a kept-off item, or a do-not-use mention is skipped entirely. Cost: a privacy filter that has to be right, and a new setting on the review page.
2. **Approved quotes only.** Answer only from the quotes editors already saw. Zero new risk, but thin: questions usually miss.
3. **The whole transcript.** Most answers, but breaks the promise that nothing reaches Alexa without a human's approval.

**What we chose and why:** Option 1 (Tarik chose the defaults: This Bites on, Uniquely Milwaukee off; skip whole passages rather than blank out names; tap a moment on the card to play it). Claude designed the guard. It keeps the editor in charge: the switch is theirs, and everything they already removed stays removed, including from raw transcript lines they never saw.

**What we gave up:**
- The guard only knows names editors already acted on. A private person the extraction never picked up as a mention is not blocked; on This Bites that's rare (hosts, chefs, owners), which is why Uniquely Milwaukee starts off.
- Quotes are what the speech-to-text heard, slips included.
- A misheard name an editor removed as "wrong" also blocks its passages, which can hide a useful answer.
- "Play that part" is a tap, not a voice command.

**How we'll know if this was right:** In the demo episode set, no answer ever contains a name an editor removed (checked live on Frugal Dining: Daria, Scott Walker and Tom Barrett appear in the raw transcript four times and are never returned). Detail questions about This Bites episodes get a quoted, timed answer more often than "I couldn't find that".

**What actually happened:**
