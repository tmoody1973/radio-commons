import { describe, expect, it } from "vitest";
import { nextHistory, trailLabel } from "@/lib/sim/ui";

describe("simulator page helpers", () => {
  it("keeps the last 20 messages of the conversation", () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: "user" as const, text: `m${i}` }));
    const next = nextHistory(long, "heard", "reply");
    expect(next).toHaveLength(20);
    expect(next.slice(-2)).toEqual([{ role: "user", text: "heard" }, { role: "assistant", text: "reply" }]);
  });
  it("remembers the story on screen, as Alexa+ keeps tool results, so a follow-up has its id", () => {
    expect(nextHistory([], "frugal dining", "From This Bites…", { storyId: "jn79", title: "Frugal dining" }).at(-1))
      .toEqual({ role: "assistant", text: 'From This Bites… [On screen: "Frugal dining", storyId jn79]' });
  });
  it("keeps a title from breaking the on-screen note", () => {
    expect(nextHistory([], "q", "r", { storyId: "jn79", title: 'The "Best" [Bites]' }).at(-1)?.text).toBe('r [On screen: "The Best Bites", storyId jn79]');
  });
  it("skips an empty heard turn", () => {
    expect(nextHistory([], "", "Sorry, I didn't catch that.")).toEqual([]);
  });
  it("labels trail lines in plain words", () => {
    expect(trailLabel({ kind: "heard", text: "frugal dining", ms: 412 })).toBe("Heard “frugal dining” (412 ms)");
    expect(trailLabel({ kind: "tool", name: "find_station_story", input: { description: "frugal dining" }, ms: 118, isError: false, summary: "I found one" }))
      .toBe("Called find_station_story · 118 ms → I found one");
    expect(trailLabel({ kind: "tool", name: "get_station_story", input: {}, ms: 90, isError: true, summary: "I can't reach" })).toContain("⚠");
    expect(trailLabel({ kind: "reply", text: "From This Bites…", ms: 900, sourced: true })).toBe("Answered from Radio Milwaukee's record (900 ms)");
    expect(trailLabel({ kind: "reply", text: "Hello!", ms: 400, sourced: false })).toBe("Answered without looking anything up (400 ms)");
    expect(trailLabel({ kind: "error", text: "voice unavailable" })).toBe("Problem: voice unavailable");
  });
});
