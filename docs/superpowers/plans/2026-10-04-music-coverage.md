# Radio Commons slice 5: music coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Premieres and Studio Milwaukee Sessions become editor-reviewed Backstory stories with a song record; MKE Concert Picks become Field Guide staff picks; Alexa plays premiere songs, shows session set lists, and reads the week's picks.

**Architecture:** Backstory (~/Projects/backstory, Convex) gains an "article" job that stores a CDS article's paragraphs (lyrics removed) where transcript lines go, so the existing extract → geocode → review pipeline runs unchanged, plus a `songs` table filled by extraction. The Field Guide (~/Projects/mke-field-guide, Next.js + Neon/Drizzle + Trigger.dev) gains a daily Concert Picks import that parses the list without AI and writes staff picks matched to events. Radio Commons (~/Projects/radio-commons) renders premiere and session cards from `getStory`'s new fields.

**Tech Stack:** Convex + convex-test + Vitest (Backstory); Drizzle + PGlite tests + Trigger.dev schedules (Field Guide); mcp-handler + ext-apps cards + Vitest (Radio Commons). CDS via `NPR_CDS_TOKEN`.

**Spec:** `docs/superpowers/specs/2026-10-04-music-coverage-design.md` (approved 2026-10-04).

## Global Constraints

- No lyrics, ever: italic `<em>` lines joined by `<br>` in a CDS text asset are dropped before storage; never extracted, searched or quoted.
- Premieres: collection `1197908043`, content type `premiere`; Sessions: collection `g-s921-1635`, content type `session`. Both `cdsProfile: "story"`.
- Session audio is never fetched, stored or played (decision 012). Premiere audio is played (Tarik, 2026-10-04) behind one setting, `PLAY_PREMIERE_AUDIO` (default on).
- Nothing reaches Alexa before editor approval; song fields not found in the article text are dropped.
- Concert Picks: title starts `MKE Concert Picks:`, canonical URL contains `/concerts/`; list lines `<Mon. D>: <headliner>[ w/<openers>] @ <venue>, <time>`; picks never create events; first production run is a dry run shown to Tarik.
- PROD steps need Tarik's go-ahead: Field Guide picks write, deploys of all three repos (merges after green CI as before).

## Review Focus

1. **A premiere whose lyrics are not italicized** (plain quoted lines). Expected: kept as article text (we can only strip what CDS marks); extraction notes still forbid quoting lyrics. Test: Task 1 "plain paragraphs survive; only italic <br> blocks drop" + Task 2 notes contain "lyrics".
2. **A Concert Picks line with an apostrophe/ampersand venue or a venue not in the alias table** ("Linneman's", "X-Ray Arcade"). Expected: matched through normalized names when known, else reported unmatched. Test: Task 5 matching cases.
3. **A Concert Picks list spanning a month boundary or a new year** ("Dec. 31" … "Jan. 2" in one article). Expected: year rolls over from the article's publish date. Test: Task 4 parse case.
4. **A re-processed premiere** (article edited after approval). Expected: new run pending; approved song stays live until the editor approves again. Test: Task 2 "re-run keeps the approved song".
5. **A premiere without audio, or with `PLAY_PREMIERE_AUDIO` off.** Expected: card without ▶, speech offers the article. Test: Task 7 card/speech cases.

---

### Task 1: Backstory — article job (paragraphs, no lyrics)

**Files:** Create `convex/lib/article.ts`, `convex/articles.ts`; modify `convex/schema.ts` (`jobKindValidator` + `"article"`, `stories.contentType` union), `convex/jobs.ts` (`stepFor("article")`), `convex/stories.ts` (`upsertEpisode` enqueues `article` for non-episode profiles), `convex/lib/shows.ts` (`contentType` on profiles, two music profiles); Test `tests/lib/article.test.ts`, `tests/articles.test.ts`, fixture `tests/fixtures/cds-premiere-glitzy.json` (the real `g-s921-16717` document, trimmed to layout + text assets + audio asset).

**Produces:** `articleParagraphs(doc: CdsArticle): string[]`, `isLyricBlock(html: string): boolean`; `ShowProfile.contentType: "episode" | "premiere" | "session"`; profiles `milwaukee-music-premiere`, `studio-milwaukee`; job kind `"article"` → `internal.articles.run`.

