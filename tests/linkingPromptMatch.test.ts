import { describe, expect, it } from "vitest";
import { LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH, LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import { summarize } from "@/lib/sim/trail";
import { isLinkingPrompt, needsAccountLink } from "@/lib/sim/ui";
import type { TrailEntry } from "@/lib/sim/trail";

const refused = (text: string): TrailEntry => ({ kind: "tool", name: "save_find", input: {}, ms: 5, isError: true, summary: summarize(text) });

describe("linking prompt matching survives the trail's 120-character cut", () => {
  it("the prompts are longer than the trail keeps (the bug this guards)", () => {
    expect(LINK_ACCOUNT_SPEECH.length).toBeGreaterThan(120);
  });
  it("recognizes both prompts after summarizing", () => {
    expect(isLinkingPrompt(summarize(LINK_ACCOUNT_SPEECH))).toBe(true);
    expect(isLinkingPrompt(summarize(LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH), LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH)).toBe(true);
  });
  it("offers the link button for either prompt, not for other errors", () => {
    expect(needsAccountLink([refused(LINK_ACCOUNT_SPEECH)])).toBe(true);
    expect(needsAccountLink([refused(LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH)])).toBe(true);
    expect(needsAccountLink([refused("I can't reach Radio Milwaukee's playlist right now.")])).toBe(false);
  });
});
