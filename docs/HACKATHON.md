# Radio Commons — Alexa+ hackathon submission

*Status as of October 4, 2026. The same story as the judges page: https://radio-commons.vercel.app/how-it-works*

## The problem

Radio is immediate and fleeting. You hear a song on the drive home or a local story in the kitchen, and it's gone. Smart speakers are where Radio Milwaukee's most loyal listeners already are (40% of its stream listening hours; source: `docs/research/2026-10-04-landscape.md`, Triton streaming data, August 2026), but all they can do there is press play.

Alexa+ keeps the current conversation, and Amazon's add-on docs leave memory across sessions to each add-on ("Your tools must be able to return relevant confirmation data so Alexa can answer these recall questions", [Components and patterns](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html)). Without it, a listener who says "save number 3" a few turns later gets nothing, and the station can't tell them what changed since their last visit.

## What it does

Radio Commons is an MCP server a public radio station built itself, so Alexa+ can answer from the station's own reporters, DJs and editors: stories, songs the station just played, local events, and a listener's saved songs.

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
                                                                 ├─ /api/mcp        16 tools; 6 need a linked account
                                                                 ├─ cards           MCP App (ui://radio-commons/story-card.html)
                                                                 └─ /.well-known/oauth-protected-resource  (account linking via Clerk)
                                                                 ▼
   Playlist database (Convex, rm-playlist-v2): plays, songs, artists, concerts, Finds, listener memory
   Backstory (Convex): the station's editor-published stories, premieres and Studio Milwaukee sessions
   MKE Field Guide: events and staff picks
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
| The 16 tools and the MCP Apps card resource | [`src/lib/mcp.ts`](../src/lib/mcp.ts) |
| Account linking per Amazon's spec: OAuth 2.1, PKCE S256, refresh tokens, the add-on sends the RFC 8707 resource parameter during account linking, RFC 9728 metadata | [`src/app/.well-known/oauth-protected-resource/route.ts`](../src/app/.well-known/oauth-protected-resource/route.ts), token checks in [`src/lib/listenerAuth.ts`](../src/lib/listenerAuth.ts) |
| Calling the endpoint the way Alexa+ does | [`scripts/smoke.mjs`](../scripts/smoke.mjs) (`npm run alexa:smoke`) |
| Real listener phrases through the live simulator | [`scripts/eval-turns.ts`](../scripts/eval-turns.ts) (`npm run eval:turns`) |

## Demo script

The scenarios `scripts/eval-turns.ts` runs before every demo and after every deploy, in the order to show them:

1. "What were the last 5 songs on 88Nine?" — a numbered list with artwork and 30-second previews.
2. "Save number 3." — saves the third song shown, with the one-sentence reply above.
3. "When did you last play Nas?" — searches about two weeks of plays.
4. "What are the credits on Groove Thang?" — credits and the story behind the song.
5. "Follow Thao." — follows the artist.
6. "What's new for me?" — the digest and its card.

Then "Alexa, delete my Finds" to show the memory is erasable.

Amazon isn't giving hackathon participants the Alexa+ developer tools, so the demo runs in our simulator (https://radio-commons.vercel.app/simulator), which plays Alexa+ around the same MCP server and shows every tool call under "What Alexa did".

## Honest limits

- Station stories appear only for artists Radio Milwaukee has covered (premieres, Studio Milwaukee sessions).
- No proactive notifications: Amazon doesn't document them for MCP add-ons, so the digest waits for the listener to ask.
- Memory is exact facts (follows, saves, the last list, the last visit), not things said in passing.

## Team

Tarik Moody, Radio Milwaukee (88Nine Radio Milwaukee), with Claude Code.
