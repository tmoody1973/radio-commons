import { describe, expect, it } from "vitest";
import { runBrain, SYSTEM_PROMPT, type Converse } from "@/lib/sim/brain";

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
      callTool: async () => ({ text: "At 18:42 …", structured: { story: { storyId: "s1" }, passages: [] }, isError: false }),
      converse: scripted(toolUse("ask_station_story", { storyId: "s1", question: "stromboli" }), say("At 18:42, …")),
    });
    expect(result.lastStory).toMatchObject({ story: { storyId: "s1" } });
  });
});
