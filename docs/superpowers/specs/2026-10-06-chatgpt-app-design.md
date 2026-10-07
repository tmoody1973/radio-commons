# Radio Milwaukee in ChatGPT — design

*Status: draft for Tarik's review, October 6, 2026. Branch `feat/chatgpt-app`. Nothing here merges to `main` before the Alexa+ submission (October 23).*

## The idea

Radio Commons already answers Alexa+ from the station's own stories, songs, events and memory. This makes the same station available inside ChatGPT, designed for chat rather than ported from a speaker: **a radio you keep playing while you talk to it** (listen), **your music, built from what the station plays** (save and playlists), and **Milwaukee explained by its station** (stories, events, places). Listeners can also send the station a song request or a 5 O'Clock Shadow cover suggestion.

## What we know before designing (evidence)

A no-code test on October 6 added the live `/api/mcp` to ChatGPT as a custom server (developer mode, no auth):

| Checked | Result | Evidence |
|---|---|---|
| ChatGPT reaches the server and picks the right tool | Yes, 4 of 4 | Vercel logs: `on_air_now` 126 ms, `station_briefing` 727 ms, `get_station_story` 62 ms; the fourth call (`find_station_story`) fell in a log gap, its card is in the screenshot |
| Standard MCP Apps cards render | Yes, unchanged | Screenshots: on air, story list, briefing, story card |
| Replies read well in chat | Yes | ChatGPT rewrote the spoken text, kept the show, month and newsletter date |
| Card height | Wrong: empty space below content on 3 of 4 cards | `min-height: calc(100vh / var(--z))` in `src/lib/card/page.ts:20` |
| Episode Play | Failed: "Can't play here" | `audio.play()` rejected in `src/lib/card/page.ts:190`; cause unknown (frame policy or that link) |
| Save a song | Failed, as expected | No `save_find` log line: the HTTP 401 sign-in gate answered first, and ChatGPT cannot sign in yet |
| Listen live | **Not yet tested** | Decides whether the player plays in the card (see Listen) |

Sources for every OpenAI rule quoted below: developers.openai.com/plugins (concepts/ui-guidelines, build/chatgpt-ui, build/auth, reference, plugin-guidelines), read live October 6. The live sign-in metadata (Clerk `creative-dory-9232`) advertises PKCE S256 but neither dynamic client registration nor client metadata documents.

## Architecture: one kitchen, two doors

- `/api/mcp` stays exactly what Alexa+ gets today. Its tool list, replies and card are not changed by this work.
- New `/api/chatgpt/mcp` calls the same `buildMcpHandler` with `surface: "chat"`. Same tools, same data clients, same listener memory.
- `surface` decides four things only: which tools are listed, how replies are worded, which card page is served, and how sign-in is asked for. Everything that reads or writes station data stays shared.
- Why a second address, not detecting ChatGPT per request: ChatGPT's `openai/*` request hints are documented as hints only, may not arrive on `tools/list`, and a wrong guess would change what Alexa+ gets. An address can't be guessed wrong. (Decision 010.)

```
Alexa+  ──▶ /api/mcp          surface "voice"  ─┐
                                                ├─ buildMcpHandler ─▶ Backstory · Playlist · Field Guide · Mailchimp
ChatGPT ──▶ /api/chatgpt/mcp  surface "chat"   ─┘
```

## The chat card style (applies to every slice)

A separate card page for the chat door (`src/lib/card/chat/`), reusing the view data the tools already build. OpenAI's rules it follows:

- **System font only** ("Don't use custom fonts, even in full screen"). No Figtree, no Google Fonts.
- **No logo** in the card ("ChatGPT will always append your logo and app name").
- **ChatGPT's colors** for backgrounds and text (host CSS variables); 88Nine orange only on the primary button and number badges.
- **Sized to content**, never a fixed frame; reports its height to the host. Fixes the empty space.
- **At most two actions** per inline card (one primary, one secondary). List rows are tappable instead of carrying a button each.
- **Carousels** (stories, events, playlists) hold 3 to 8 items, each with an image and one optional action.
- **Fullscreen** only where a card can't hold it: the map, a playlist, the station home.
- **Alt text** on every image; WCAG AA contrast in light and dark.
- Every card tool sets `_meta["openai/widgetDescription"]` so the model doesn't narrate what the card already shows, and `_meta.ui.domain` plus `ui.csp`.

## Listen (the heart)

1. "Play 88Nine" or "what's on?" shows an **inline player**: artwork, song and artist, show and host. Primary **▶ Listen live**, secondary **Save**.
2. Listen live starts the stream and asks ChatGPT for **picture-in-picture**: a small player pinned at the top while the listener keeps talking. It shows art, song and pause only (OpenAI: "Do not overload PiP").
3. While it plays, the card asks the server what's on once a minute (`on_air_now`, widget-callable), so "who is this?" is always current.
4. Stations switch by talking ("switch to HYFIN"); no tabs in the card.
5. Pause ends the session: PiP closes and the card returns to the chat.
6. On phones, PiP may open fullscreen, so the player stays inline there.
7. Follow-up suggestions after a card: "Who is this?", "Save it", "Add to a playlist".

