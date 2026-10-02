# Radio Commons, slice 1: station story tools for Alexa+ — design

**Date:** 2026-10-02 · **Status:** awaiting Tarik's review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Purpose

Radio Commons gives public-radio listeners a way back to local audio that mattered (concept: `~/Projects/alexa/docs/plans/2026-09-03-radio-commons-concept.md`). This first slice builds the Radio Commons Alexa+ server as a real foundation, with one working feature: a listener describes a Radio Milwaukee podcast story they half-remember, Alexa+ finds it, tells them about it with its source, and shows a story card on screen devices. Playlist→Spotify, events and listener accounts plug into the same server in later slices.

**Success looks like:** in Amazon's Alexa+ web simulator, *"What was that Uniquely Milwaukee story about the art shop in West Allis?"* returns the 414 Art Revival story by name, with the show and month, a summary that matches what the editor published, one offered next step, and (on a screen) a story card with artwork, places and a working Play button. Every response stays under 500 ms.

## What Tarik decided (2026-10-02)

| Question | Decision |
|---|---|
| Scope of this slice | Foundation for Radio Commons, story tools as the first feature (not a standalone wrapper, not the whole demo) |
| Listener accounts | Designed for, built in the next slice. Slice 1 is anonymous |
| Hosting | Vercel |
| Listener experience | Voice answer plus a story card (MCP App) |
| Approach | A: one Next.js app using Vercel's `mcp-handler` |
| Images | Store an image per story in Backstory so the card can show it |
| Repo | New: `radio-commons` |

## Constraints from primary sources

