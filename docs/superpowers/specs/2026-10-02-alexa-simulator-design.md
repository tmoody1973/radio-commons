# Radio Commons, slice 2: the Alexa+ simulator — design

**Date:** 2026-10-02 · **Status:** awaiting Tarik's review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Why this exists

Amazon will not give hackathon participants the Alexa+ developer tools or simulator. Emerson Sklar (Amazon), on the hackathon forum: "Access to the Alexa+ developer tools will not be granted to hackathon participants … The tools are in preview with select partners only", and self-built simulators are acceptable for demonstrations (https://amazonappdev2026.devpost.com/forum_topics/45262). The rules allow "Build Option 2": "simulate the Alexa+ experience in a web app using their own agentic tools", exempt from the runtime-technology requirement, but the demo video must still show the project functioning.

So slice 2 builds an Alexa+ simulator that plays the part of Alexa+ around the real Radio Commons MCP server from slice 1, unchanged.

**Success looks like:** on a laptop, holding the talk button on an Echo-Show-styled page and asking *"What was that This Bites episode about frugal dining?"* plays a spoken answer that names the show and month, shows the real story card (artwork, places, Play), and the "What Alexa did" panel lists the words heard, each MCP tool call with its time, and the source. "Play it" plays the episode; "directions" opens a map for a pinned place. The spoken answer arrives within ~5 s of releasing the button.

## What Tarik decided (2026-10-02)

| Question | Decision |
|---|---|
| Demo path | Build an Alexa+ simulator (Amazon access unavailable) |
| Look | Echo Show on screen, with a "What Alexa did" panel |
| Brain | Claude on Amazon Bedrock + the official MCP client, connecting to our server like Alexa+ |
| Voice | Deepgram Nova-3 in, Amazon Polly out (both through our server) |
| Scope | Story flow, done well; events, playlist and listener sign-in are later slices |
| Where | Inside `radio-commons` at `/simulator` (approach A) |

## Architecture

```
Browser (/simulator, Echo Show frame)
  hold-to-talk → audio clip ─┐                         ┌─ spoken reply (Polly MP3) + captions
  typed question (backup) ───┤                         ├─ story card (MCP App in sandboxed iframe, app-bridge host)
  conversation so far ───────┤                         └─ "What Alexa did" trail
                             ▼                         │
                 POST /api/sim/turn (Next.js route, server-only keys)
                   1. Deepgram Nova-3 → text (Milwaukee name hints)
                   2. Bedrock Claude Haiku 4.5 (Converse + tool use), Alexa-style system prompt
                   3. tool loop: MCP client (@modelcontextprotocol/client, Streamable HTTP)
                        → https://radio-commons.vercel.app/api/mcp  (find_station_story, get_station_story)
                   4. Amazon Polly (generative voice) → MP3
                   5. returns { heard, reply, audio, card?, trail[] }
```

### Units

| Unit | Job |
|---|---|
| `src/app/simulator/page.tsx` + components | Echo Show frame, talk button, captions, card frame, trail panel, typed backup |
| `src/app/api/sim/turn/route.ts` | One spoken turn, server-side |
| `src/lib/sim/stt.ts` | Deepgram pre-recorded transcription with keyterms |
| `src/lib/sim/brain.ts` | Bedrock Converse tool loop (max 4 tool calls, 15 s cap), Alexa system prompt |
| `src/lib/sim/mcpClient.ts` | Connects to our MCP endpoint, lists tools, calls them, reads the card resource |
| `src/lib/sim/tts.ts` | Polly synthesis |
| `src/lib/sim/trail.ts` | Builds the "What Alexa did" entries (pure) |
| Card host (client) | Loads `ui://radio-commons/story-card.html` into a sandboxed iframe and passes the tool result with `@modelcontextprotocol/ext-apps/app-bridge` |

## A turn, step by step

1. Hold the talk button; the browser records (MediaRecorder, webm/opus). Release sends the clip and the conversation so far (the server keeps no state between turns; the page carries it, as Alexa+ carries its own context).
2. Deepgram Nova-3 transcribes with the station's name hints (hosts, show names, known corrections), e.g. "Ann Christenson", "Uniquely Milwaukee".
3. Claude Haiku 4.5 on Bedrock gets the text, the Alexa-style system prompt, and the two tools as fetched from our MCP server. Each tool call it requests is made through the MCP client; results go back to it. At most 4 tool calls; 15 s overall cap.
4. The final text reply is synthesized by Polly.
5. The response carries: what was heard, the reply text (captions), audio, the latest `get_station_story` result (for the card), and the trail.
6. Follow-ups: "the second one" (picks from the shortlist), "play it" (plays the episode in the card), "directions" (opens Google/Apple Maps for the place's coordinates; the card or reply offers it only when a place has a pin).

**System prompt rules (the trust rules, carried from slice 1):** answer only from tool results; always say the show and month; describe summaries as Radio Milwaukee's; if a tool finds nothing or apologizes, say so and stop; never answer local-story questions from your own knowledge; keep replies short and spoken.

## Errors

| Situation | Listener hears / sees | Trail shows |
|---|---|---|
| Silence or Deepgram error | "Sorry, I didn't catch that." | the error |
| MCP server / Backstory down | the tool's apology text | the tool call and its error flag |
| Bedrock error or 15 s cap | "Sorry, something went wrong. Please try again." | the cause |
| Polly error | reply as captions, "voice unavailable" | the cause |
| More than 4 tool calls | loop stops; best answer so far or the generic apology | the cap |

## Speed

Targets for a spoken turn (release → audio starts): ~3–5 s. Budget: speech-to-text 0.3–0.6 s, two Haiku passes 1.5–3 s, our tools ~0.2 s, Polly ~0.5 s. The page warms our MCP server on load. Measured numbers go in `docs/LEARNING-LOG.md`.

## Testing

- **Unit:** tool loop (requests a tool → MCP call → result fed back → final answer; cap at 4; time cap), trail building, error mapping, Deepgram/Polly request shapes (fetch/SDK injected).
- **Contract:** the simulator's MCP client against our `/api/mcp` handler in-process (no network).
- **Live check:** a short recorded clip against the deployed `/api/sim/turn`.
- **Browser check (ego-browser):** screen states, card renders in its iframe from the real MCP resource, Play works, trail panel opens.

## Security and cost

- Keys stay server-side: `DEEPGRAM_API_KEY`, and a new AWS access key limited to `bedrock:InvokeModel` on the Haiku model and `polly:SynthesizeSpeech` (Tarik creates it; set in Vercel env, never in the repo).
- The public simulator page could be used by anyone to spend Bedrock/Polly/Deepgram credit. Mitigation in this slice: a shared demo passcode (env `SIM_PASSCODE`) required by `/api/sim/turn`, and a per-turn cap (clip ≤ 15 s, text ≤ 300 chars). Cost per turn at list prices is about a cent or less.

## Out of scope

Events (Field Guide), 88Nine playlist and Spotify, listener sign-in and saved stories, a wake word (push-to-talk only), streaming partial transcripts, interrupting Alexa while it talks.

## Open questions

1. Polly voice: which generative en-US voice sounds closest to Alexa without imitating it (pick in planning by listening).
2. Whether the card's Play should also stop Polly's voice (likely yes).