**If ChatGPT blocks audio** (the Listen live test): Listen live opens the stream in a new tab via the standard open-link request. Same for episode Play when its audio is refused.

## Milwaukee explained (stories, events, places)

Already working in the test; restyled only:

- Story search → carousel (art, title, show and month; one action: Play or Open).
- One story → story card (Play episode, Places). Places → map card that expands to fullscreen (the existing pan-and-zoom map).
- "Ask the episode" → quote card with ▶ Play from 10:45 (same fallback as Play).
- Briefing → a list of up to four rows, each row tappable (opens its story, picks or page); the card's one action is "Open the newsletter". Same four items Alexa+ reads (the shared card currently shows six; the chat card shows four now, the Alexa card after October 23).
- Events → carousel; near a story's places → map card. Add to calendar stays.
- Paging ("want the next two?") is voice-only; chat shows the whole list (up to 8).

## Sign in, save, follow

- **One fixed ChatGPT OAuth client in Clerk** (redirect `https://chatgpt.com/connector/oauth/…` exactly as ChatGPT shows it), entered under ChatGPT's "Advanced OAuth settings". Not dynamic registration: our token check accepts one client id per door (`src/lib/listenerAuth.ts:51`, because Clerk doesn't set `aud`), and DCR would mint a new client per connection. The chat door accepts the ChatGPT client id; the Alexa door keeps accepting only Alexa's.
- Tools declare `securitySchemes`: anonymous plus OAuth on everything that works signed out; OAuth only on Finds, follows, playlists, requests.
- Signed out, a signed-in tool returns a tool error with `_meta["mcp/www_authenticate"]` (with `error` and `error_description`), which makes ChatGPT show its own linking screen. The Alexa door keeps today's HTTP 401 gate.
- Same Clerk accounts as Alexa+: a song saved by voice is in the chat Finds and the reverse.
- Save from a card sends "Save this song" as a chat turn (as today), so the model calls `save_find` and ChatGPT handles sign-in. To test: whether a card button that calls a tool directly also gets the linking screen (UNVERIFIED in OpenAI's docs).

## Your playlists (new)

New, listener-owned playlists in the playlist database (rm-playlist-v2), next to Finds. **Not yet read: rm-playlist-v2's schema.** The plan's first step reads it.

- Data: a playlist (owner = listener account id, name, created) and its items (a track, when added, which station played it). Additive tables only; Finds, follows and plays unchanged. Alexa+ doesn't see playlists unless we later add voice tools.
- Tools (chat door only, signed in): `create_playlist`, `add_to_playlist` (by playId, list number, or title and artist, like `save_find`), `show_playlist`, `list_playlists`, `remove_from_playlist`, `delete_playlist` (destructive, asks first).
- "Make me a playlist of Milwaukee artists 88Nine played this month" works by the model searching the playlist and adding; no new search tool.
- Card: a playlist is a song list inline (first 8, Show more) and fullscreen for the whole list. Each song has a 30-second preview and Remove.
- Later, not now: export to Apple Music (Finds already connect to it), share links.
- **Songs in a time window (added 2026-10-07, Tarik):** in chat, "what played on HYFIN around 10?" or "from 10 to 10:30" shows **every** play in that window as a swipeable list with Save on each, not one best guess. Today `alexa:findSongPlayed` returns status `ok` with one match whenever there are no cues (checked: 09:45–10:15 and 10:00–10:30 on HYFIN each returned one song). Plan: a new read-only query in rm-playlist-v2 ("plays on a station between two times", newest first, capped at about 12), called only by the ChatGPT door; Alexa keeps its one confident answer.

## Requests and 5 O'Clock Shadow (new)

- One tool, `send_station_request`, signed in, chat door only: kind (`song_request` or `five_oclock_shadow`), song, artist, optional note.
- The model drafts it with the listener; a preview card shows exactly what goes to the station, with **Send** (primary) and changes made by chatting. Nothing sends without that tap.
- Sent as an email to a station inbox, from a fixed sender, reply-to the listener's account email only if they opt in. Limit: 3 per listener per day. Every request logged (listener id, time, kind), never the message body in logs.
- **Inbox:** digital@radiomilwaukee.org (Tarik, October 6). Set by env (`STATION_REQUEST_INBOX`), not hardcoded.
- **Open (Tarik):** what 5 O'Clock Shadow is exactly (assumed: a daily 88Nine cover-song feature listeners suggest for). **Open (plan):** the email service, chosen through the Vercel Marketplace step at planning time.

## Station home (sidebar)

After the slices above: one tool marked as a global entrypoint (`_meta["openai/ui"].entrypoints: [{type: "global"}]`) opening a fullscreen home: now playing on all four stations, your Finds and playlists, this week's briefing. ChatGPT-only metadata; the tool exists only on the chat door. Composer @-mentions wait: they are Desktop-only and aimed at Work plugins today.

## Kept off the ChatGPT door

- `support_radio_milwaukee`, `my_membership`, `cancel_membership`. OpenAI's plugin rules allow commerce for physical goods only and forbid displaying subscription plans, starting subscriptions or linking to checkout. A sentence telling a listener where to give on radiomilwaukee.org is information, not checkout; it can live in `what_can_you_do`.

## What stays exactly the same for Alexa+

`/api/mcp`'s tool list, tool descriptions, replies, card page, sign-in gate and timings. Proved by snapshot tests taken before any change (tools/list and a reply per tool through the existing contract tests in `tests/mcp.test.ts`), which must still pass after every slice.

Shared changes allowed to touch Alexa+: none before October 23. After the submission, the three tool annotations OpenAI requires (`readOnlyHint`, `destructiveHint`, `openWorldHint`) and the briefing's four-item card may move to both doors.

## Build order (each slice ships and is testable alone)

1. **Chat door + sign-in**: `/api/chatgpt/mcp`, `surface`, snapshot tests for Alexa, the ChatGPT Clerk client, `mcp/www_authenticate`, commerce tools hidden. Test: save a song in ChatGPT.
2. **Listen**: chat card page (style rules above) + player + PiP + live refresh + audio fallback.
3. **Milwaukee explained**: the remaining cards in the chat style.
4. **Playlists** (rm-playlist-v2 first, then tools and card).
5. **Requests and 5 O'Clock Shadow**.
6. **Station home** (sidebar entrypoint).

## Testing

- Unit and contract tests per slice (vitest, as today); `npm test`, `npm run typecheck`, `npm run build` green before any PR, CI on every PR.
- Alexa snapshots unchanged after every slice.
- Each slice ends with a hand test in ChatGPT developer mode against a Vercel preview deployment of this branch, with the steps written in the plan.
- Production (`radio-commons.vercel.app`) is not deployed from this branch before October 23.

## Risks and unknowns

| Risk | What happens if it's real | How we find out |
|---|---|---|
| ChatGPT blocks audio in cards | Listen becomes "open in a new tab" | Tap Listen live (5 seconds) |
| PiP doesn't keep audio playing | Player stays inline only | Slice 2 hand test |
| Card button tool calls don't trigger sign-in | Save always goes through a chat turn | Slice 1 hand test |
| "CSP off" badge means the card's allowed-sites list isn't applied yet | Art or audio breaks once enforced | Slice 2 sets `ui.domain`; check the badge |
| rm-playlist-v2 shape differs from the sketch | Playlist data model changes | Slice 4 starts by reading it |
| Developer mode plan limits (Pro: read-only tools) | Writes may need a Business plan to test | First hand test with a signed-in tool |
| Directory review (days to months) | Not on the hackathon timeline | Out of scope; developer mode is the target |

## Publishing (added 2026-10-07, agreed with Tarik)

Beta first, then the directory. Nothing below happens before October 23.

1. **Insider beta (after Oct 23).** Station staff, board members and roughly 10 tech-comfortable listeners add the app themselves from ChatGPT's Plugins page (Add → Add custom MCP server), following `/beta` (setup steps, Copy button, 5 things to try). Materials: `docs/beta/INVITE-EMAIL.md`, `SETUP-SESSION.md`, `VIDEO-SCRIPT.md`. The app says **Beta** and has **Send feedback** (decision 012); `/support` gives digital@radiomilwaukee.org.
2. **Before the first invitation:**
   - Merge to `main` in a quiet window. Give the ChatGPT door its **permanent production host** (set `CHATGPT_DOOR_HOST` in production). OpenAI can't change a published server address without a support ticket, so this host is the one we submit later.
   - **Turn on "Publish CIMD support" in Clerk** (OAuth applications → Settings → Client onboarding), pre-register ChatGPT's client, and allow only pre-registered clients. Testers then skip the client ID and secret fields: as of 2026-10-07, ChatGPT shows CIMD as "Unavailable because the server did not advertise CIMD support". Test first: change the ChatGPT token check to accept ChatGPT's CIMD client ID.
   - Update `/privacy` for the ChatGPT app (request and feedback emails, the name a listener gives, playlists once live). Tarik reviews the wording.
3. **Public listing in ChatGPT's directory (`chatgpt.com/plugins`).** This is the listener beta: search, Connect, done. It needs:
   - Clerk's **production** instance. The development instance is capped at 100 users and shared with Alexa, and accounts can't be moved, so Alexa listeners sign in again. This needs a plan of its own.
   - The playlist tools hidden until rm-playlist-v2 #69 is live ("unfinished work" is a rejection reason).
   - A reviewer account that signs in with a password and no email codes.
   - 5 positive and 3 negative test cases (the `/beta` list is the positive five), a demo video and release notes.
   - The `/.well-known/openai-apps-challenge` token, OpenAI organization verification, and the icon.
   - The directory name stays "Radio Milwaukee": OpenAI accepts no "trial or demo" plugins, so "Beta" lives only inside the app and the description.

## Not in scope

Composer @-mentions, Apple Music playlist export, real donations, any change to the Alexa+ add-on before October 23.
