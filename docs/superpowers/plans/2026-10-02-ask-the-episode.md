# Radio Commons slice 3: ask the episode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alexa answers detail questions about one published episode with short, word-for-word, timestamped passages from its transcript, under editor-controlled guardrails, and the card plays each passage's moment.

**Architecture:** Backstory adds a per-episode switch (show default), a transcript search index, and `public.askStory` with a privacy guard; Field Guide's review page gets the switch; Radio Commons adds an `ask_station_story` MCP tool, a "From the episode" card section with play-from buttons, and one brain rule.

**Tech Stack:** Convex (Backstory), Next.js 16 (Field Guide, Radio Commons), mcp-handler 2.x, ext-apps, Vitest, convex-test.

**Spec:** `docs/superpowers/specs/2026-10-02-ask-the-episode-design.md` (approved 2026-10-02).

## Global Constraints

- Only **published** episodes (approved run, `reviewStatus: "approved"`, not `doNotUse`) whose switch is on (`allowDetailedAnswers ?? show.detailedAnswersDefault`; This Bites `true`, Uniquely Milwaukee `false`).
- **Guard:** never return a passage containing a blocked name. Blocked, in the published run: every rejected person mention (any reason); every mention or place with `removeReason: "sensitive"`; every mention with `doNotUse: true`. Normalized, whole-word match.
- Up to **3** passages, episode order, each ≤ ~300 chars cut at a sentence boundary, with `startMs`; speaker name only if `speakerNames.source === "editor"`.
- Relevance floor: reuse `relevantEnough` from `convex/lib/storySearch.ts`.
- The switch is changed only through a reviewer-checked Convex mutation.
- Spoken lines: "At m:ss, <Name> says: '…'" / "At m:ss, the episode says: '…'"; not allowed → "Detailed answers aren't available for this episode."; no match → "I couldn't find that in the episode."
- PROD steps (Tarik's go-ahead): Backstory deploy, Field Guide production deploy, Radio Commons production deploy.

## Review Focus

1. **A blocked name hidden in a passage by spelling variation** (accents, "Corazón" vs "Corazon", possessive "Terence's"). Expected: still blocked. Test: Task 1 "blocks names regardless of accents and possessives".
2. **A Uniquely Milwaukee episode with no switch set.** Expected: not_allowed. Test: Task 1 "UM defaults to off".
3. **An editor-confirmed speaker who is also a removed person.** Expected: the passage is skipped (guard wins). Test: Task 1 "guard beats speaker name".
4. **Passage text with `<` or quotes reaching the card.** Expected: escaped. Test: Task 4 "escapes passages".
5. **A non-reviewer flipping the switch.** Expected: refused. Test: Task 2.

---

### Task 1: Backstory — `askStory` with the guard

**Files:** Modify `convex/schema.ts`, `convex/lib/shows.ts`, `convex/public.ts`; Create `convex/lib/askStory.ts`; Test `tests/askStory.test.ts`.

**Interfaces:**
- Produces: `api.public.askStory({ storyId: string, question: string }) → { status: "ok" | "not_allowed" | "not_found"; passages: { text: string; startMs: number; speaker: string | null }[] }`; pure helpers `blockedNames(...)`, `mentionsBlocked(text, blocked)`, `trimPassage(text, max = 300)`, `allowsDetailedAnswers(story, profile)`.

- [ ] **Step 1: Failing tests** (`tests/askStory.test.ts`), using `seedStory`, `saveRun`, the REVIEWER identity and `approveEpisode` as in `tests/storySearch.test.ts`, inserting `transcriptSegments` directly:
  - This Bites default on: a question "stromboli" over a segment "the stromboli at Bread House is the deal of the year" returns `status: "ok"` with that passage and its `startMs`.
  - UM defaults to off (`showSlug: "uniquely-milwaukee"`) → `not_allowed`; after `setDetailedAnswers(true)` (Task 2 — write this case in Task 2) → ok.
  - Unpublished → `not_found`; `doNotUse` story → `not_found`; garbage id → `not_found`.
  - Guard: reject "Joe Sasto" (reason "wrong") → a segment naming "Joe Sasto's" is skipped; keep-off place "Café Corazón" (sensitive) → a segment naming "Cafe Corazon" is skipped (accents); do-not-use mention → skipped.
  - Guard beats speaker name: segment spoken by `spk_1` whose editor-confirmed name is a rejected person → skipped.
  - Speaker shown only when `source: "editor"` (a `suggested` name → `null`).
  - Relevance floor: an unrelated question → `passages: []` with `status: "ok"`.
  - At most 3, in episode order; long text trimmed at a sentence boundary ≤ 300 chars.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - `schema.ts` stories: `allowDetailedAnswers: v.optional(v.boolean())`; transcriptSegments: `.searchIndex("search_text", { searchField: "text", filterFields: ["storyId"] })`.
  - `shows.ts`: `detailedAnswersDefault: boolean` on the profile (This Bites `true`, UM `false`).
  - `convex/lib/askStory.ts`:
    ```ts
    import { normalizeForMatch } from "./evidence";
    export function allowsDetailedAnswers(story: { allowDetailedAnswers?: boolean }, profile: { detailedAnswersDefault: boolean }) {
      return story.allowDetailedAnswers ?? profile.detailedAnswersDefault;
    }
    /** Names whose passages are never returned: rejected people, keep-off-Alexa items, do-not-use mentions (published run). */
    export function blockedNames(mentions: { name: string; entityType: string; reviewStatus: string; removeReason?: string; doNotUse: boolean }[], places: { name: string; officialName?: string; removeReason?: string }[]): string[] {
      const names = [
        ...mentions.filter((m) => (m.entityType === "person" && m.reviewStatus === "rejected") || m.removeReason === "sensitive" || m.doNotUse).map((m) => m.name),
        ...places.filter((p) => p.removeReason === "sensitive").flatMap((p) => [p.name, p.officialName ?? ""]),
      ];
      return [...new Set(names.map(normalizeForMatch).filter(Boolean))];
    }
    /** Whole-word match on normalized text; "joe sasto" blocks "Joe Sasto's" (normalizeForMatch drops apostrophes → "sastos", so also test the stem). */
    export function mentionsBlocked(text: string, blocked: string[]): boolean {
      const words = ` ${normalizeForMatch(text)} `;
      return blocked.some((name) => words.includes(` ${name} `) || words.includes(` ${name}s `));
    }
    export function trimPassage(text: string, max = 300): string {
      if (text.length <= max) return text;
      const cut = text.slice(0, max);
      const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
      return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
    }
    ```
    (Check `normalizeForMatch`'s handling of apostrophes in `convex/lib/evidence.ts` and adjust the possessive rule to what it really does.)
  - `public.askStory`: `normalizeId("stories")` → story; published + not doNotUse else `not_found`; `allowsDetailedAnswers` else `not_allowed`; load the approved run's mentions and places, `blockedNames`; `withSearchIndex("search_text", q => q.search("text", normalizeForMatch(question)).eq("storyId", id)).take(20)`; filter `relevantEnough(question, normalizeForMatch(seg.text))` and `!mentionsBlocked(seg.text, blocked)`; also skip segments whose editor-confirmed speaker name is blocked; sort by `idx`; take 3; map `{ text: trimPassage(seg.text), startMs: seg.startMs, speaker: editorName(seg.speaker) }`.
- [ ] **Step 4: Run → PASS; full suite; typecheck.**
- [ ] **Step 5: Commit** on branch `feat/ask-story`.

### Task 2: Backstory — the switch

**Files:** Modify `convex/reviewMutations.ts`, `convex/review.ts` (episode payload adds `allowDetailedAnswers: boolean` resolved with the default, and `detailedAnswersDefault: boolean`); Test in `tests/reviewMutations.test.ts` and `tests/askStory.test.ts`.

- [ ] Failing tests: `setDetailedAnswers({ storyId, allow })` refuses an unsigned caller (`not_signed_in`); sets the flag; UM episode becomes `ok` in `askStory` after `allow: true`; `review.episode` reports the resolved value and the default.
- [ ] Implement (`requireReviewer`, `not_found` for a missing story, patch `allowDetailedAnswers`).
- [ ] PASS; suite; typecheck; commit; PR; CI; **PROD:** merge + `npx convex dev --once`.

### Task 3: Field Guide — "Allow detailed answers" switch

**Files:** Modify `src/lib/backstory-types.ts` (episode story: `allowDetailedAnswers: z.boolean().default(false)`, `detailedAnswersDefault: z.boolean().default(false)`), `src/lib/backstory.ts` (mutation name `reviewMutations:setDetailedAnswers`), `src/app/actions/admin-backstory.ts` (`parseDetailedAnswers`), `src/app/actions/admin-backstory-actions.ts` (`setDetailedAnswersAction`), `src/components/admin/backstory-episode-forms.tsx` (`DetailedAnswersToggle`), `src/app/admin/backstory/[storyId]/page.tsx` (render it in the header); Test `tests/actions/admin-backstory.test.ts`.

- [ ] Failing parser test: `parseDetailedAnswers(form({ storyId, allow: "true" }))` → `{ ok: true, storyId, args: { storyId, allow: true } }`; bad value → not ok.
- [ ] Implement; the toggle uses `useAnnouncedAction`, label "Allow detailed answers: On/Off" plus "(show default)" when unchanged, `aria-pressed`.
- [ ] PASS; typecheck; build; lint; PR; CI; **PROD:** merge + `vercel deploy --prod`.

### Task 4: Radio Commons — tool, card, brain

**Files:** Modify `src/lib/backstory.ts` (`askStory(storyId, question)` with zod schema), `src/lib/speech.ts` (`clock(ms)`, `spokenPassages(...)`), `src/lib/mcp.ts` (`ask_station_story` via `registerAppTool` with the card resource), `src/lib/card.ts` (`renderCard` accepts optional `passages`), `src/lib/sim/brain.ts` (prompt line); Tests: `tests/speech.test.ts`, `tests/mcp.test.ts`, `tests/card.test.ts`, `tests/sim/brain.test.ts`, `tests/fixtures.ts` (fake `askStory`).

- [ ] Failing tests:
  - speech: `spokenPassages([{ text: "The stromboli is the deal.", startMs: 1_122_000, speaker: "Ann Christenson" }])` → `"At 18:42, Ann Christenson says: 'The stromboli is the deal.' Want to hear that part?"`; speaker null → "the episode says"; not_allowed and empty lines.
  - MCP: `tools/list` has 3 tools; `ask_station_story` returns the spoken line, `structuredContent.passages`, and `cardHtml` containing "From the episode" and `data-start="1122"`; unknown id → not-found line; not_allowed line; Backstory down → apology with `isError`.
  - card: passages escaped (escapes passages), each has a "▶ 18:42" button with `data-start` seconds; card script seeks to `data-start` before playing.
  - brain prompt contains "ask_station_story" and "word for word".
- [ ] Implement:
  - `backstory.ts`: `askSchema = z.object({ status: z.enum(["ok","not_allowed","not_found"]), passages: z.array(z.object({ text: z.string(), startMs: z.number(), speaker: z.string().nullable() })) })`; client `askStory: (storyId, question) => call("public:askStory", { storyId, question }, askSchema)`.
  - `speech.ts`: `clock(ms)` "m:ss" (h:mm:ss over an hour); `spokenPassages(passages)`; constants for not-allowed/no-match.
  - `mcp.ts`: `ask_station_story` with input `{ storyId: string(1..64), question: string(1..200) }`; fetch `getStory` (for card header) and `askStory` in parallel; build `cardHtml = renderCard(story, passages)`.
  - `card.ts`: `renderCard(story, passages?)` adds `<section class="passages"><h3>From the episode</h3>` with `<blockquote>` per passage + `<button class="play-from" data-start="${Math.floor(startMs/1000)}">▶ m:ss</button>`; script: `play-from` click → `audio ??= new Audio(url)`, `audio.currentTime = start`, then the same play/catch/postMessage logic.
  - brain prompt: "For a question about details inside a story the listener has found, call ask_station_story and quote its passages word for word, with the time."
- [ ] PASS; suite; typecheck; build; lint; PR; CI; **PROD:** merge + `vercel deploy --prod`.

### Task 5: Live checks, docs, review

- [ ] Live (simulator, typed): "What was that This Bites episode about frugal dining?" then "What did they say about the stromboli?" → quoted, timed answer; card shows the passage; tap ▶ plays from that moment (ego-browser; check audio `currentTime` after a second ≥ the passage start).
- [ ] UM episode (My Way Out): a detail question → "Detailed answers aren't available for this episode."
- [ ] Guard live: pick a published This Bites person Tarik removed (e.g. "Scott Walker"), ask about them → no passage naming them.
- [ ] Docs: README tool list + simulator section line; decision 003 (transcript answers with guardrails; "What actually happened" blank); learning log.
- [ ] Final fresh review (most capable model) across all three repos' slice diffs; fix Critical/Important test-first; ship.