- **Hackathon rules** (https://amazonappdev2026.devpost.com/rules): self-hosted MCP server, **MCP spec 2025-11-25 or later, Streamable HTTP**, the required technology "imported and actually called" at runtime; submission due **Friday, October 23, 2026, 12:00 PT**; demo video under 3 minutes showing it working on the target device; repo public with an open-source license, or private and shared with the listed Amazon reviewers. Judges weight tech implementation, design, impact and idea equally; "basic MCP wrapper around an existing API" is called obvious; multi-service workflows, state across sessions, media (cards) and MCP Apps are called creative. A simulated Alexa+ web experience is an allowed fallback.
- **Amazon Alexa+ MCP quickstart** (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html): onboard with the `alexa-ai` CLI (`alexa-ai configure`, `alexa-ai new mcp …`, `alexa-ai deploy`), or the Add-on Agent Skill; remote HTTPS URL; **round-trip response under 500 ms**; visuals follow the **MCP Apps** standard (`@modelcontextprotocol/ext-apps`); test in the web simulator, then devices, then beta testers. Account linking is OAuth 2.1 with PKCE (S256); dynamic client registration is not supported.
- **Alexa+ client lifecycle** (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html): Alexa+ keeps conversation context itself; the server gets listener identity only through account linking; elicitation (clarifying questions) is supported through MCP.
- **Radio Commons concept:** every record carries `stationId`; Convex stays behind the gateway (never exposed to Alexa+ directly); source every narration, preserve title and attribution; label generated summaries; no host-voice imitation.
- **Backstory contract:** Alexa may read only editor-published data, through Backstory's public queries. `public.getStory` and `public.searchStories` already enforce "approved run only, nothing removed, nothing marked keep-off-Alexa".
- **Library check (2026-10-02):** `mcp-handler` 2.2.0 requires `@modelcontextprotocol/server` ^2 (2.2.0), which declares protocol versions 2025-11-25 and 2026-07-28; `@modelcontextprotocol/ext-apps` 2.0.3 builds on the same v2 server. Compatible.

## Architecture

```
Listener ──voice──▶ Alexa+ ──MCP, Streamable HTTP──▶ radio-commons (Next.js on Vercel)
                                                      ├─ /mcp            tools (mcp-handler)
                                                      ├─ story card       MCP App resource (ui://…)
                                                      ├─ stations.ts      stationId "radiomilwaukee" config
                                                      ▼
                                       Backstory Convex (read-only public queries, server-side only)
                                       searchStoryCards (new) · getStory (+ imageUrl)
```

### Units

| Unit | Job | Depends on |
|---|---|---|
| `radio-commons` `/mcp` route | MCP endpoint over Streamable HTTP; registers tools and the card resource | `mcp-handler`, tools |
| `lib/stations.ts` | Station config: `stationId`, display name, shows, Backstory deployment URL (env) | nothing |
| `lib/backstory.ts` | Server-side Backstory client (`ConvexHttpClient`), zod-validated responses, timeouts | `convex`, `zod` |
| `lib/speech.ts` | Pure functions: a Backstory story → the spoken answer; matches → the spoken shortlist | nothing |
| `tools/findStationStory.ts`, `tools/getStationStory.ts` | Tool definitions (name, description, input schema) and handlers | backstory, speech |
| Story card (MCP App) | HTML/React view rendered by Alexa+ on screen devices from the tool's structured result | `ext-apps` |
| Backstory: `imageUrl` | Stored per story at ingest, backfilled for existing stories, returned by `getStory` | CDS series asset; PRX feed |
| Backstory: `public.searchStoryCards` | Story-level search over title, summary, topics and place names, published stories only | Convex search index |

## Request flow

1. Listener: *"What was that Uniquely Milwaukee story about the art shop in West Allis?"*
2. Alexa+ calls `find_station_story({ description: "art shop in West Allis", show: "uniquely-milwaukee" })`.
3. The server calls Backstory `searchStoryCards` (one query), takes the top 3.
4. Returns the shortlist (title, show, month, a one-line "matched on") and a short spoken line. With two close matches Alexa+ asks which one; with none it says so and offers to search differently.
5. Alexa+ calls `get_station_story({ storyId })`. The server calls `getStory` and returns:
   - **spoken:** summary (labeled as the station's), attribution ("from Uniquely Milwaukee, September 2026"), and one offer (directions to the main place, or hearing the episode);
   - **structured:** the story record (people, places with coordinates and neighborhood, topics, actions, audio URL, image URL) for Alexa+'s model;
   - **card:** the MCP App view.
6. "Directions" uses the place's coordinates from Backstory.

## Tools

### `find_station_story`
- **Description (read by Alexa+'s model):** "Find a Radio Milwaukee podcast story a listener remembers, by topic, person, place or neighborhood. Returns up to three published stories. Use only these results; never invent a story."
- **Input:** `description: string` (1–200 chars), `show?: "this-bites" | "uniquely-milwaukee"`.
- **Output:** `matches: { storyId, title, show, monthYear, matchedOn }[]` (0–3) and `spoken: string`.

### `get_station_story`
- **Description:** "Tell the listener about one Radio Milwaukee story. Speak only from this record, always say the show and month, and describe the summary as Radio Milwaukee's, not your own."
- **Input:** `storyId: string`.
- **Output:** `spoken: string`, `story` (the Backstory `getStory` record minus internals, plus `imageUrl`, plus `audioUrl` with the Podtrac tracking hop removed), and the story-card resource link.

## Story card (MCP App)

Shows: show artwork (`imageUrl`), title, "Uniquely Milwaukee · September 2026", summary, places with neighborhood, action chips, and **Play episode** (Dovetail audio URL). Screens only; voice-only devices get the spoken answer. Follows Field Guide's visual style where it fits (cream background, ink borders) but must meet MCP Apps and Alexa+ display guidance (read "Display Modes" and "Components and Patterns" in the design guide during planning).

## Backstory changes (in the Backstory repo, its own PR)

1. **`stories.imageUrl`** (optional): at ingest, the PRX feed's episode `itunes:image` when it differs from the show artwork, otherwise the CDS series asset with rel `image-square` (both found on 2026-10-02: the series asset for 718414860 is `https://f.prxu.org/13497/images/…/c501d8ff….jpg`). Backfill existing stories once. `getStory` returns it.
2. **`public.searchStoryCards({ text, showSlug? })`:** a Convex search index on a new `stories.searchText` (title, approved summary, topic names, approved place names), filtered to `reviewStatus: "approved"`, `doNotUse: false`; recomputed when an episode is published. Today's `searchStories` (names and quotes only) stays for exact-name lookups.
3. Tests: the new search never returns an unpublished, removed or keep-off-Alexa story.

## Errors

| Situation | Listener hears | Server does |
|---|---|---|
| Backstory slow (>350 ms) or down | "I can't reach Radio Milwaukee's stories right now." | Aborts the call, logs tool + duration, no partial answer |
| No match | "I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood." | Returns `matches: []` |
| Story unpublished, removed or unknown id | Treated as not found | `getStory` already returns null |
| Invalid input | MCP error with a plain message | zod validation at the boundary |

## Latency budget (500 ms round trip)

One Backstory query per tool call; no model calls inside tools. Measured on 2026-10-01/02 from a laptop: Backstory queries ≈ 50–150 ms. Before onboarding, measure the full round trip from Vercel (warm and after idle); target ≤ 400 ms p95. If over, first fixes: Vercel function region next to the Convex deployment, then keep-warm.

## Testing

- **Unit:** speech formatting (summary, attribution, offers), match shortlisting, error mapping, audio-URL cleanup.
- **Contract:** a real MCP client connects to `/mcp` over Streamable HTTP, negotiates protocol 2025-11-25, lists tools and the card resource, calls both tools against a test Backstory deployment or recorded responses.
- **Backstory:** `searchStoryCards` privacy tests (above).
- **Live:** onboard with `alexa-ai`, ask the success-criteria question in the Alexa+ web simulator; then an Echo Show if available.
- **CI from day one** (typecheck, tests, build) with a red-then-green proof, and branch protection on `main`.

## Out of scope for slice 1

Account linking and listener threads ("save this for tonight"), Spotify playlists, events, per-story photos (needs radiomilwaukee.org articles or an editor upload), clip playback at a quote's timestamp, multi-station onboarding.

## Open questions

1. **Per-story photos:** do radiomilwaukee.org article pages exist for Uniquely Milwaukee stories, with photos the station has rights to? If so, a later slice can link them; otherwise an image field on the review page.
2. **Audio on Alexa+:** can an MCP App on Echo Show play the episode MP3 inline, or does playback hand off to Alexa's own player? Spike during planning; the card falls back to a link if inline play isn't supported.
3. **Repo visibility:** public with an open-source license, or private shared with Amazon's reviewers (rules allow either). The server holds no secrets beyond env vars.