- [ ] Failing tests (`tests/lib/article.test.ts`):
```ts
import fixture from "../fixtures/cds-premiere-glitzy.json";
import { articleParagraphs, isLyricBlock } from "../../convex/lib/article";
it("drops italic <br> lyric blocks and keeps the writer's sentences, in layout order", () => {
  const paras = articleParagraphs(fixture as never);
  expect(paras.some((p) => p.includes("Unless I go back"))).toBe(false);
  expect(paras.some((p) => p.includes("Hey what do you call that"))).toBe(false);
  expect(paras).toContain("\"Effort\" falls on the janglier end of Glitzy's spectrum and splits into two soundscapes:");
  expect(paras.at(-1)).toMatch(/release party the same day at Sugar Maple/);
});
it("isLyricBlock: only all-italic, line-broken blocks", () => {
  expect(isLyricBlock("<em>Unless I go back</em><br><em>Say 'sorry, you're right'</em>")).toBe(true);
  expect(isLyricBlock("<em>Every week, the </em><a>Milwaukee Music Premiere</a><em> connects…</em>")).toBe(false);
  expect(isLyricBlock("Plain sentence with <em>an album</em>.")).toBe(false);
});
it("plain paragraphs survive; lists flatten to one line per item", () => {
  expect(articleParagraphs({ id: "x", layout: [{ href: "#/assets/a" }], assets: { a: { text: "<ol><li>\"Boxes & Squares\"</li><li>\"Move\"</li></ol>" } } } as never))
    .toEqual(["\"Boxes & Squares\"", "\"Move\""]);
});
```
- [ ] Run `npx vitest run tests/lib/article.test.ts` → FAIL (module missing).
- [ ] Implement `convex/lib/article.ts`:
```ts
import { stripHtml } from "./cds";
export interface CdsArticle { id: string; layout?: { href: string }[]; assets?: Record<string, { text?: string }> }
/** CDS marks quoted lyrics as italic lines joined by <br>: every visible run is inside <em>, and there is a <br>. */
export function isLyricBlock(html: string): boolean {
  if (!/<br\s*\/?>/i.test(html)) return false;
  const outside = html.replace(/<em>[\s\S]*?<\/em>/gi, "").replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "").trim();
  return outside === "";
}
/** The article's text in layout order, one paragraph (or list item) per entry, lyrics removed. */
export function articleParagraphs(doc: CdsArticle): string[] {
  const out: string[] = [];
  for (const { href } of doc.layout ?? []) {
    const html = doc.assets?.[href.replace("#/assets/", "")]?.text;
    if (!html || isLyricBlock(html)) continue;
    const items = /<li>/i.test(html) ? [...html.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => m[1]) : [html];
    for (const item of items) { const text = stripHtml(item); if (text) out.push(text); }
  }
  return out;
}
```
- [ ] PASS. Then failing convex-test `tests/articles.test.ts`: ingesting a premiere profile story enqueues an `article` job (not transcribe); `articles.run` with a stubbed `fetch` returning the fixture saves segments `{speaker:"article", startMs:0, endMs:0}` in order, sets stage `transcribed`, and enqueues `extract`; an `episode` profile still enqueues `transcribe`.
- [ ] Implement: schema unions; profiles —
```ts
"milwaukee-music-premiere": { slug: "milwaukee-music-premiere", name: "Milwaukee Music Premiere", cdsCollectionId: "1197908043", cdsProfile: "story", contentType: "premiere",
  entityTypes: ["person", "organization", "place", "event"], actionKinds: ["attend"], hosts: [],
  extractionNotes: "A Milwaukee Music Premiere: Radio Milwaukee debuts one local artist's song. Fill the song record: artist, song title, album, release date, credits (who recorded, mixed, mastered, produced), and the release show (venue and date) if named. People are the artist's members and collaborators; the release show is an event at a venue. Never quote or paraphrase song lyrics.",
  reviewer: "Milwaukee Music Premiere editor (to confirm)", detailedAnswersDefault: true },
"studio-milwaukee": { slug: "studio-milwaukee", name: "Studio Milwaukee Sessions", cdsCollectionId: "g-s921-1635", cdsProfile: "story", contentType: "session",
  entityTypes: ["person", "organization", "place", "event"], actionKinds: ["attend"], hosts: [],
  extractionNotes: "A Studio Milwaukee Session write-up: a touring or local artist performed live at Radio Milwaukee. Fill the song record with the artist and the set list (song titles in order). The interviewer and the artist are people; the concert they played that day is an event. Never quote or paraphrase song lyrics.",
  reviewer: "Studio Milwaukee producer (to confirm)", detailedAnswersDefault: true },
```
  (existing profiles get `contentType: "episode"`); `upsertEpisode` sets `contentType: profile.contentType` and enqueues `profile.contentType === "episode" ? ("transcribe", transcribeStep()) : ("article", internal.articles.run)`; `convex/articles.ts` `run` = `runStep` wrapper: `fetchCds(buildDocumentUrl(cdsId))` → `articleParagraphs` → `ctx.runMutation(internal.transcripts.save, { jobId, storyId, ref, segments })`. For sessions, `upsertEpisode` must not store `audioUrl` (set `""`) — test it.
