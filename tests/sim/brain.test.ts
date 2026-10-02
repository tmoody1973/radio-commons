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
});
