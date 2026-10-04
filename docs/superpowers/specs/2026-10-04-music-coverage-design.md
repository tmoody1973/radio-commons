# Radio Commons, slice 5: music coverage (premieres, sessions, Concert Picks) — design

**Date:** 2026-10-04 · **Status:** approved in conversation 2026-10-04; written spec awaiting review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Purpose

Bring Radio Milwaukee's own music journalism into Alexa+: the weekly Milwaukee Music Premiere (a local song, debuted by the station), Studio Milwaukee Sessions, and the weekly MKE Concert Picks. This is the music pillar's first shipped piece; "What's playing on 88Nine?" waits for Tarik's playlist enrichment tool.

**Success looks like (simulator):** "Play the new Glitzy song" shows the premiere card and plays "Effort"; "Tell me about the Tank & The Bangas session" shows the set list and links to the session page; "What's Radio Milwaukee recommending this week?" reads that week's Concert Picks; "When's Glitzy's release show?" names Sugar Maple, Oct 23, with Add to calendar when the event is in the Field Guide.

## What Tarik decided (2026-10-04)

| Question | Decision |
| --- | --- |
| Where Concert Picks live | Field Guide staff picks, matched to events; no Backstory changes |
| Premiere song audio | Alexa plays it (station-debuted, submitted by the artist for on-demand listening), although CDS marks the asset not downloadable/embeddable |
| How premieres enter Backstory | Like episodes, with editor review, built from the article (no transcription) |
| Sessions | In this build, text only (decision 012): article + set list, link to the session page, never the audio |

## What's in CDS (measured 2026-10-04)

| | Premieres | Sessions | Concert Picks |
| --- | --- | --- | --- |
| Where | Category collection `1197908043`, 25 stories (2026-02-12 → 2026-10-01) | Topic collection `g-s921-1635`, 24 stories (2025-06 → 2026-08) | No collection: station stories titled `MKE Concert Picks: …` at `radiomilwaukee.org/concerts/…`, weekly (Wednesdays) |
| Audio | Song, 3–4 min, `cpa.ds.npr.org/s921/…` (flags: not downloadable/embeddable/streamable) | 20–25 min (not used) | none |
| Text | Article: artist, song, album, release date, credits, release show, on-air times; **quotes lyrics** as italic `<em>` lines with `<br>` | Write-up + set list (`<ol>` of song titles) | 2–3 spotlight write-ups + a list of ~20 lines: `Oct. 2: Bright Eyes w/Lullaby For The Working Class @ Turner Hall, 7:30 p.m.` |

## Design

### Part 1 — Backstory: premieres and sessions as stories

- **Profiles.** Two show profiles: `milwaukee-music-premiere` (collection `1197908043`, `cdsProfile: "story"`, content type `premiere`) and `studio-milwaukee` (`g-s921-1635`, content type `session`). Daily ingest like the other shows.
- **Content type.** `stories.contentType` widens from `"episode"` to `"episode" | "premiere" | "session"`.
- **Article step replaces transcription.** For `premiere` and `session`, the pipeline fetches the CDS document, keeps its text assets in layout order, and stores each paragraph as a `transcriptSegments` row (`speaker: "article"`, `startMs`/`endMs: 0`, `idx` = paragraph order). Search, evidence checks and ask-the-story reuse them unchanged.
- **No lyrics, ever.** Before storing, drop any text asset that is entirely italic lines joined by `<br>` (how CDS marks quoted lyrics). The writer's own sentences around them stay. Lyrics never reach extraction, search or quotes.
- **Extraction.** The same step (Claude Haiku 4.5 on Bedrock) with the show profile's notes, plus an optional `song` object: `artist`, `title`, `album?`, `releaseDate?`, `credits[{role, name}]`, `releaseShow?{venue, date}` for premieres; `artist`, `setList[]` for sessions. Every field needs a supporting quote checked against the article, as mentions do; a field without one is dropped.
- **Songs table.** One row per premiered song or per session performance: `storyId`, `runId`, `kind` (`premiere`|`session`), `artist`, `title?`, `album?`, `releaseDate?`, `credits`, `releaseShow?`, `setList?`, `audioUrl?` (premiere only), `reviewStatus`. This is what the playlist tool will later match against (out of scope here).
- **Review.** The episode review page shows the song record as one item (keep / remove / edit fields), alongside people, places and topics. Publishing works as for episodes; nothing reaches Alexa before approval.
- **Public read.** `getStory` returns `contentType` and, when approved, `song`; `searchStoryCards` and `latestStoryCards` include premieres and sessions (show names "Milwaukee Music Premiere", "Studio Milwaukee Sessions").

