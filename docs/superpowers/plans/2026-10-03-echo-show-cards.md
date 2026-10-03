# Echo Show cards and simulator redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the story card and the simulator to Amazon's MCP Design Guide for Alexa+, matching the approved mockup board, with a real Amazon Location map for places.

**Architecture:** One MCP App resource (`ui://radio-commons/story-card.html`) renders four views chosen by the tool result's `structuredContent.view`: `story`, `quote`, `stories` (carousel), `places` (map). The card authors at Amazon's 768×480 base canvas and applies one root zoom from the host's container width; light/dark from the host theme. Maps are Amazon Location static images fetched through our server (key stays server-side), with numbered pins drawn by the card at Web Mercator positions. The simulator becomes an Echo Show 8 stage (1280×800) plus a side "What Alexa did" panel.

**Tech Stack:** Next.js (Vercel), mcp-handler, `@modelcontextprotocol/ext-apps` (App, AppBridge), Amazon Location `GetStaticMap` (v2), Bedrock, Vitest, Playwright (system Chrome) for screen checks.

**Spec / design sources:** approved mockup board https://claude.ai/artifact/2N85pDv27Bsgm1D6kBCYVS (Tarik, 2026-10-03: "looks good"); Amazon MCP Design Guide pages (Introduction, Layout and Rendering, Visual Foundations, Components and Patterns, Brand Expression, Display Modes, Accessibility), developer.amazon.com/docs/alexaplus/add-ons/; decisions: Amazon Location maps, trail panel kept outside the device, landing page later.

## Global Constraints

- Base canvas 768×480; one root `zoom` = container width ÷ 768 (Echo Show 8/15 ≈ 1.667). No per-surface pixel overrides.
- Type tokens at base: display 48/40/32/28/24, headline 20/18, body 16/14/12. Spacing 2/6/8/12/16/20/24. Radius 4/8/12/16.
- Colors: light card #FFFFFF on #FAF9FB; dark card #14181E, inner #1B2028; dark secondary button #232F40. Radio Milwaukee orange #F7941D only on the primary action and pin badges, with #1E2124 text on it.
- Touch targets ≥48×48 at base. Text contrast ≥4.5:1 (≥3:1 at 18px bold+).
- Only Amazon's patterns: Card (story, quote), Carousel (stories), Map (places). One title, one or two supporting fields, one clear action.
- Logo top-left inline; top-center in fullscreen. Alt text on every image (≤125 chars).
- Light and dark mode both supported, from host theme.
- Map key: `AMAZON_LOCATION_API_KEY` server-side only (Sensitive in Vercel). Only `GetStaticMap` used in this plan; `GetTile` (pan/zoom) is out of scope.
- Every story text is escaped in one place (renderer); the card never injects unescaped data.
- CSP `_meta.ui.csp.resourceDomains`: f.prxu.org, dovetail*.prxu.org, radio-commons.vercel.app (our map proxy and logo). Nothing else.

## Review Focus

1. **Pins in the wrong place** (wrong zoom convention or Mercator math). Expected: a pin sits on its street. Test: Task 3 unit test against a known point + live screenshot comparison in Task 6.
2. **Overlapping places** (same address: High Stakes / Peacock Lounge; dense downtown). Expected: one cluster badge, list explains it. Test: Task 3 "clusters pins closer than 36 base px".
3. **A story with no pinned places** asked "where is it?". Expected: no map view; Alexa says no places are mapped. Test: Task 4.
4. **Map proxy abuse** (anyone hitting `/api/map` to spend Amazon calls). Expected: only positions from a published story, bounded size, cached. Test: Task 2 refuses arbitrary coordinates.
5. **Dark mode contrast and the orange button** in both themes. Expected: ≥4.5:1. Test: Task 1 contrast assertion on tokens.

---

### Task 1: Card foundation (tokens, scale, theme, logo, views)

**Files:** Modify `src/lib/card.ts` (split into `src/lib/card/` if it passes ~250 lines: `tokens.ts`, `views.ts`, `page.ts`); Test `tests/card.test.ts`; add `public/brand/rm-logo.png` (light) and `rm-logo-dark.png` (from Field Guide brand files).

**Produces:** `renderView(view: CardView): string` where `CardView = { view: "story", story } | { view: "quote", story, passages } | { view: "stories", matches } | { view: "places", story, map }`; `storyCardPage()` with tokens CSS, root zoom from `app.getHostContext().containerDimensions.width / 768` (fallback 1), `data-theme` from host theme, re-applied on `onhostcontextchanged`.

- [ ] Failing tests: tokens give ≥4.5:1 for text on both card colors and #1E2124 on #F7941D (small WCAG contrast helper in test); `storyCardPage()` contains `zoom` logic and `data-theme`; every view escapes `<script>` in titles/quotes; logo `<img alt="Radio Milwaukee">` present in every view.
- [ ] Implement; old `renderCard` callers move to `renderView({ view: "story", story })`.
- [ ] Story view = mockup "Story card": artwork 180px base, show · month, title (display 28), one line "Ted's Ice Cream, Bread House, Hong Anh Palace and 6 more places" (first 3 names + count), buttons ▶ Play episode (primary) and Places (secondary, only if any place is pinned; switches to the places view client-side when map data is present, else hidden).
- [ ] Quote view = mockup "Quote card": quote at display 40, "From the episode · 10:45", ▶ Play from 10:45 (seeks, as today) + Whole episode.
- [ ] Stories view = Carousel: up to 5 cards, numbered badges 1..n, artwork, title (2-line clamp), date; tapping one posts `ui/message` "Tell me about story N" via `app.sendMessage` (host turns it into the next turn).
- [ ] Commit.

