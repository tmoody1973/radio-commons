import { describe, expect, it } from "vitest";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import { cardAfterTurn, needsAccountLink, nextHistory, onScreenFrom, trailLabel } from "@/lib/sim/ui";

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
  it("remembers the numbered songs on screen with their playIds, so 'save number 2' has the id", () => {
    const shown = onScreenFrom({ songs: [
      { number: 1, playId: "p1", title: "Wicked Game", artist: "Chris Isaak" },
      { number: 2, playId: "p2", title: 'Groove "Thang"', artist: "Zhané" },
    ] });
    expect(nextHistory([], "last 2", "Here they are.", shown).at(-1)?.text)
      .toBe('Here they are. [On screen: 1. "Wicked Game" by Chris Isaak, playId p1; 2. "Groove Thang" by Zhané, playId p2]');
  });
  it("numbers on_air_now's stations that have a song, in order, with the station, so 'save number 2' and 'the HYFIN song' work", () => {
    const shown = onScreenFrom({ view: "on-air", stations: [
      { station: "88nine", song: { playId: "p88", title: "Lauren", artist: "Men I Trust" } },
      { station: "rhythmlab", song: null },
      { station: "hyfin", song: { playId: "phyfin", title: "Oya", artist: "Ibeyi" } },
    ] });
    expect(shown).toEqual({ songs: [{ playId: "p88", title: "Lauren", artist: "Men I Trust", station: "88nine" }, { playId: "phyfin", title: "Oya", artist: "Ibeyi", station: "hyfin" }] });
    expect(nextHistory([], "on now", "On air now.", shown).at(-1)?.text)
      .toBe('On air now. [On screen: 1. "Lauren" by Men I Trust on 88nine, playId p88; 2. "Oya" by Ibeyi on hyfin, playId phyfin]');
  });
  it("reads recall matches and story cards the same way, and ignores anything else", () => {
    expect(onScreenFrom({ matches: [{ playId: "p9", title: "Valerie", artist: "Amy Winehouse" }] }))
      .toEqual({ songs: [{ playId: "p9", title: "Valerie", artist: "Amy Winehouse" }] });
    expect(onScreenFrom({ story: { storyId: "jn79", title: "Frugal dining" } })).toEqual({ storyId: "jn79", title: "Frugal dining" });
    expect(onScreenFrom({ view: "events" })).toBeUndefined();
    expect(onScreenFrom(undefined)).toBeUndefined();
  });
  it("ignores story lists (matches with storyId, no playId/artist) and never throws on them", () => {
    const stories = { matches: [{ storyId: "s1", title: "Frugal dining", show: "This Bites" }] };
    expect(onScreenFrom(stories)).toBeUndefined();
    expect(nextHistory([], "latest stories", "Here they are.", onScreenFrom(stories)).at(-1)?.text).toBe("Here they are.");
  });
  it("keeps only the song items of a mixed list", () => {
    const mixed = { matches: [{ storyId: "s1", title: "Frugal dining", show: "This Bites" }, { playId: "p9", title: "Valerie", artist: "Amy Winehouse" }] };
    expect(onScreenFrom(mixed)).toEqual({ songs: [{ playId: "p9", title: "Valerie", artist: "Amy Winehouse" }] });
  });
  it("never throws on a malformed song item", () => {
    expect(() => nextHistory([], "q", "r", { songs: [{ playId: "p1", title: "T" } as never] })).not.toThrow();
  });
  it("never sends a history message the server would reject, trimming the reply before the ids", () => {
    const songs = Array.from({ length: 10 }, (_, i) => ({ playId: `p${i}`, title: `Song ${i}`, artist: `Artist ${i}` }));
    const text = nextHistory([], "q", "x".repeat(3000), { songs }).at(-1)!.text;
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain("playId p9]");
  });
  it("keeps a title from breaking the on-screen note", () => {
    expect(nextHistory([], "q", "r", { storyId: "jn79", title: 'The "Best" [Bites]' }).at(-1)?.text).toBe('r [On screen: "The Best Bites", storyId jn79]');
  });
  it("clears the screen when a search found nothing, keeps it for a turn that called no tool", () => {
    const tool = { kind: "tool" as const, name: "find_station_story", input: {}, ms: 1, isError: false, summary: "I couldn't find" };
    expect(cardAfterTurn("old", null, [tool])).toBeNull();
    expect(cardAfterTurn("old", null, [])).toBe("old");
    expect(cardAfterTurn("old", "new", [tool])).toBe("new");
  });
  it("offers the Link button when a Finds tool asked the listener to link their account", () => {
    const refused = { kind: "tool" as const, name: "save_find", input: {}, ms: 3, isError: true, summary: LINK_ACCOUNT_SPEECH };
    expect(needsAccountLink([refused])).toBe(true);
    expect(needsAccountLink([{ ...refused, isError: false, summary: "Saved." }])).toBe(false);
    expect(needsAccountLink([{ kind: "error", text: "boom" }])).toBe(false);
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
