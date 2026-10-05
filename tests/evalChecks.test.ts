import { describe, expect, it } from "vitest";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import type { TrailEntry } from "@/lib/sim/trail";
import {
  checkFollowThao, checkRecentSongs, checkSaveNumber3, checkSearchPlaylist, checkTrackStory, checkWhatsNew,
} from "@/lib/sim/evalChecks";

const tool = (name: string, input: Record<string, unknown> = {}, isError = false, summary = "ok"): TrailEntry =>
  ({ kind: "tool", name, input, isError, summary, ms: 5 });
const unlinked = (name: string, input: Record<string, unknown> = {}) => tool(name, input, true, LINK_ACCOUNT_SPEECH);
const shown = [{ playId: "p1" }, { playId: "p2" }, { playId: "p3" }];

describe("checkRecentSongs", () => {
  it("passes on recent_songs, fails on another tool or an error", () => {
    expect(checkRecentSongs([tool("recent_songs", { station: "88nine" })]).pass).toBe(true);
    expect(checkRecentSongs([tool("search_playlist")]).pass).toBe(false);
    expect(checkRecentSongs([tool("recent_songs", {}, true, "boom")]).pass).toBe(false);
  });
});

describe("checkSaveNumber3", () => {
  it("passes with number 3 or song 3's playId", () => {
    expect(checkSaveNumber3([tool("save_find", { number: 3 })], shown).pass).toBe(true);
    expect(checkSaveNumber3([tool("save_find", { playId: "p3" })], shown).pass).toBe(true);
  });
  it("fails on an invented id, the wrong song, or no call", () => {
    expect(checkSaveNumber3([tool("save_find", { playId: "made-up" })], shown).pass).toBe(false);
    expect(checkSaveNumber3([tool("save_find", { playId: "p2" })], shown).pass).toBe(false);
    expect(checkSaveNumber3([], shown).pass).toBe(false);
  });
  it("counts the account-linking refusal as a pass, other errors as a fail", () => {
    expect(checkSaveNumber3([unlinked("save_find", { number: 3 })], shown).pass).toBe(true);
    expect(checkSaveNumber3([tool("save_find", { number: 3 }, true, "boom")], shown).pass).toBe(false);
  });
  it("does not let an unrelated linking refusal excuse a failing save_find", () => {
    const trail = [tool("save_find", { number: 3 }, true, "boom"), unlinked("list_finds")];
    expect(checkSaveNumber3(trail, shown).pass).toBe(false);
  });
});

describe("checkSearchPlaylist", () => {
  it("needs search_playlist without error", () => {
    expect(checkSearchPlaylist([tool("search_playlist", { artist: "Nas" })]).pass).toBe(true);
    expect(checkSearchPlaylist([tool("search_playlist", {}, true, "boom")]).pass).toBe(false);
    expect(checkSearchPlaylist([]).pass).toBe(false);
  });
});

describe("checkTrackStory", () => {
  it("accepts get_track_story alone or after search_playlist", () => {
    expect(checkTrackStory([tool("get_track_story")]).pass).toBe(true);
    expect(checkTrackStory([tool("search_playlist"), tool("get_track_story")]).pass).toBe(true);
  });
  it("fails when the story was never fetched or a step errored", () => {
    expect(checkTrackStory([tool("search_playlist")]).pass).toBe(false);
    expect(checkTrackStory([tool("search_playlist"), tool("get_track_story", {}, true, "boom")]).pass).toBe(false);
  });
});

describe("checkFollowThao", () => {
  it("needs follow_artist naming Thao; linking refusal is fine", () => {
    expect(checkFollowThao([tool("follow_artist", { artist: "Thao & The Get Down Stay Down" })]).pass).toBe(true);
    expect(checkFollowThao([unlinked("follow_artist", { artist: "Thao" })]).pass).toBe(true);
    expect(checkFollowThao([tool("follow_artist", { artist: "Nas" })]).pass).toBe(false);
    expect(checkFollowThao([tool("list_finds")]).pass).toBe(false);
  });
});

describe("checkWhatsNew", () => {
  it("needs whats_new_for_me; linking refusal is fine", () => {
    expect(checkWhatsNew([tool("whats_new_for_me")]).pass).toBe(true);
    expect(checkWhatsNew([unlinked("whats_new_for_me")]).pass).toBe(true);
    expect(checkWhatsNew([tool("whats_new_for_me", {}, true, "boom")]).pass).toBe(false);
    expect(checkWhatsNew([]).pass).toBe(false);
  });
});
