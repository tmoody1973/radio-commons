# Radio Commons

**Your local station, inside Alexa+.** Radio is immediate and fleeting: you hear a local story on the drive home, a new song from a Milwaukee band, a show you meant to catch — and lose it. Radio Commons lets a listener ask Alexa+ about the story they half-remember, the local song they just heard, or what's on tonight, and get it back from the station's own reporters, hosts and editors: the real voices at the exact moment, with the source named, as a card on screen devices.

Pilot station: [88Nine Radio Milwaukee](https://radiomilwaukee.org). Built for the Amazon Developer Hackathon 2026 (Alexa+ track). **Site:** https://radio-commons.vercel.app · **Simulator:** https://radio-commons.vercel.app/simulator

## Status (October 4, 2026)

**Built and live**

| Area | What a listener can do | Since |
| --- | --- | --- |
| Stories | Find a This Bites, Uniquely Milwaukee or Ladies First episode by what they remember (even words said in it), hear the summary, play it, see its places on a map, get directions, ask a detail question answered in the episode's own words at the exact moment | Oct 2–3 |
| Events | "What's on near there tonight?" from Radio Milwaukee's event guide (the MKE Field Guide): map near a story's places, carousel by day or type, free shows, Add to calendar, restaurant Reserve links | Oct 3–4 |
| Picks | "What is Radio Milwaukee recommending?": staff picks plus the station's weekly MKE Concert Picks (imported automatically each week) | Oct 4 |
| Music | Milwaukee Music Premieres (30, with Play song, credits, release show) and Studio Milwaukee Sessions (24, set lists, link to the session) | Oct 4 |
| Simulator | The full Alexa+ experience in a browser: voice in and out, Echo Show cards light and dark, "What Alexa did" trail for judges | Oct 2–4 |
| Landing page | What it does, the smart-speaker case, how it works, how another station could use it | Oct 4 |

Behind it: [Backstory](https://github.com/tmoody1973/backstory), the station's story engine (transcripts, checked facts, editor review; 101 stories across five shows), and the [MKE Field Guide](https://mke-field-guide.vercel.app) (events, venues, staff picks, the review admin).

**Planned before the October 23 deadline**

| What | Status |
| --- | --- |
| **Weekly station briefing** — "What's new at Radio Milwaukee this week?" read from the station's newsletter, each item opening the real episode, song or picks | Spec written (`docs/superpowers/specs/2026-10-04-station-briefing-design.md`), awaiting approval |
| **"What's playing on 88Nine?" / "Tell me about this song"** — the station's playlist enriched with song and artist facts | Waits on the playlist enrichment tool (in progress) |
| Demo video and Devpost write-up | Next |

**Later:** a shared place directory for stories and events; more station shows (Cinebuds, HYFINated Conversations); onboarding a second station; applying to Amazon's Alexa+ for Builders preview to run on real Echo devices.

## How it works

```
Listener ──voice──▶ Alexa+ ──MCP, Streamable HTTP──▶ radio-commons (Next.js on Vercel)
                                                      ├─ /api/mcp          tools (mcp-handler)
                                                      ├─ story card        MCP App (ui://radio-commons/story-card.html)
                                                      ├─ /api/map          Amazon Location map pictures (key stays server-side)
                                                      └─ stations.ts       stationId "radiomilwaukee"
                                                      ▼
                                       Backstory (Convex): editor-published stories only
                                       MKE Field Guide: /api/public/events, /api/public/picks (read-only)
```

- **`find_station_story`** turns a listener's description into up to three published stories, read back as a short numbered list. It also finds a story by something said in it ("the episode where they talked about stromboli"), but only in episodes whose detailed answers are on. If nothing matches well enough, it says so; it never guesses.
- **`latest_station_stories`** reads the newest stories, optionally for one show ("What's new on This Bites?").
- **`find_events`** finds upcoming events from Radio Milwaukee's event guide (the [MKE Field Guide](https://mke-field-guide.vercel.app)): by words, tonight/this weekend, free only, or **near a place from a story on screen** (1 mile, widening once to 3). Near a story it shows a map with the place starred; otherwise a carousel. Every event has **Add to calendar**.
- **`station_picks`** reads this week's Radio Milwaukee staff picks in the curator's own words, topped up with station events.
- **`get_station_story`** tells one story: the station's published summary, its source ("From Uniquely Milwaukee, September 2026"), and one next step. With `view: "places"` it shows the story's places numbered on a map.
- **`ask_station_story`** answers a detail question about one story ("What did they say about the stromboli?") with the episode's own words: up to three short transcript passages, each with the moment it's heard ("At 10:45 …"), which the card can play from. Only published episodes an editor allows (This Bites by default; Uniquely Milwaukee only when switched on), and never a passage naming someone an editor removed or kept off Alexa.
- **On screens**, every tool returns one card in Amazon's [MCP Design Guide for Alexa+](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide-overview.html) patterns: a **story card** (artwork, title, ▶ Play episode, Places), a **quote card** (▶ Play from 10:45), a **carousel** (numbered, tap to pick) or a **map** (Amazon Location, numbered pins matching a list; "See all" opens a pan-and-zoom fullscreen map). Cards are authored at Amazon's 768×480 base and scale to the screen, in light and dark.
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

## Run it

Requirements: Node.js 20+ (Alexa's CLI needs 24+), npm.

```bash
npm ci                      # also embeds the MCP Apps bundle (postinstall)
cp .env.example .env.local  # set BACKSTORY_CONVEX_URL; for maps AMAZON_LOCATION_API_KEY (server) and
                            # AMAZON_LOCATION_BROWSER_KEY (tiles only); for the simulator DEEPGRAM_API_KEY,
                            # SIM_AWS_ACCESS_KEY_ID / SIM_AWS_SECRET_ACCESS_KEY (Bedrock Haiku + Polly only), SIM_PASSCODE.
                            # Optional: FIELD_GUIDE_URL (default the live Field Guide), PLAY_PREMIERE_AUDIO=off
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
- Decisions, in plain English: `docs/decisions/` (001 foundation · 002 simulator · 003 transcript answers · 004 Amazon's design guide · 005 events from the Field Guide · 006 music coverage)
- What we learned, slice by slice: `docs/LEARNING-LOG.md`
- Who else is doing this, and the smart-speaker numbers: `docs/research/2026-10-04-landscape.md`

## License

Apache-2.0
