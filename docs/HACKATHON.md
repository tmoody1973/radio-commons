# Radio Commons — Alexa+ hackathon submission

*Status as of October 6, 2026. The same story as the judges page: https://radio-commons.vercel.app/how-it-works. Sources for the problem section: `docs/research/2026-10-06-problem-framing.md`.*

## The problem

With federal funding gone and the donor surge fading, public radio's survival depends on staying close to its listeners, and those listeners increasingly ask an AI assistant instead of tuning in (40% of 88Nine's streaming hours already run through smart speakers). Radio Commons puts a station's own stories, songs, events and membership inside Alexa+, so when Milwaukee asks, the answer comes from the station that covers it.

- **The money:** Congress rescinded about $1.1B for public broadcasting in 2025, and the Corporation for Public Broadcasting has dissolved. The donor surge that followed has turned: at radio-only stations, membership revenue fell 7% and new donors fell 75% in May–July 2026 (CDP Index). Donors say they give for local: just over three-quarters rank local services above national programs, and 55% want more local news, music and arts (Greater Public, July 2026).
- **The attention:** 39% of Americans 12 and over own a smart speaker, about 112 million people (Edison Infinite Dial 2026). Alexa+ is free with Prime. Its new AI podcasts are built from 200+ licensed newsrooms, none of them public radio, and AI answers cut clicks to the source roughly in half (Pew, 2025).
- **88Nine itself is fine** (federal money was under 10% of its budget). This is an industry problem, hardest on small and rural stations, which is why the tools are open source.

Radio is immediate and fleeting. You hear a song on the drive home or a local story in the kitchen, and it's gone. Smart speakers are where Radio Milwaukee's most loyal listeners already are (40% of its stream listening hours; source: `docs/research/2026-10-04-landscape.md`, Triton streaming data, August 2026), but all they can do there is press play.

Alexa+ keeps the current conversation, and Amazon's add-on docs leave memory across sessions to each add-on ("Your tools must be able to return relevant confirmation data so Alexa can answer these recall questions", [Components and patterns](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html)). Without it, a listener who says "save number 3" a few turns later gets nothing, and the station can't tell them what changed since their last visit.

## What it does

Radio Commons is an MCP server, the way Alexa+ add-ons plug in, that a public radio station built itself, so Alexa+ can answer from the station's own reporters, DJs and editors. What a listener can do today, by voice or on an Echo Show:

| Ask | What happens |
|---|---|
| "What was that This Bites episode about frugal dining?" | Finds a story by what you half-remember (six shows, including Radio Milwaukee Artist Interviews), plays it, maps its places, and answers detail questions in the episode's own words at the exact moment |
| "What's new at Radio Milwaukee this week?" | A briefing from the station's weekly newsletter, in its own sentences; each item opens the real story, Concert Picks or the page |
| "Play the new Glitzy song." | Milwaukee Music Premieres play with credits and the release show; Studio Milwaukee Sessions show the set list |
| "Any live music near El Tsunami?" | Events near a story's places from the station's event guide, plus the weekly Concert Picks, with Add to calendar |
| "What's on right now?" / "Who's on 88Nine?" | All four streams with Listen live, and 88Nine's schedule |
| "Save that song." / "What's new for me?" | Finds, Apple Music, follows and a memory across sessions (below) |
| "I want to support Radio Milwaukee." | A monthly membership by voice, paid with Amazon Pay, cancelled by voice. **Amazon Pay sandbox: no real money moves**, and Alexa says so |

