import { describe, expect, it } from "vitest";
import { runBrain, spokenReply, systemPrompt, type Converse } from "@/lib/sim/brain";

const SUNDAY_NIGHT = new Date("2026-10-05T02:15:00Z"); // Sunday 2026-10-04 21:15 CDT
const SYSTEM_PROMPT = systemPrompt(SUNDAY_NIGHT);

const TOOLS = [
  { name: "find_station_story", description: "find", inputSchema: { type: "object" } },
  { name: "get_station_story", description: "get", inputSchema: { type: "object" } },
];
type Reply = Awaited<ReturnType<Converse>>;
const toolUse = (name: string, input: Record<string, unknown>, id = name): Reply => ({ stopReason: "tool_use", content: [{ toolUse: { toolUseId: id, name, input } }] });
const say = (text: string): Reply => ({ stopReason: "end_turn", content: [{ text }] });
/** A scripted model: returns the next response each time it's called, then repeats the last. */
const scripted = (...responses: Reply[]): Converse => {
  let i = 0;
  return async () => responses[Math.min(i++, responses.length - 1)];
};

describe("brain", () => {
  it("finds, then tells, then answers; the trail records each tool call and the card data", async () => {
    const calls: string[] = [];
    const result = await runBrain({
      history: [{ role: "user", text: "the frugal dining episode" }],
      tools: TOOLS,
      callTool: async (name) => {
        calls.push(name);
        return name === "find_station_story"
          ? { text: "I found one Radio Milwaukee story: Frugal dining", structured: { matches: [{ storyId: "s1" }] }, isError: false }
          : { text: "From This Bites, September 2026: frugal dining.", structured: { story: { storyId: "s1" }, cardHtml: "<article>" }, isError: false };
      },
      converse: scripted(toolUse("find_station_story", { description: "frugal dining" }), toolUse("get_station_story", { storyId: "s1" }), say("From This Bites, September 2026: frugal dining.")),
    });
    expect(calls).toEqual(["find_station_story", "get_station_story"]);
    expect(result.reply).toBe("From This Bites, September 2026: frugal dining.");
    expect(result.trail.filter((e) => e.kind === "tool").map((e) => (e.kind === "tool" ? e.name : ""))).toEqual(["find_station_story", "get_station_story"]);
    expect(result.lastStory).toMatchObject({ story: { storyId: "s1" } });
  });

  it("stops after four tool calls", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "loop" }], tools: TOOLS,
      callTool: async () => ({ text: "none", structured: null, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "x" })),
    });
    expect(result.trail.filter((e) => e.kind === "tool")).toHaveLength(4);
    expect(result.reply).toBe("Sorry, something went wrong. Please try again.");
  });

  it("a no-match stays a no-match: the trust rules are in the system prompt", async () => {
    expect(SYSTEM_PROMPT).toMatch(/only from the results of your tools/i);
    expect(SYSTEM_PROMPT).toMatch(/never answer .* from your own knowledge/i);
    expect(SYSTEM_PROMPT).toMatch(/at most two sentences/i);
    expect(SYSTEM_PROMPT).toMatch(/never list more than two places/i);
    const result = await runBrain({
      history: [{ role: "user", text: "moon base" }], tools: TOOLS,
      callTool: async () => ({ text: "I couldn't find a Radio Milwaukee story about that.", structured: { matches: [] }, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "moon base" }), say("I couldn't find a Radio Milwaukee story about that.")),
    });
    expect(result.reply).toBe("I couldn't find a Radio Milwaukee story about that.");
    expect(result.lastStory).toBeNull();
  });

  it("gives up with an apology after the deadline", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "slow" }], tools: TOOLS, deadlineMs: 20,
      callTool: async () => ({ text: "x", structured: null, isError: false }),
      converse: async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return say("late");
      },
    });
    expect(result.reply).toBe("Sorry, something went wrong. Please try again.");
    expect(result.trail.at(-1)).toMatchObject({ kind: "error" });
  });
  it("times every model pass in the trail", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "q" }], tools: TOOLS,
      callTool: async () => ({ text: "x", structured: null, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "q" }), say("done")),
    });
    expect(result.trail.filter((e) => e.kind === "think")).toHaveLength(2);
  });
  it("the trail shows a tool's spoken line, not the data meant for the model", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "q" }], tools: TOOLS,
      callTool: async () => ({ text: 'I found one Radio Milwaukee story: T1.\n{"matches":[{"storyId":"s1"}]}', structured: null, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "q" }), say("done")),
    });
    const tool = result.trail.find((e) => e.kind === "tool");
    expect(tool && tool.kind === "tool" && tool.summary).toBe("I found one Radio Milwaukee story: T1.");
  });
  it("marks whether a reply came from a tool, so the trail never claims a source it didn't use", async () => {
    const unsourced = await runBrain({ history: [{ role: "user", text: "hi" }], tools: TOOLS, callTool: async () => ({ text: "x", structured: null, isError: false }), converse: scripted(say("Hello!")) });
    expect(unsourced.trail.find((e) => e.kind === "reply")).toMatchObject({ sourced: false });
    const sourced = await runBrain({
      history: [{ role: "user", text: "q" }], tools: TOOLS,
      callTool: async () => ({ text: "found", structured: null, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "q" }), say("From This Bites…")),
    });
    expect(sourced.trail.find((e) => e.kind === "reply")).toMatchObject({ sourced: true });
  });
  it("tells Alexa to quote ask_station_story word for word, and its result becomes the card", async () => {
    expect(SYSTEM_PROMPT).toContain("ask_station_story");
    expect(SYSTEM_PROMPT).toContain("word for word");
    // The page keeps only the words of earlier turns, not story ids: a follow-up must look the story up again.
    expect(SYSTEM_PROMPT).toMatch(/never guess a storyId/i);
    const result = await runBrain({
      history: [{ role: "user", text: "what did they say about the stromboli" }], tools: TOOLS,
      callTool: async () => ({ text: "At 18:42 …", structured: { view: "quote", cardHtml: "<article>", story: { storyId: "s1" }, passages: [] }, isError: false }),
      converse: scripted(toolUse("ask_station_story", { storyId: "s1", question: "stromboli" }), say("At 18:42, …")),
    });
    expect(result.lastStory).toMatchObject({ story: { storyId: "s1" } });
  });
  it("lets a quote run past the two-sentence rule, and never speaks the on-screen note", async () => {
    expect(SYSTEM_PROMPT).toMatch(/quote .* even if it is longer/i);
    const result = await runBrain({
      history: [{ role: "user", text: "q" }], tools: TOOLS, callTool: async () => ({ text: "x", structured: null, isError: false }),
      converse: scripted(say('From This Bites. [On screen: "Frugal dining", storyId jn79] Want directions?')),
    });
    expect(result.reply).toBe("From This Bites. Want directions?");
  });
  it("after on_air_now, saves by station or number and asks which station instead of guessing", () => {
    expect(SYSTEM_PROMPT).toMatch(/save the HYFIN song" call save_find with that station/);
    expect(SYSTEM_PROMPT).toMatch(/never guess one/);
  });
  it("knows an Echo Dot has no screen and never sends the listener to one", () => {
    const dot = systemPrompt(SUNDAY_NIGHT, "dot");
    expect(dot).toMatch(/Echo Dot, a smart speaker with no screen/);
    // The "[On screen: …]" history note is a label for the model, not advice to the listener.
    expect(dot.replace(/"\[On screen:[^\]]*\]"/g, "")).not.toMatch(/\btap\b|on (the )?screen|the card|Echo Show/i);
    expect(SYSTEM_PROMPT).toMatch(/on an Echo Show/);
  });
  it("continues a list with the next page when the listener asks for more", () => {
    expect(SYSTEM_PROMPT).toMatch(/same tool again with the same arguments and the next page/);
  });
  it("searches first for any local place, person, business or event, even when it isn't asked as a story", () => {
    expect(SYSTEM_PROMPT).toMatch(/any question about a Milwaukee place, person, business or event/i);
  });
  it("knows the new tools and points the listener at the screen for playing and directions", () => {
    expect(SYSTEM_PROMPT).toContain("latest_station_stories");
    expect(SYSTEM_PROMPT).toMatch(/view "places"/);
    expect(SYSTEM_PROMPT).toMatch(/tap ▶ on the screen/i);
    expect(SYSTEM_PROMPT).toMatch(/tap Directions/i);
  });

  it("any tool result that carries a card becomes the card, even a list of matches", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "what's new" }], tools: TOOLS,
      callTool: async () => ({ text: "The newest…", structured: { view: "stories", cardHtml: "<article>", matches: [] }, isError: false }),
      converse: scripted(toolUse("latest_station_stories", {}), say("The newest…")),
    });
    expect(result.lastStory).toMatchObject({ view: "stories" });
  });
  it("keeps a list in the tool's order and never invents which story is newer", () => {
    expect(SYSTEM_PROMPT).toMatch(/keep the tool's order and numbers/i);
    expect(SYSTEM_PROMPT).toMatch(/never call one newer or older/i);
  });
  it("routes giving and asks before cancelling a membership", () => {
    expect(SYSTEM_PROMPT).toContain("support_radio_milwaukee");
    expect(SYSTEM_PROMPT).toMatch(/cancel_membership without confirmed/);
    expect(SYSTEM_PROMPT).toMatch(/only after the listener says yes/i);
  });
  it("knows the event tools and points to the screen for the calendar", () => {
    expect(SYSTEM_PROMPT).toContain("find_events");
    expect(SYSTEM_PROMPT).toMatch(/nearStoryId/);
    expect(SYSTEM_PROMPT).toContain("station_picks");
    expect(SYSTEM_PROMPT).toMatch(/tap Add to calendar/i);
  });

  it("sends 'what's new this week' to the newsletter briefing and goes deeper only through the linked story or picks", () => {
    expect(SYSTEM_PROMPT).toMatch(/what's new at Radio Milwaukee[^.]*station_briefing/i);
    expect(SYSTEM_PROMPT).toMatch(/never add to the newsletter's own sentences/i);
    expect(SYSTEM_PROMPT).not.toMatch(/what's new from Radio Milwaukee[^.]*latest_station_stories/i);
    expect(SYSTEM_PROMPT).toMatch(/Read item[^.]*radiomilwaukee\.org/i);
  });
  it("music: premieres play with Play song, sessions are watched on the station's page, lyrics are never quoted", () => {
    expect(SYSTEM_PROMPT).toMatch(/tap Play song/);
    expect(SYSTEM_PROMPT).toMatch(/Watch on radiomilwaukee\.org/);
    expect(SYSTEM_PROMPT).toMatch(/never (sing|quote).*lyrics/i);
  });
  it("a request to play or hear something is a request to find it first (live: 'Play the new Glitzy song' called no tool)", () => {
    expect(SYSTEM_PROMPT).toMatch(/asks to play or hear[^.]*call find_station_story/i);
    expect(SYSTEM_PROMPT).toMatch(/never answer a play request without/i);
  });
  it("points to Reserve for booking", () => {
    expect(SYSTEM_PROMPT).toMatch(/tap Reserve/);
  });
});

describe("spokenReply", () => {
  it("drops screen notes and markdown so captions and speech are plain words", () => {
    expect(spokenReply("Glitzy's \"Effort\" from *Say Sorry / You're Right* and **more**. [On screen: card, storyId abc]")).toBe("Glitzy's \"Effort\" from Say Sorry / You're Right and more.");
  });

  it("tells the model the Milwaukee date and time, and how to route what's new and events", () => {
    expect(SYSTEM_PROMPT.startsWith("Right now in Milwaukee it is Sunday, October 4, 2026, 9:15 p.m. (America/Chicago).")).toBe(true);
    expect(SYSTEM_PROMPT).toMatch(/"what's new for me"[^.]*call whats_new_for_me/i);
    expect(SYSTEM_PROMPT).toMatch(/"any new episodes of \[show\]"[^.]*call latest_station_stories/i);
    expect(SYSTEM_PROMPT).toMatch(/tonight \/ today \/ tomorrow \/ this weekend \/ this week[^.]*call find_events with that when/);
    expect(SYSTEM_PROMPT).toMatch(/never ask the listener for today's date/i);
  });

  it("asks the model with the prompt for the injected clock", async () => {
    let system = "";
    await runBrain({ history: [{ role: "user", text: "hi" }], tools: TOOLS, callTool: async () => ({ text: "", structured: null, isError: false }), now: () => SUNDAY_NIGHT, converse: async (request) => { system = request.system; return { stopReason: "end_turn", content: [{ text: "Hi." }] }; } });
    expect(system).toBe(SYSTEM_PROMPT);
  });
});
