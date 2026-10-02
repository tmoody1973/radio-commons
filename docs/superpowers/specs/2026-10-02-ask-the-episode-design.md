# Radio Commons, slice 3: ask the episode — design

**Date:** 2026-10-02 · **Status:** awaiting Tarik's review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Purpose

Today Alexa can only read what an editor published about an episode: the summary, the approved people, places, topics and actions, and one evidence quote for each. Listeners remember details ("What did Ann say about the stromboli?", "Which place opens September 15th?", "Play the part about Il Ponte"). This slice lets Alexa answer detail questions about one published episode with **the episode's own words**: short, word-for-word passages from its transcript, each with the moment it's heard, which the listener can tap to play.

The transcript is not editor-reviewed. It contains private individuals, things an editor removed or kept off Alexa, and transcription slips. So the guardrails below are the feature, not an add-on.

**Success looks like:** in the simulator, after finding the Frugal Dining episode, *"What did they say about the stromboli?"* gets a spoken answer that quotes the episode and gives the time ("At 18:42, …"), and the card shows the passage with **▶ 18:42**, which plays the episode from that moment. Asking the same of a Uniquely Milwaukee episode an editor hasn't switched on gets "Detailed answers aren't available for this episode."

## What Tarik decided (2026-10-02)

| Question | Decision |
|---|---|
| Which episodes | This Bites on by default; Uniquely Milwaukee off by default; editors can switch any episode |
| Removed / kept-off names in a passage | Skip the whole passage (never half-redacted) |
| "Play that part" | Tap the moment on the card (▶ 12:34); spoken "play that part" is out of scope |

## Design

### Backstory (data and the guard)

- `stories.allowDetailedAnswers: optional boolean`. Unset → the show's default from `convex/lib/shows.ts` (`detailedAnswersDefault`: This Bites `true`, Uniquely Milwaukee `false`).
- Search index on `transcriptSegments.text`, filter field `storyId`.
- `public.askStory({ storyId, question })` → `{ status: "ok" | "not_allowed" | "not_found", passages: { text, startMs, speaker: string | null }[] }`:
  1. Story must be published (approved run, not do-not-use) and allowed (flag or show default); otherwise `not_found` / `not_allowed`.
  2. Search the episode's segments for the question (take ~20), keep those passing the relevance floor already used by story search (`relevantEnough`).
  3. **Guard:** drop any segment whose normalized text contains a blocked name. Blocked = in the published run: every rejected person mention (any reason); every mention or place removed as "true, but keep off Alexa"; every do-not-use mention. Names are matched normalized (accents, case, punctuation), whole-word.
  4. Return the top 3 in episode order, trimmed to ~300 characters at a sentence boundary, with `startMs` and the speaker's name **only if an editor confirmed it** (`speakerNames.source === "editor"`), else `null`.
- `reviewMutations.setDetailedAnswers({ storyId, allow })`: reviewer-only, like every review edit.

### Field Guide review page

- On the episode page, beside "Keep episode off Alexa": a switch **"Allow detailed answers"**, showing the show default until an editor sets it. Saves through `setDetailedAnswers` with the usual confirmation line.

### Radio Commons

- MCP tool `ask_station_story({ storyId, question })`: "Answer a listener's detail question about one Radio Milwaukee story using the station's own words. Quote the passages exactly, say when in the episode each is heard, and never add facts. If detailed answers aren't available or nothing matches, say so."
  - Spoken text: "At 18:42, Ann Christenson says: '…'" (speaker only when confirmed; else "At 18:42, the episode says: '…'"), ending "Want to hear that part?"; or the not-allowed / no-match line.
  - Structured: `{ stationId, story: { storyId, title, show, publishedAt, audioUrl, imageUrl }, passages }`; the tool links the same story card resource.
- Story card: when `passages` are present, a **From the episode** section lists each passage (escaped) with a **▶ 18:42** button that plays the episode from that moment.
- Simulator brain prompt gains: "For a question about details inside a story the listener has found, call ask_station_story and quote its passages word for word."

## Errors

| Situation | Listener hears |
|---|---|
| Episode not published or unknown | "I couldn't find that Radio Milwaukee story." |
| Switched off (or UM default) | "Detailed answers aren't available for this episode." |
| No passage passes the floor or the guard | "I couldn't find that in the episode." |
| Backstory down | the existing apology |

## Testing

- Backstory: unpublished → not_found; do-not-use → not_found; switch off and UM default → not_allowed; This Bites default → ok; relevance floor; **guard**: passages naming a rejected person / keep-off place / do-not-use mention are never returned; unconfirmed speaker → null; editor-confirmed speaker → name; passages in episode order with timestamps; `setDetailedAnswers` refuses non-reviewers.
- Field Guide: the switch parser; reviewer-only enforced in Backstory (existing pattern).
- Radio Commons: speech formatting (timestamp, speaker/no speaker, not-allowed, no-match); MCP contract for the new tool; card renders escaped passages with play-from buttons; live simulator check on This Bites and a UM episode.

## Out of scope

Saying "play that part" aloud; searching across many episodes' transcripts; answering for Uniquely Milwaukee episodes unless switched on; correcting transcript wording (quotes are what Deepgram heard).

## Open questions

1. Should rejected *wrong* (misheard) person names also block passages? The design says yes for people (any reason), to be safe; could relax later if it hides too much.