We built it from the systems 88Nine already had (NPR's content system, the playlist database, the event guide, the newsletter) plus one it didn't: **Backstory**, a story engine that turns a station's podcasts into verified, editor-approved answers. It transcribes every episode, checks every extracted fact against the episode's own words, and holds everything for an editor before Alexa can use it. Because every NPR member station already publishes to the same content system, Backstory is built to be reused: adding a show is a short profile, not new code. Today it runs one station; the second is the next step.

The agentic part is one sentence that runs across five services, and a memory that carries into the next session:

1. **Session 1 — "Alexa, save this."** One reply saves the song to the listener's 88Nine Finds, adds it to Apple Music, follows the artist, names their next local show, and points to the station's own story about them:
   > Saved "No ID" by Tank & The Bangas to your 88Nine Finds, and I'm adding it to Apple Music. I'll keep an eye out for Tank & The Bangas — they play Majestic Theatre in Madison on Tuesday, October 20, and we have their Studio Milwaukee story.

   (Real data from the playlist, as of October 4, 2026: the song played on HYFIN; shows are looked for in Milwaukee first, and with no Milwaukee date the next is in Madison; the story is the station's "Studio Milwaukee Session: Tank & The Bangas".)
2. **Session 2, days later — "Alexa, what's new for me?"** A digest built from what the station's DJs actually played, who is playing in town, and the station's own stories, since the listener's last visit:
   > Since your last visit: Rhythm Lab played Tank & The Bangas 10 times, 88Nine 3 times and HYFIN twice. Tank & The Bangas plays Majestic Theatre in Madison on Tuesday, October 20.

   (Real spins from the last 7 days, as of October 4, 2026.)

"Save number 3" works on any device: the server remembers the numbered list it showed for 30 minutes.

## Architecture

```
Listener ──voice──▶ Alexa+ ──MCP 2025-11-25, Streamable HTTP──▶ radio-commons (Next.js on Vercel)
                                                                 ├─ /api/mcp        tools for stories, briefing, songs, events, schedule, Finds, memory, membership; tools touching a listener's own data need a linked account
                                                                 ├─ cards           MCP App (ui://radio-commons/story-card.html)
                                                                 └─ /.well-known/oauth-protected-resource  (account linking via Clerk)
                                                                 ▼
   Playlist database (Convex, rm-playlist-v2): plays, songs, artists, concerts, Finds, listener memory
   Backstory (Convex): reads NPR's content system; editor-published stories, premieres, sessions and artist interviews
   MKE Field Guide: events, staff picks and the weekly Concert Picks
   Mailchimp: the station's weekly newsletter (campaign content only) · Amazon Pay: sandbox memberships
```

**"Save this", step by step:**

| # | Service | What it does |
|---|---|---|
| 1 | Playlist | Identifies the play: "number 3" from the remembered list, or the song and artist |
| 2 | Finds | Saves it to the listener's 88Nine Finds |
| 3 | Apple Music | Adds it to the listener's library (background job; the reply doesn't wait) |
| 4 | Concerts | Follows the artist and finds their next show (AXS and Ticketmaster listings, Milwaukee first) |
| 5 | Backstory | Finds the station's stories about the artist (background job, daily refresh) |

Background jobs store their results; the reply reads what is already stored, to keep it inside Amazon's guidance to "return results within 3 seconds" ([Functional requirements](https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html)).

**What we remember** (in the playlist database, keyed by the listener's account id — not their name or email): the artists they follow (including ones followed by saving a song, and ones they unfollowed, so a later save doesn't re-follow), the last list shown to them (used for 30 minutes), and when they last asked what's new. "Alexa, delete my Finds" erases all of it with their saved songs and Apple Music link. Why our own tables rather than an AI memory service: decision 009 (`docs/decisions/009-listener-memory.md` in the rm-playlist-v2 repo).

## The required technology, in code

| What | Where |
|---|---|
| Alexa+ add-on manifest (MCP integration, example phrases, privacy URL) | [`alexa/addon-package/addon.json`](../alexa/addon-package/addon.json); checked by `tests/alexaAddon.test.ts`; deployed with `npm run alexa:deploy` (Amazon's `alexa-ai` CLI) |
| MCP endpoint, Streamable HTTP, protocol 2025-11-25 | [`src/app/api/mcp/route.ts`](../src/app/api/mcp/route.ts) |
| The tools and the MCP Apps card resource | [`src/lib/mcp.ts`](../src/lib/mcp.ts) |
| Account linking per Amazon's spec: OAuth 2.1, PKCE S256, refresh tokens, the add-on sends the RFC 8707 resource parameter during account linking, RFC 9728 metadata | [`src/app/.well-known/oauth-protected-resource/route.ts`](../src/app/.well-known/oauth-protected-resource/route.ts), token checks in [`src/lib/listenerAuth.ts`](../src/lib/listenerAuth.ts) |
| Calling the endpoint the way Alexa+ does | [`scripts/smoke.mjs`](../scripts/smoke.mjs) (`npm run alexa:smoke`) |
| Real listener phrases through the live simulator | [`scripts/eval-turns.ts`](../scripts/eval-turns.ts) (`npm run eval:turns`) |

## Demo script

The scenarios `scripts/eval-turns.ts` runs before every demo and after every deploy, in the order to show them:

0. Before the demo: follow the demo artist once beforehand (e.g. "follow Tank & The Bangas") so their station story is already gathered; the first save then names it.
1. "What were the last 5 songs on 88Nine?" — a numbered list with artwork and 30-second previews.
2. "Save number 3." — saves the third song shown, with the one-sentence reply above.
3. "When did you last play Nas?" — searches about two weeks of plays.
4. "What are the credits on Groove Thang?" — credits and the story behind the song.
5. "Follow Thao." — follows the artist.
6. "What's new for me?" — the digest and its card.

Then "Alexa, delete my Finds" to show the memory is erasable.

Also in the demo: "What's new at Radio Milwaukee this week?" (then Play on the first item, the station's Jeff Levering interview), and "I want to support Radio Milwaukee" (the Amazon Pay sandbox; the test buyer's login is in the testing instructions).

Amazon isn't giving hackathon participants the Alexa+ developer tools, so the demo runs in our simulator (https://radio-commons.vercel.app/simulator), which plays Alexa+ around the same MCP server and shows every tool call under "What Alexa did".

## How it's different

As far as we can find, Radio Commons is the first time a public radio station has brought itself into Alexa+: its own editor-approved stories, music, events and membership, built by the station and open source. Others have done single pieces: a commercial station in Sedona, Arizona (KAZM) published its own MCP server for chat apps in July 2026; Spotify answers questions about a podcast episode; Sveriges Radio runs a text chatbot over its news; NPR and KUOW tested Alexa donations in 2018. None combines them inside Alexa+, and none holds every fact for an editor first. The research: `docs/research/2026-10-04-landscape.md`.

## Honest limits

- Station stories appear only for artists Radio Milwaukee has covered (premieres, Studio Milwaukee sessions).
- No proactive notifications: Amazon doesn't document them for MCP add-ons, so the digest waits for the listener to ask.
- Memory is exact facts (follows, saves, the last list, the last visit), not things said in passing.
- Donations run in Amazon Pay's sandbox only; real donations would need Amazon Pay's approval for nonprofit fundraising.
- Backstory runs one station today; it is built to be reused, not yet multi-station.
- Transcripts can misspell names the station's articles spell right; editors catch them in review.

## The code (all open source)

- [radio-commons](https://github.com/tmoody1973/radio-commons): the Alexa+ MCP server, Echo Show cards, simulator and site (Apache-2.0)
- [backstory](https://github.com/tmoody1973/backstory): the story engine and editor review (Apache-2.0)
- [rm-playlist-v2](https://github.com/tmoody1973/rm-playlist-v2): the station's playlist database, Finds and listener memory (Apache-2.0)
- [mke-field-guide](https://github.com/tmoody1973/mke-field-guide): the event guide, Concert Picks and the review screens (MIT)

What we used and what we'd tell each vendor: `FEEDBACK.md`. Every decision, in plain English: `docs/decisions/`.

## Team

Tarik Moody, Radio Milwaukee (88Nine Radio Milwaukee), with Claude Code.
