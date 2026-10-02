# Radio Commons

**A listener memory for public radio, on Alexa+.** Radio is immediate and fleeting: you hear a local story on the drive home and lose it. Radio Commons lets a listener ask Alexa+ for the station story they half-remember ("What was that Uniquely Milwaukee story about the art shop in West Allis?") and get it back, told from the station's own published record, with its source, and shown as a card on screen devices.

Pilot station: [Radio Milwaukee](https://radiomilwaukee.org). Built for the Amazon Developer Hackathon 2026 (Alexa+ track).

## How it works

```
Listener ──voice──▶ Alexa+ ──MCP, Streamable HTTP──▶ radio-commons (Next.js on Vercel)
                                                      ├─ /api/mcp          tools (mcp-handler)
                                                      ├─ story card        MCP App (ui://radio-commons/story-card.html)
                                                      └─ stations.ts       stationId "radiomilwaukee"
                                                      ▼
                                       Backstory (Convex): editor-published stories only
```

- **`find_station_story`** turns a listener's description into up to three published stories, read back as a short list. If nothing matches well enough, it says so; it never guesses.
- **`get_station_story`** tells one story: the station's published summary, its source ("From Uniquely Milwaukee, September 2026"), and one next step (directions to the place in the story, or the episode). On screens it returns a story card with the show's artwork, places, things to do and a Play button.
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
cp .env.example .env.local  # set BACKSTORY_CONVEX_URL; for the simulator also DEEPGRAM_API_KEY,
                            # SIM_AWS_ACCESS_KEY_ID / SIM_AWS_SECRET_ACCESS_KEY (Bedrock Haiku + Polly only), SIM_PASSCODE
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

Vercel: set `BACKSTORY_CONVEX_URL` for Production and Preview, then `vercel deploy --prod`. Alexa+ round trips must stay under 500 ms; see `docs/LEARNING-LOG.md` for measurements.

## Connect to Alexa+

Follow Amazon's [Alexa+ MCP quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html): install the Alexa AI CLI (`@alexa-ai/cli`, from Amazon's private registry after your AWS account is allowlisted), run `alexa-ai configure`, then

```bash
alexa-ai new mcp --name "Radio Milwaukee Stories" --locale en-US --mcp-server-url "https://radio-commons.vercel.app/api/mcp"
alexa-ai deploy
```

and test in the Alexa+ web simulator.

## Docs

- Design: `docs/superpowers/specs/2026-10-02-story-tools-design.md`
- Plan: `docs/superpowers/plans/2026-10-02-story-tools.md`
- Decisions: `docs/decisions/`
- Concept: Radio Commons concept brief (public media listener memory)

## License

Apache-2.0