### Task 2: Map proxy (server)

**Files:** Create `src/app/api/map/route.ts`, `src/lib/map/staticMap.ts`; Test `tests/map/staticMap.test.ts`.

**Produces:** `GET /api/map?story=<id>&w=<px>&h=<px>&theme=light|dark&n=<count>` → PNG from Amazon `GetStaticMap` centered/zoomed to fit the story's first n pinned places; `cache-control: public, s-maxage=86400`. `mapFrame(points, w, h) → { center, zoom }` pure.

- [ ] Failing tests: `mapFrame` fits points with padding and caps zoom (max 15); route refuses unknown/unpublished story (404), w/h outside 200..1600 (400), n outside 1..10; builds the Amazon URL with `center`, `zoom`, `width`, `height`, `color-scheme` and the key, never echoing the key in errors.
- [ ] Implement with `fetch` to `https://maps.geo.us-east-1.amazonaws.com/v2/static/map?...`; positions come only from Backstory `getStory` (never from the query string).
- [ ] Commit.

### Task 3: Pins and clusters (pure, used by the card)

**Files:** Create `src/lib/map/pins.ts`; Test `tests/map/pins.test.ts`.

**Produces:** `pinPositions(points, frame, w, h) → {x, y}[]` (Web Mercator, 512-px tiles; verify convention against a live image in Task 6 and adjust one constant); `clusterPins(pins, minDistance = 36) → { label: string; numbers: number[]; x; y }[]`.

- [ ] Failing tests: center point maps to the image center; a point one tile east at zoom z maps 512 px right; two pins at the same address cluster to one badge listing both numbers; pins ≥36 px apart stay separate.
- [ ] Implement; the places view renders the static image with absolutely positioned badges (orange numbers; dark pill "N places downtown"-style label = "N places" for clusters) and the numbered list (name + street from address), "See all N" toggling a larger list when > 3.
- [ ] Commit.

### Task 4: MCP tools

**Files:** Modify `src/lib/mcp.ts`, `src/lib/backstory.ts` (add `latestStoryCards`), `src/lib/speech.ts`; Tests `tests/mcp.test.ts`, `tests/speech.test.ts`.

- [ ] Failing tests:
  - `find_station_story` becomes an app tool (carousel when >1 match, story view when 1); transcript-match hints ("Mentioned at 10:45: …") are spoken as the reason.
  - New `latest_station_stories({ show? })`: "The three newest This Bites stories are …" + carousel.
  - `get_station_story({ storyId, view? })` with `view: "places"` returns the places view with map data (`mapUrl`, frame, pins) when ≥1 place is pinned; with none, spoken "Radio Milwaukee hasn't mapped places for that story." and the story view.
  - `ask_station_story` returns the quote view.
- [ ] Implement; tool list = 4 tools; all link the one card resource.
- [ ] Commit.

### Task 5: Simulator page

**Files:** Modify `src/components/sim/Simulator.tsx`, `CardHost.tsx`, `TrailPanel.tsx`, `simulator.module.css`; `src/lib/sim/brain.ts` (prompt); Tests `tests/sim/brain.test.ts`, `tests/sim/ui.test.ts`.

- [ ] Failing tests (brain prompt): mentions `latest_station_stories`; "To play, tell the listener to tap ▶ on the screen"; "For directions, tell the listener to tap Directions on the screen or a place on the map"; "For where places are, call get_station_story with view places".
- [ ] Page = mockup "Simulator page": device bezel with a 1280×800 stage; inside the stage the listener's words (small, muted) and Alexa's reply (headline) above the card iframe, which fills the rest; light/dark toggle on the page sets the host theme; `AppBridge` gets `hostContext` `{ theme, displayMode: "inline", containerDimensions: { width, height } }` and `setHostContext` on toggle/resize; side panel "What Alexa did" (open by default) with the existing plain-English lines, colored dots for tool calls, total time; talk button + text box under the device.
- [ ] Card tap on a carousel item (`ui/message`) runs as the next typed turn.
- [ ] Commit.

### Task 6: Live checks, docs, review

- [ ] Deploy; screenshot each view in both themes at 1280×800 (Playwright, system Chrome) and compare to the mockup board; check a pin lands on Ted's Ice Cream (6204 W North Ave) and on Bread House within ~10 px.
- [ ] Re-run the 10 listener conversations; add "Where are the places from that episode?", "What's new on This Bites?", "Play that part", "Directions to Ted's".
- [ ] Measure tiles/requests per view in the trail or logs; note cost in the learning log.
- [ ] Docs: README (cards, map key), decision 004 (Amazon design guide adoption: what we gave up — Field Guide brutalist look inside the device), learning log.
- [ ] Final fresh review; fix Critical/Important test-first.
