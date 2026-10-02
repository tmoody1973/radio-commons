# 002: Demo Radio Commons in a self-built Alexa+ simulator

**Decision:** Build a web-based Alexa+ simulator, an Echo-Show-styled page where Claude on Amazon Bedrock plays Alexa+ and calls the real Radio Commons MCP server, and use it for the hackathon demo.

**Why this came up:** Our Alexa+ setup stopped at Amazon's access step. Amazon then answered the question on the hackathon forum: "Access to the Alexa+ developer tools will not be granted to hackathon participants … The tools are in preview with select partners only." Without a simulator, the MCP server would have no way to be seen working in the demo video the rules require.

**Options:**
- Ask Amazon for an exception. Low odds after two explicit "no" answers, and nothing to show meanwhile.
- A chat-style assistant using the same tools. Quick, but it doesn't look or behave like Alexa+.
- An Echo Show simulator with voice, the real story card, and a visible "What Alexa did" trail (chosen).
- For the brain: the Anthropic API's built-in MCP connector (least code, hides the tool calls) or Amazon Nova Sonic voice-to-voice (most Alexa-like, riskiest in three weeks).

**What we chose and why:** The Echo Show simulator, with Claude Haiku 4.5 on Bedrock connected through the official MCP client, Deepgram in and Amazon Polly out (Tarik chose each, 2026-10-02; Claude proposed). It calls our server exactly the way an Alexa+ add-on is called, renders our MCP App as a real host would, keeps the Amazon story (Bedrock, Polly), and the trail shows judges that every answer came from the station's record.

**What we gave up:** It is a simulation, not Alexa+: push-to-talk instead of a wake word, a web page instead of a device, and about 4 seconds per spoken answer instead of Alexa's near-instant replies. It also adds three paid services (Bedrock, Polly, Deepgram), behind a passcode.

**How we'll know if this was right:** The demo video shows a spoken question answered from Radio Milwaukee's record with its card, and judges comment on the experience rather than on it being simulated.

**What actually happened:**
