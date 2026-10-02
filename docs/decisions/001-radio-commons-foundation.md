# 001: Radio Commons starts as a real server with one feature, on Vercel, answering by voice and card

**Decision:** Build the Radio Commons Alexa+ server as the foundation for the whole concept (station config, MCP endpoint, deploy, CI), with story lookup as its first working feature. Host it on Vercel as one Next.js app using Vercel's `mcp-handler`, and answer by voice plus an MCP App story card.

**Why this came up:** Backstory already holds editor-approved story data, but nothing lets a listener reach it. The hackathon judges call "a basic MCP wrapper around an existing API" obvious and reward multi-step workflows, state across sessions and visual cards, and Alexa+ requires every response in under 500 ms. A wrong first shape would either look like a toy or need rebuilding before the playlist, events and listener-account features could join.

**Options:**
- Story tools only, as a small standalone server. Fastest to a first Alexa call; judged alone it reads as the obvious wrapper.
- Foundation for Radio Commons with story tools first (chosen). A little more setup now; later features plug into the same server.
- Plan the whole demo (playlist to Spotify, saved stories, events) in one go. Most complete; slowest to anything working.
- Hosting alternatives: AWS Lambda or Bedrock AgentCore (Amazon-native, more setup, cold-start risk), a Hetzner server (fastest, but a new production service to run), or inside Convex (closest to the data, but against the concept's rule that the database stays behind a gateway).

**What we chose and why:** Foundation first, on Vercel, voice plus card (Tarik chose each, 2026-10-02; Claude proposed). Vercel is where the station's other apps already deploy, `mcp-handler` 2.x speaks the protocol Alexa+ uses (2025-11-25) through the official MCP library, and the official MCP Apps package builds on the same library.

**What we gave up:** Cold starts. A freshly started Vercel instance took 750–1,000 ms on its first calls (measured 2026-10-02), over Alexa's 500 ms budget, while warm calls took 105–180 ms. Listener accounts and saved stories wait for the next slice, so this slice can't yet show "state across sessions".

**How we'll know if this was right:** In the Alexa+ simulator, the success question returns the right story with its source within 500 ms on 19 of 20 tries, and the playlist and events tools land in this server without restructuring it.

**What actually happened:**
