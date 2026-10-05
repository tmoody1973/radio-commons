# Radio Commons

**Your local station, inside Alexa+.** Radio is immediate and fleeting: you hear a local story on the drive home, a new song from a Milwaukee band, a show you meant to catch — and lose it. Radio Commons lets a listener ask Alexa+ about the story they half-remember, the local song they just heard, or what's on tonight, and get it back from the station's own reporters, hosts and editors: the real voices at the exact moment, with the source named, as a card on screen devices.

Pilot station: [88Nine Radio Milwaukee](https://radiomilwaukee.org). Built for the Amazon Developer Hackathon 2026 (Alexa+ track). **Site:** https://radio-commons.vercel.app · **Simulator:** https://radio-commons.vercel.app/simulator

## Status (October 5, 2026)

**Built and live**

| Area | What a listener can do | Since |
| --- | --- | --- |
| Stories | Find a This Bites, Uniquely Milwaukee, Ladies First or Radio Milwaukee Artist Interviews episode by what they remember (even words said in it), hear the summary, play it, see its places on a map, get directions, ask a detail question answered in the episode's own words at the exact moment | Oct 2–3 |
| Events | "What's on near there tonight?" from Radio Milwaukee's event guide (the MKE Field Guide): map near a story's places, carousel by day or type, free shows, Add to calendar, restaurant Reserve links | Oct 3–4 |
| Picks | "What is Radio Milwaukee recommending?": staff picks plus the station's weekly MKE Concert Picks (imported automatically each week) | Oct 4 |
| Music | Milwaukee Music Premieres (30, with Play song, credits, release show) and Studio Milwaukee Sessions (24, set lists, link to the session) | Oct 4 |
| Briefing | "What's new at Radio Milwaukee this week?": up to four items from the newest 88Nine weekly newsletter in the station's own words, each opening its story (Play), Concert Picks or the page | Oct 5 |
| Songs | "What's playing?", "When did you last play…?", "What was that song around 8:15?", "Tell me about this song" across 88Nine, HYFIN, Rhythm Lab and 414 Music | Oct 4 |
| Finds | "Save that song" to the listener's 88Nine Finds and Apple Music, with a linked Radio Milwaukee account; privacy page at /privacy | Oct 4 |
| Donations (sandbox) | "I want to support Radio Milwaukee": a monthly membership by voice, paid with Amazon Pay's sandbox (no real money), cancelled by voice. How to try it: see "Try a donation" below | Oct 5 |
| Simulator | The full Alexa+ experience in a browser: voice in and out, Echo Show cards light and dark, "What Alexa did" trail for judges | Oct 2–4 |
| Landing page | What it does, the smart-speaker case, how it works, how another station could use it | Oct 4 |

Behind it: [Backstory](https://github.com/tmoody1973/backstory), the station's story engine (transcripts, checked facts, editor review; 118 stories across six shows, each reaching Alexa only after an editor approves it), the station's playlist database, and the [MKE Field Guide](https://mke-field-guide.vercel.app) (events, venues, staff picks, the review admin).

**Planned before the October 23 deadline**

| What | Status |
| --- | --- |
| **Local song stories** — link Backstory's premiere and session facts to the playlist's songs, so "tell me about this song" includes Radio Milwaukee's own coverage of Milwaukee artists | Next, now that the playlist tools exist |
| Demo video and Devpost write-up | Next |

**Later:** a shared place directory for stories and events; more station shows (Cinebuds, HYFINated Conversations); onboarding a second station; running on real Echo devices through Amazon's Alexa+ for Builders (the add-on manifest is in `alexa/addon-package/`).

## How it works

```
Listener ──voice──▶ Alexa+ ──MCP, Streamable HTTP──▶ radio-commons (Next.js on Vercel)
                                                      ├─ /api/mcp          16 tools (mcp-handler); 6 need a linked account
                                                      ├─ cards             MCP App (ui://radio-commons/story-card.html)
                                                      ├─ /api/map          Amazon Location map pictures (key stays server-side)
                                                      ├─ /.well-known/…    OAuth resource metadata (Alexa account linking via Clerk)
                                                      └─ stations.ts       stationId "radiomilwaukee"
                                                      ▼
                     Backstory (Convex): editor-published stories, premieres, sessions
                     Playlist (Convex, rm-playlist): what 88Nine, HYFIN, Rhythm Lab and 414 Music played; song facts; Finds
                     MKE Field Guide: /api/public/events, /api/public/picks (read-only)
```

### The tools Alexa+ can call (20)

**Stories** (from Backstory; only editor-published)
- **`find_station_story`** turns a listener's description into up to three published stories, read back as a numbered list. It also finds a story by something said in it ("the episode where they talked about stromboli"), but only in episodes whose detailed answers are on. If nothing matches well enough, it says so; it never guesses.
- **`latest_station_stories`** reads the newest stories, optionally for one show ("What's new on This Bites?", "the latest Ladies First").
- **`get_station_story`** tells one story: the station's summary, its source ("From Uniquely Milwaukee, September 2026") and one next step. A **Milwaukee Music Premiere** shows the song, album, release date, credits and release show with **Play song**; a **Studio Milwaukee Session** shows its set list and links to the session (never its audio). With `view: "places"` it maps the story's places.
- **`ask_station_story`** answers a detail question in the station's own words: up to three transcript passages with the moment each is heard ("At 10:45 …"), playable from that moment; for premieres and sessions, the article's sentences ("Radio Milwaukee's premiere says …"). Never a passage naming someone an editor kept off Alexa, never song lyrics.

**Events and picks** (from the MKE Field Guide)
- **`find_events`** finds upcoming events by words, time (tonight, this weekend), free only, or **near a place from a story on screen** (1 mile, widening once to 3): a map with the place starred, or a carousel. Every event has **Add to calendar**.
- **`station_picks`** reads this week's Radio Milwaukee picks in the curator's own words, including the station's weekly **MKE Concert Picks** (imported automatically), topped up with station events.

**Briefing** (from the station's weekly newsletter in Mailchimp)
- **`station_briefing`** — "What's new at Radio Milwaukee this week?": up to four items from the newest weekly newsletter, in the station's own first sentences and credited to its date ("from the Oct. 1 newsletter"). On screen, each item opens its published story (Play), this week's Concert Picks, or the page on radiomilwaukee.org (Read). Sponsor content is dropped; no AI writes or retells anything. Reads only campaign titles and content, never subscriber data.

**Songs** (from the station playlists: 88Nine, HYFIN, Rhythm Lab, 414 Music)
- **`recent_songs`** — "What's playing?", "the last five songs on 88Nine": a numbered list with artwork and 30-second previews.
- **`search_playlist`** — "When did you last play Nas?", "Have you played the new Thao song?": searches about two weeks of plays on every station.
- **`find_song_played`** — "What was that song with horns around 8:15?": by station and time window, with descriptive cues.
- **`get_track_story`** — "Tell me about this song": credits, album, year and the artist's upcoming local shows.

**Finds** (needs the listener's Radio Milwaukee account, linked through Alexa)
- **`save_find`** — "Save that song": adds it to the listener's 88Nine Finds, and to Apple Music if connected.
- **`list_finds`** — "What's in my Finds?"
- **`delete_my_finds`** — deletes all of a listener's Finds and disconnects Apple Music, only after they confirm.

Also live (described in their own tool descriptions): `on_air_now`, `what_can_you_do`, `follow_artist`, `unfollow_artist`, `station_artist_shows`, `whats_new_for_me`.

- **On screens**, every tool returns one card in Amazon's [MCP Design Guide for Alexa+](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide-overview.html) patterns: a **story card** (artwork, title, ▶ Play episode, Places), a **premiere card** (Play song, credits, release show), a **session card** (set list), a **quote card** (▶ Play from 10:45), a **song list** (artwork, preview, Save), a **carousel** (numbered, tap to pick) or a **map** (Amazon Location, numbered pins matching a list; "See all" opens a pan-and-zoom fullscreen map). Cards are authored at Amazon's 768×480 base and scale to the screen, in light and dark.
- **Music:** the **Milwaukee Music Premiere** (a local song the station debuts each week) and **Studio Milwaukee Sessions** come through the same story tools. A premiere card shows the song, album, release date, credits and release show, with **▶ Play song** (and **Add to calendar** when the release show is in the event guide that week). A session card shows the set list and links to the session on radiomilwaukee.org; session audio is never played. Both are read from the station's articles, with quoted lyrics removed. **MKE Concert Picks**, the station's weekly list of recommended shows, become Field Guide staff picks, so `station_picks` reads them ("…from Radio Milwaukee's MKE Concert Picks"). Set `PLAY_PREMIERE_AUDIO=off` to link to premieres instead of playing them.
- Story data comes from [Backstory](https://github.com/tmoody1973/backstory), the station's story engine: podcasts are transcribed and every person, place and action is checked against a word-for-word quote from the episode, then **approved by an editor** before Alexa can read it.

**Trust rules:** only editor-published stories; every answer names its show and month; summaries are described as the station's, never as the assistant's; no invented stories; the database is never exposed to Alexa directly.

## Try the Alexa+ simulator

Amazon isn't giving hackathon participants the Alexa+ developer tools or simulator (Amazon, on the hackathon forum: "Access to the Alexa+ developer tools will not be granted to hackathon participants"), and the rules allow a simulated Alexa+. So **https://radio-commons.vercel.app/simulator** plays the part of Alexa+ around the same MCP server:

1. Hold to talk (or press Space, or type). Deepgram Nova-3 turns your words into text.
2. Claude Haiku 4.5 on Amazon Bedrock, playing Alexa+, calls our MCP tools through the official MCP client, exactly as an Alexa+ add-on is called, under the trust rules (answer only from the tools, always name the show and month).
3. Amazon Polly speaks the answer, streamed as it's made; the real story card (our MCP App) renders on the Echo Show screen through the official MCP Apps host bridge; Play stops Alexa's voice.
4. **What Alexa did** shows every step: words heard, each tool call and its time, where the answer came from.

The page needs a passcode (ask the station) so strangers can't spend the API credit. A turn takes about 4 seconds from releasing the button to hearing the answer.

### Try a donation (Amazon Pay sandbox, no real money)

This shows a monthly Radio Milwaukee membership started by voice, paid with Amazon Pay, and cancelled by voice. It runs on Amazon Pay's sandbox (a practice mode), so no real money moves, ever.

1. In the simulator, say "I want to support Radio Milwaukee" and tap a level. Or open https://radio-commons.vercel.app/give?tier=ga-monthly.
2. Main Floor and up come with a thank-you gift (a t-shirt, or a merch package). On the give page, keep the gift and pick a t-shirt size, or choose "No gift — all of it goes to the station". With a gift, Amazon Pay asks for the shipping address on its own page; we never see the street. Nothing actually ships in the demo.
3. Open the Amazon Pay page in a private (incognito) window, or signed out of any real Amazon account. A real Amazon login is refused with "Your order can't be completed with this account."
4. Sign in with the sandbox test buyer. Its email and password are in the Devpost testing instructions (private to judges), not in this repo.
5. Choose the card ending 1111, which always succeeds. The card ending 3434 shows a decline.
6. The thank-you page shows the receipt, with where the gift would ship (name, city and state). Press "Simulate next month" to see the second monthly charge.
7. In the linked simulator, say "what's new for me". The reply mentions the membership.
8. Say "cancel my Radio Milwaukee membership", then "yes". It's cancelled at Amazon Pay.

**What's real and what's simulated.** Real: the calls to Amazon Pay's sandbox API (create a checkout session, a charge permission, a charge, and close it), and the shipping address Amazon collects for a gift. Simulated: the money (none moves), the gift (nothing ships), and "next month" is a button, not a wait. Alexa+'s own native checkout isn't available to hackathon entrants, so the simulator opens the Amazon Pay page instead.

To run your own copy, see [docs/GIVE-SETUP.md](docs/GIVE-SETUP.md).

## Run it

Requirements: Node.js 20+ (Alexa's CLI needs 24+), npm.

```bash
npm ci                      # also embeds the MCP Apps bundle (postinstall)
cp .env.example .env.local  # set BACKSTORY_CONVEX_URL; for maps AMAZON_LOCATION_API_KEY (server) and
                            # AMAZON_LOCATION_BROWSER_KEY (tiles only); for the simulator DEEPGRAM_API_KEY,
                            # SIM_AWS_ACCESS_KEY_ID / SIM_AWS_SECRET_ACCESS_KEY (Bedrock Haiku + Polly only), SIM_PASSCODE.
                            # Songs: PLAYLIST_CONVEX_URL, RADIO_COMMONS_SERVER_KEY. Linked accounts: the CLERK_* values,
                            # MCP_RESOURCE_URL. Optional: FIELD_GUIDE_URL, PLAY_PREMIERE_AUDIO=off, MAILCHIMP_API_KEY (briefing). See .env.example.
npm run dev                 # MCP endpoint: http://localhost:3000/api/mcp
```

Check an endpoint the way Alexa+ calls it (protocol 2025-11-25):

```bash
node scripts/smoke.mjs http://localhost:3000/api/mcp "frugal dining"
node scripts/smoke.mjs https://radio-commons.vercel.app/api/mcp "frugal dining" 20   # + timing
```

## Test

```bash
npm test          # unit + MCP contract tests (Streamable HTTP, 2025-11-25)
npm run typecheck
npm run build
```

CI runs all three on every pull request; `main` is protected.

## Deploy

Vercel: set the variables above for Production and Preview, then `vercel deploy --prod`. Alexa+ round trips must stay under 500 ms; see `docs/LEARNING-LOG.md` for measurements.

## Connect to Alexa+

The Alexa+ add-on lives in [`alexa/addon-package/addon.json`](alexa/addon-package/addon.json): Amazon's add-on manifest, with an `MCP` integration pointing Alexa+ at `https://radio-commons.vercel.app/api/mcp`. `tests/alexaAddon.test.ts` checks it against the server (endpoint, a tool behind every example phrase, privacy page, icons), and `npm run alexa:smoke` calls the endpoint it names the way Alexa+ does.

Deploy it with Amazon's Alexa AI CLI (`@alexa-ai/cli`, per the [Alexa+ MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html)), after `alexa-ai configure`:

```bash
npm run alexa:deploy        # alexa-ai deploy, from alexa/; prints the Add-on ID
alexa-ai configure-account-linking --addon-id <id> --stage development --client-id <Clerk listener OAuth client id>
```

Account linking uses the listener Clerk app (OAuth 2.1, PKCE S256, refresh tokens, RFC 8707 `resource`); register every Alexa redirect URI in Clerk. Then test in the Alexa+ web simulator.

## Docs

- Specs, one per slice: `docs/superpowers/specs/` (story tools, simulator, ask the episode, events, music coverage, station briefing)
- Plans: `docs/superpowers/plans/`
- Decisions, in plain English: `docs/decisions/` (001 foundation · 002 simulator · 003 transcript answers · 004 Amazon's design guide · 005 events from the Field Guide · 006 music coverage · 007 station briefing)
- What we learned, slice by slice: `docs/LEARNING-LOG.md`
- Who else is doing this, and the smart-speaker numbers: `docs/research/2026-10-04-landscape.md`

## License

Apache-2.0
