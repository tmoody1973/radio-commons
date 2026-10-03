# Radio Commons, slice 4: events — design

**Date:** 2026-10-03 · **Status:** awaiting Tarik's review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Purpose

The concept's demo moment: after hearing about a story, a listener asks *"What's happening near there tonight?"* and Alexa answers from Radio Milwaukee's event guide (the MKE Field Guide, 24 live sources), then offers one action. This slice connects stories to events and gives Alexa the station's events and staff picks.

**Success looks like (simulator):** after the Frugal Dining story, "What's on near there tonight?" shows a map of nearby events (numbered, with the story's place marked) and Alexa reads up to three with venue and time; "Any free live music this weekend?" shows a carousel; "What's Radio Milwaukee recommending this week?" reads staff picks in the curator's words; tapping **Add to calendar** opens a Google Calendar event.

## What Tarik decided (2026-10-03)

| Question | Decision |
|---|---|
| Questions in scope | Near a story's places; what's on by time/type; station picks & events; add to calendar |
| Data path | A small read-only public API in the Field Guide; Radio Commons calls it |
| "Near there" | Within ~1 mile of the place on screen; widen once to 3 miles and say so |

## Design

### Field Guide: read-only public API

- `GET /api/public/events` — upcoming instances only (`status = scheduled`, event not cancelled/postponed, start ≥ now or still running), max 10.
  - `q` (≤120 chars): words, through the existing `searchEvents` (hybrid FTS + vector, no LLM).
  - `when`: `tonight | today | this-weekend | this-week` → `presetWindow(...)` from `search/query-understanding.ts`. Default: from now to end of `this-week`.
  - `near=lat,lng` + `radius` (miles, 0.1–5, default 1): only venues with coordinates; sorted by distance, then start time; each result carries `distanceMiles`.
  - `free=1`: only `isFree`.
  - Unknown parameters → 400 (cache-safe, like `/api/map`).
- `GET /api/public/picks` — this week's staff picks (curator name/role, blurb) joined to their next upcoming instance.
- Each event: `id, title, startAt, endAt, venue {name, address, lat, lng, neighborhood}, category, isFree, priceMin, priceMax, imageUrl, url` (Field Guide event page), `calendarUrl` (`googleCalendarUrl` from `lib/calendar-links.ts`), `isStationEvent`, `pick {curator, role, blurb} | null`, `distanceMiles?`.
- `cache-control: public, s-maxage=300`. Only fields already shown on the public site.

### Radio Commons

- Client `src/lib/fieldGuide.ts` (zod-validated, 800 ms timeout → `FieldGuideUnavailable`), base URL from `FIELD_GUIDE_URL`.
- MCP tools (both link the one card resource):
  - `find_events({ query?, when?, freeOnly?, nearStoryId?, nearPlace? })` — "what's on" by words/time, or near a story: Radio Commons resolves the place from Backstory (`getStory`; the named place if given, else the first pinned) and queries 1 mile, then 3 if empty. The model never passes coordinates.
  - `station_picks()` — this week's staff picks.
- Speech: up to 3, numbered like the screen, each with venue and day/time ("Tonight near Ted's Ice Cream: 1, Jazz Jam at Jazz Estate, 8 PM; …"). Widened: "Nothing within a mile; within three miles: …". Picks: "Radio Milwaukee's [curator] picks …" with the blurb's first sentence. Ends "Want to add one to your calendar?"
- Cards (Amazon patterns, same tokens and scaling as the story cards):
  - Near a story → **Map**: event pins numbered, the story's place as a distinct marker, list rows (title, venue, time, distance), Add to calendar per row, See all → fullscreen.
  - Otherwise → **Carousel** of event tiles: image (or category color), title, day/time, venue, "Free"/price, a "Staff pick" or "Radio Milwaukee" badge; buttons **Add to calendar** and **Details**.
- Host: the simulator opens `calendar.google.com` and Field Guide links (allowlist extended); Alexa's rule: "To add to a calendar, tell the listener to tap Add to calendar."

## Trust rules

Only Field Guide listings; never invent an event; always venue + day/time; picks described as Radio Milwaukee's, in the curator's words; cancelled/postponed never shown; events are described as "from Radio Milwaukee's event guide".

## Errors

| Situation | Listener hears |
|---|---|
| Nothing found (after widening for "near") | "I don't see anything [near there / for that] [tonight]." |
| Story has no pinned places | "Radio Milwaukee hasn't mapped places for that story. Where should I look?" |
| Field Guide down / slow | "I can't reach Radio Milwaukee's event guide right now." |

## Testing

- Field Guide (PGlite, real Postgres in memory): excludes cancelled/postponed/past; `when` windows; `near` radius and distance order; `free`; unknown params 400; picks join their next instance; calendarUrl present.
- Radio Commons: client schema + timeout; tool contract (near → map with story marker, widening, no pins, carousel, picks speech, down → apology); card rendering + escaping; brain rule.
- Live: simulator conversations above, screenshots of map and carousel in light/dark, Add to calendar opens Google Calendar.

## Out of scope

Saving events to a listener account (later slice, needs sign-in); Ticketmaster purchase links; events outside Milwaukee; spoken "add the second one" performing the add.

## Open questions

1. How many Field Guide venues have coordinates? (Measure in planning; if low, near-search coverage is limited — fallback is neighborhood text.)