### Part 2 — Field Guide: Concert Picks as staff picks

- **Find.** A daily job asks CDS for the station's newest stories and takes those titled `MKE Concert Picks:` with a `/concerts/` canonical URL; an article already imported (by CDS id) is skipped.
- **Parse (no AI).** The list block after "Best concerts in Milwaukee this week" splits into lines `<Mon. D>: <headliner>[ w/<openers>] @ <venue>, <time>`. Unparseable lines are reported, never guessed.
- **Match.** A line matches a Field Guide event when: same calendar day (Chicago), venue matches through the existing venue name/alias registry, and the headliner appears in the event title (normalized). One match per line; ties go to the nearest start time.
- **Write.** Matched lines become `staff_picks` rows: `curatorName` = the article byline, `curatorRole` = "Radio Milwaukee", `blurb` = the spotlight paragraph(s) that name the headliner, else "On Radio Milwaukee's MKE Concert Picks this week.", `showUrl` = the article URL, `weekOf` = the article's week, `sortOrder` = list order. Re-running is idempotent (keyed by CDS id + event).
- **Unmatched.** Listed on the admin picks page as "In Concert Picks, not in the event guide" with the parsed line; never created as events automatically.
- **First run is a dry run** whose matches and misses are shown to Tarik before any write (production data).

### Part 3 — Radio Commons: what Alexa does

- **Stories.** Premieres and sessions come through the existing tools (`find_station_story`, `latest_station_stories`, `get_station_story`, `ask_station_story`); the show list gains the two music shows.
- **Premiere card.** Artist photo, song and artist, album + release date, credits, release show; ▶ plays the premiere `audioUrl`. Speech: "From Radio Milwaukee's Milwaukee Music Premiere, October 2026: Glitzy, 'Effort', from their debut album out October 23. Want to hear it?"
- **Session card.** Date, artist, set list, "Watch on radiomilwaukee.org" (session page via `openLink`; `radiomilwaukee.org` joins the host allowlist). No audio.
- **Asking an article.** Passages come from paragraphs, attributed "Radio Milwaukee's premiere says…" / "…session write-up says…"; no seek-to-moment control on article passages.
- **Release show.** When the song's release show matches a Field Guide event (venue + date), the card offers Details and Add to calendar.
- **Picks.** `station_picks` already reads staff picks: no change beyond copy.

## Trust rules

Station text only; no lyrics anywhere (stripped before extraction, never quoted); every song field backed by a quote from the article; editor approval before Alexa; Concert Picks never invent events; premiere audio is played as published by the station, session audio never.

## Errors

| Situation | Behavior |
| --- | --- |
| Article has no list block / unparseable lines | Picks import reports it; nothing written for those lines |
| Song field without a supporting quote | Field dropped; the editor sees the gap |
| Premiere audio missing | Card without ▶; speech offers the article instead |
| CDS down during picks import | Job retries next day; no partial week written (one transaction per article) |

## Testing

- Backstory (convex-test): lyrics stripping on the real Glitzy article; article → segments in order; song extraction validated and quote-checked; review keeps/removes the song; public reads by content type.
- Field Guide (PGlite): list parsing on the real 2026-09-30 article; matching by day + venue alias + headliner; idempotent re-run; unmatched report; dry-run mode writes nothing.
- Radio Commons: premiere and session cards (escaping, ▶ only with audio), speech lines, allowlist, ask-the-article attribution.
- Live: dry-run picks for the current week shown to Tarik; simulator checks listed under Purpose.

## Out of scope

"What's playing on 88Nine?" and song stories from the playlist (needs the playlist tool's song id); concert news and reviews; syndicated content; session audio; creating Field Guide events from unmatched picks.

## Open questions

- Who reviews premieres and sessions (Brett Krzykowski?) — profile reviewer field.
- The premiere audio play decision should be confirmed with the station's music team before the public demo; the code makes it one setting.
