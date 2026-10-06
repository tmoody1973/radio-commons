# 010 — ChatGPT gets its own address on the same server

**Decision:** ChatGPT connects to a second address, `/api/chatgpt/mcp`, that runs the same code and data as the Alexa+ address `/api/mcp` but with chat-specific replies, cards and sign-in.

**Why this came up:** A ten-minute test showed ChatGPT can already use our Alexa+ server as-is, cards and all. But chat needs things a speaker doesn't (cards that fit a chat window, a player that keeps playing while you talk, playlists), and it can't have things Alexa+ has (OpenAI's rules forbid starting memberships in a ChatGPT plugin). The Alexa+ submission is due October 23, so anything we change must not touch what Alexa+ gets.

**Options:**
1. **Change the one address for everyone.** Least work. Every chat change risks the Alexa+ submission.
2. **Detect ChatGPT on each request** (ChatGPT tags requests with `openai/*` hints). No new address. OpenAI calls these hints, not guarantees; they may be missing when ChatGPT asks for the tool list, and one wrong guess shows Alexa+ the chat version.
3. **A second address, same code.** One new route file, and a second address to document and test. Which door you came through can't be guessed wrong.
4. **A separate ChatGPT server.** Full freedom. Two copies of 24 tools that drift apart; every fix done twice.

**What we chose and why:** Option 3 (Tarik, on Claude's recommendation). Like a restaurant with two doors and one kitchen: the food is the same, the plating depends on the door.

**What we gave up:** A second address for sign-in to cover (it needs its own OAuth client in Clerk), and every tool now has two possible behaviours to test.

**How we'll know if this was right:** The Alexa+ snapshot tests stay unchanged through every ChatGPT slice, and no ChatGPT change ever needs a matching edit to Alexa+ code.

**What actually happened:**