- [ ] Suite + typecheck green; commit `feat: article job — premieres and sessions read from CDS text, lyrics removed`.

### Task 2: Backstory — song record (extraction, review, public read)

**Files:** Modify `convex/lib/extraction.ts` (optional `song`), `convex/extractions.ts` (insert song), `convex/schema.ts` (`songs` table), `convex/review.ts` (episode includes song item), `convex/reviewMutations.ts` (`decideItem` table `songs`; `setSongFields`), `convex/public.ts` (`getStory` → `contentType`, `song`); Test `tests/lib/songEvidence.test.ts`, `tests/songs.test.ts`.

**Produces:** `songs` row `{ storyId, runId, kind, artist, title?, album?, releaseDate?, credits: {role,name}[], releaseShow?: {venue, date}, setList?: string[], audioUrl?, reviewStatus }`; `checkSong(song, articleText): Song | null` (drops fields not in the text; null without artist); `getStory(...).contentType`, `.song` (approved only, `audioUrl` omitted for sessions).

- [ ] Failing unit tests: `checkSong` keeps `artist:"Glitzy"`, `title:"Effort"`, `album:"Say Sorry / You're Right"`, credits Shane Hochstetler/Carl Saff, `releaseShow {venue:"Sugar Maple", date:"2026-10-23"}` (date checked as "Oct. 23"/"October 23" present), drops `album:"Invented"`; returns null when artist absent from text; set list items kept only when present.
- Note (ruling against the spec's wording): "every song field backed by a quote" is enforced as "every field's value appears in the article text" — same protection, no per-field quote from the model; cost if wrong: a value that appears in the text but in another context passes (the editor still reviews it).
- [ ] Implement `checkSong` in `convex/lib/song.ts` (normalized substring match via `normalizeForMatch`; date: month name/abbr + day number present). Extraction schema: `song: z.object({ artist, title?, album?, releaseDate?, credits: [{role,name}], releaseShow?: {venue, date}, setList?: string[] }).nullable().catch(null)` (invalid → null, never fails the episode).
- [ ] Failing convex-tests: extraction save inserts a pending song for a premiere run (audioUrl from the story) and none when `song` null; `review.episode` lists the song as an item; `decideItem({table:"songs"})` approves/rejects; `setSongFields` edits title/album/releaseDate (reviewer-only); `approveEpisode` publishes it; `getStory` returns `song` only when approved, `contentType` always; re-processing (new run) leaves the approved song served until the new run is approved; session song never has `audioUrl`.
- [ ] Implement; suite + typecheck green; commit `feat: song record for premieres and sessions`.

### Task 3: Field Guide — review page shows the song

**Files:** Modify `src/lib/backstory-types.ts` (episode `song`), `src/lib/backstory-review.ts` (`toReviewItems` adds a song item), `src/components/admin/backstory-review-item.tsx` (song fields + `SongFieldsForm`), `src/app/actions/admin-backstory*.ts` (`parseSongFields`, `setSongFieldsAction`), `src/lib/backstory.ts` (mutation name), `src/components/admin/backstory-tabs.tsx` (two music shows in `BACKSTORY_SHOWS`); Tests `tests/lib/backstory-review.test.ts`, `tests/actions/admin-backstory.test.ts`.

- [ ] Failing tests: `toReviewItems` with an episode carrying a song yields an item `kind:"song"`, title `Glitzy, "Effort"`, details lines (album · release date · credits · release show / set list); `parseSongFields` accepts title ≤200, album ≤200, releaseDate `YYYY-MM-DD` or empty, rejects others.
- [ ] Implement; tests + typecheck + lint; commit; PR; CI. (Deploy with Task 2 after Tarik's go-ahead.)

### Task 4: Field Guide — parse a Concert Picks article (no AI)

**Files:** Create `src/lib/concert-picks.ts`; Test `tests/lib/concert-picks.test.ts`, fixture `tests/fixtures/concert-picks-2026-09-30.json` (real `g-s921-16698` paragraphs + byline + date + URL).

**Produces:** `isConcertPicks(doc): boolean`; `parsePicks(paragraphs: string[], published: Date): { picks: ParsedPick[]; unparsed: string[] }` with `ParsedPick = { date: string /*YYYY-MM-DD*/, headliner: string, openers: string[], venue: string, time: string, line: string, order: number }`; `spotlightFor(paragraphs, headliner): string | null`.

- [ ] Failing tests: the real list yields 20 picks; `Oct. 2: Bright Eyes w/Lullaby For The Working Class @ Turner Hall, 7:30 p.m.` → `{date:"2026-10-02", headliner:"Bright Eyes", openers:["Lullaby For The Working Class"], venue:"Turner Hall", time:"7:30 p.m."}`; `Oct. 3: Cracker @ Shank Hall, noon` → time `noon`; `Oct. 2: Charming Disaster, Duo Mercury @ Anodyne` → headliner `Charming Disaster`, openers `["Duo Mercury"]`; the CDS list is one paragraph with lines run together (`…7 p.m.Oct. 1: …`) — split on `(?=(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.? \d{1,2}: )`; a list published Dec 30 with `Jan. 2` lines → year+1; a malformed line goes to `unparsed`; `spotlightFor(paras, "Beck")` returns the paragraph(s) naming Beck before the list heading; `isConcertPicks` true for title `MKE Concert Picks: …` + `/concerts/` URL, false otherwise.
- [ ] Implement; PASS; commit `feat: parse MKE Concert Picks articles`.

### Task 5: Field Guide — match picks to events and write staff picks (dry run first)

**Files:** Create `src/queries/concert-picks-import.ts`, `src/trigger/concert-picks.ts`, `scripts/import-concert-picks.ts`; modify `src/db/schema.ts` (`staff_picks.source_id text` nullable + unique `(source_id, event_id)`; migration), `src/queries/admin-picks.ts` + admin picks page (unmatched list); Test `tests/queries/concert-picks-import.test.ts`.

**Produces:** `findVenueIdByName(db, name): Promise<string|null>` (venues.normalized_name or venue_aliases.normalized_name via `normalizeName`); `matchPick(db, pick): Promise<{eventId: string} | null>` (same Chicago day, venue id, normalized headliner ⊂ normalized event title, nearest start); `importConcertPicks(db, article, { dryRun }): Promise<{ matched: {line, eventId, title}[]; unmatched: string[]; written: number }>`; scheduled task `concert-picks-daily` (07:30 America/Chicago) fetching the newest station stories via CDS (`NPR_CDS_TOKEN`), skipping imported CDS ids.

- [ ] Failing PGlite tests: seeded venues "Turner Hall", "Linneman's Riverwest Inn" with alias "linnemans", "X-Ray Arcade"; events on 2026-10-02 — matches Bright Eyes at Turner Hall; matches a Linneman's line through the alias; no match when the date differs or headliner absent → unmatched; ties pick the nearest start; `dryRun` writes nothing; real run writes `staff_picks` (`curatorName` byline, `curatorRole` "Radio Milwaukee", blurb = spotlight or "On Radio Milwaukee's MKE Concert Picks this week.", `showUrl` article URL, `weekOf` Monday of the article week, `sortOrder` list order, `sourceId` CDS id); re-run writes 0 new rows; cancelled events never matched; a failure mid-write leaves no picks for that article (one transaction per article).
- [ ] Implement; migration via existing drizzle flow; PASS; commit.
- [ ] **Dry run (PROD read-only):** `npx tsx scripts/import-concert-picks.ts --dry-run` against prod for the newest article; show Tarik matched/unmatched counts + 10 samples. **On go-ahead:** run without `--dry-run`; record counts. Deploy the task (Tarik's go-ahead), set `NPR_CDS_TOKEN` in Trigger.dev/Vercel without printing it.

### Task 6: Radio Commons — premiere and session data through the client

**Files:** Modify `src/lib/backstory.ts` (zod for `contentType`, `song`), `src/lib/stations.ts` (two music shows), `src/lib/sim/stt.ts` (keyterms "Milwaukee Music Premiere", "Studio Milwaukee"); Tests `tests/backstory.test.ts`.

**Produces:** `StoryDetail.contentType: "episode"|"premiere"|"session"`, `StoryDetail.song?: { artist; title?; album?; releaseDate?; credits; releaseShow?; setList?; audioUrl? }`.

- [ ] Failing tests: schema accepts premiere/session payloads and old episode payloads (song absent → undefined); station shows include `milwaukee-music-premiere`, `studio-milwaukee`. Implement; PASS; commit.

### Task 7: Radio Commons — cards, speech, tools

**Files:** Modify `src/lib/card/views.ts` (`premiere` and `session` views), `src/lib/card/page.ts` (CSS), `src/lib/speech.ts` (`spokenPremiere`, `spokenSession`, article passage attribution), `src/lib/mcp.ts` (`get_station_story` picks the view by `contentType`; `ask_station_story` attribution for articles), `src/lib/maps.ts` (`isOpenableLink` + `radiomilwaukee.org`), `src/lib/sim/brain.ts` (rules: premieres play with ▶; sessions link; never quote lyrics); Tests `tests/card.test.ts`, `tests/speech.test.ts`, `tests/mcp.test.ts`, `tests/maps.test.ts`, `tests/sim/brain.test.ts`.

- [ ] Failing tests: premiere view shows artist photo, `Glitzy — "Effort"`, album + release date, credits, release show, ▶ with `data-audio` = song `audioUrl`; no ▶ when `audioUrl` missing or `PLAY_PREMIERE_AUDIO=off`; session view shows set list and a `details` button to the session permalink, never ▶; all text escaped; `spokenPremiere` = "From Radio Milwaukee's Milwaukee Music Premiere, October 2026: Glitzy, 'Effort', from their album Say Sorry / You're Right, out October 23. Want to hear it?" (album/date clauses omitted when absent; "Want to read about it?" without audio); `spokenSession` names artist, date and up to three set-list songs; article passages say "Radio Milwaukee's premiere says…"/"…session write-up says…" and carry no seek control; release show with a matching Field Guide event (venue + date via existing `fieldGuide.events({ q: artist, when })`) adds Details + Add to calendar; `isOpenableLink("https://radiomilwaukee.org/discover-music/studio-milwaukee/…")` true, other domains false.
- [ ] Implement; PASS; build; commit; PR; CI.

### Task 8: Live checks, docs, review

- [ ] Backstory: deploy (go-ahead); `ingest:ingestShow` for both music shows (limit 25); watch stages to `geocoded`; spot-check Glitzy's stored paragraphs contain no lyric lines; Tarik reviews 2–3 premieres and 1 session.
- [ ] Simulator: "Play the new Glitzy song" (card + plays), "Tell me about the Tank & The Bangas session" (set list + link), "What's Radio Milwaukee recommending this week?" (Concert Picks), "When's Glitzy's release show?"; screenshots light/dark.
- [ ] Docs: README (music coverage), decision 006 (Concert Picks as Field Guide staff picks; premiere audio plays), learning log entry; update the landscape research "music side" status.
- [ ] Final fresh review across the three repos; fix Critical/Important test-first.
