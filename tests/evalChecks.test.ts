import { describe, expect, it } from "vitest";
import { LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH, LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import { GIVE_UNAVAILABLE_SPEECH } from "@/lib/give";
import type { TrailEntry } from "@/lib/sim/trail";
import {
  checkCancelNeedsLink, checkFollowThao, checkOnAirNow, checkSupport, checkRecentSongs, checkAsksWhichStation, checkRecentSongsPage, checkSaveNumber, screenWords, checkSaveStation, checkSearchPlaylist, checkStationArtistShows, checkStationSchedule, checkTrackStory, checkWhatCanYouDo, checkWhatsNew,
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

describe("checkOnAirNow", () => {
  it("all stations: on_air_now with no station", () => {
    expect(checkOnAirNow()([tool("on_air_now")]).pass).toBe(true);
    expect(checkOnAirNow()([tool("on_air_now", { station: "hyfin" })]).pass).toBe(false);
    expect(checkOnAirNow()([tool("recent_songs", { station: "88nine" })]).pass).toBe(false);
  });
  it("one station: on_air_now for that station, without an error", () => {
    expect(checkOnAirNow("hyfin")([tool("on_air_now", { station: "hyfin" })]).pass).toBe(true);
    expect(checkOnAirNow("hyfin")([tool("on_air_now")]).pass).toBe(false);
    expect(checkOnAirNow("hyfin")([tool("on_air_now", { station: "hyfin" }, true, "boom")]).pass).toBe(false);
  });
});

const checkSaveNumber3 = checkSaveNumber(3);

describe("checkSaveNumber(3)", () => {
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

describe("saving after on_air_now", () => {
  const onAir = [{ playId: "p88", station: "88nine" }, { playId: "phyfin", station: "hyfin" }];
  it("'save number 2': the number or the second station's playId", () => {
    expect(checkSaveNumber(2)([tool("save_find", { number: 2 })], onAir).pass).toBe(true);
    expect(checkSaveNumber(2)([tool("save_find", { playId: "phyfin" })], onAir).pass).toBe(true);
    expect(checkSaveNumber(2)([tool("save_find", { playId: "p88" })], onAir).pass).toBe(false);
  });
  it("'save the HYFIN song': the station, or HYFIN's shown playId", () => {
    expect(checkSaveStation("hyfin")([tool("save_find", { station: "hyfin" })], onAir).pass).toBe(true);
    expect(checkSaveStation("hyfin")([tool("save_find", { playId: "phyfin" })], onAir).pass).toBe(true);
    expect(checkSaveStation("hyfin")([unlinked("save_find", { station: "hyfin" })], onAir).pass).toBe(true);
    expect(checkSaveStation("hyfin")([tool("save_find", { station: "88nine" })], onAir).pass).toBe(false);
    expect(checkSaveStation("hyfin")([], onAir).pass).toBe(false);
  });
  it("'save that song': asks which, never saves a guessed song", () => {
    const reply = (text: string): TrailEntry => ({ kind: "reply", text, ms: 1, sourced: true });
    expect(checkAsksWhichStation([tool("save_find", {}, false, "Which station's song: …?"), reply("Which station's song: HYFIN's \"Oya\" or 88Nine's \"Lauren\"?")]).pass).toBe(true);
    expect(checkAsksWhichStation([reply("Which station do you mean?")]).pass).toBe(true);
    expect(checkAsksWhichStation([unlinked("save_find", {}), reply("Link your account.")]).pass).toBe(true);
    expect(checkAsksWhichStation([tool("save_find", { station: "hyfin" }), reply("Saved.")]).pass).toBe(false);
    expect(checkAsksWhichStation([reply("Saved it.")]).pass).toBe(false);
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

describe("checkStationSchedule", () => {
  it("passes on station_schedule without an error, naming the show or host when asked", () => {
    expect(checkStationSchedule()([tool("station_schedule", { station: "88nine" })]).pass).toBe(true);
    expect(checkStationSchedule()([tool("station_schedule")]).pass).toBe(true);
    expect(checkStationSchedule()([tool("on_air_now", { station: "88nine" })]).pass).toBe(false);
    expect(checkStationSchedule()([tool("station_schedule", {}, true, "boom")]).pass).toBe(false);
    expect(checkStationSchedule(/rhythm lab/i)([tool("station_schedule", { query: "Rhythm Lab" })]).pass).toBe(true);
    expect(checkStationSchedule(/rhythm lab/i)([tool("station_schedule", { query: "erin wolf" })]).pass).toBe(false);
    expect(checkStationSchedule(/rhythm lab/i)([tool("station_schedule")]).pass).toBe(false);
  });
});

describe("checkStationArtistShows", () => {
  it("needs station_artist_shows for 88Nine, never the listener's follows digest", () => {
    expect(checkStationArtistShows([tool("station_artist_shows", { station: "88nine" })]).pass).toBe(true);
    expect(checkStationArtistShows([tool("station_artist_shows", {})]).pass).toBe(false);
    expect(checkStationArtistShows([tool("station_artist_shows", { station: "88nine" }), tool("whats_new_for_me")]).pass).toBe(false);
    expect(checkStationArtistShows([tool("station_artist_shows", { station: "88nine" }, true, "boom")]).pass).toBe(false);
    expect(checkStationArtistShows([tool("whats_new_for_me")]).pass).toBe(false);
  });
});

describe("checkWhatCanYouDo", () => {
  it("needs what_can_you_do without an error", () => {
    expect(checkWhatCanYouDo([tool("what_can_you_do")]).pass).toBe(true);
    expect(checkWhatCanYouDo([tool("latest_station_stories")]).pass).toBe(false);
    expect(checkWhatCanYouDo([tool("what_can_you_do", {}, true, "boom")]).pass).toBe(false);
  });
});

describe("checkSupport", () => {
  it("passes on support_radio_milwaukee that put the give card on screen, and says so", () => {
    const shown = checkSupport([tool("support_radio_milwaukee")], [], "give");
    expect(shown.pass).toBe(true);
    expect(shown.detail).toContain("give card shown");
    expect(checkSupport([tool("support_radio_milwaukee")], [], undefined).pass).toBe(false);
    expect(checkSupport([tool("support_radio_milwaukee", {}, true, "boom")], [], "give").pass).toBe(false);
    expect(checkSupport([tool("station_picks")], [], "events").pass).toBe(false);
  });
  it("before the keys exist, passes on the exact not-set-up reply and says so", () => {
    const notSetUp = checkSupport([tool("support_radio_milwaukee", {}, false, GIVE_UNAVAILABLE_SPEECH)], [], undefined);
    expect(notSetUp.pass).toBe(true);
    expect(notSetUp.detail).toContain("not set up yet");
    expect(checkSupport([tool("support_radio_milwaukee", {}, false, "Donations are down")], [], undefined).pass).toBe(false);
  });
});

describe("checkCancelNeedsLink", () => {
  it("passes only when an unlinked cancel_membership stopped at account linking", () => {
    expect(checkCancelNeedsLink([tool("cancel_membership", {}, true, LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH)]).pass).toBe(true);
    expect(checkCancelNeedsLink([unlinked("cancel_membership")]).pass).toBe(false);
    expect(checkCancelNeedsLink([tool("cancel_membership")]).pass).toBe(false);
    expect(checkCancelNeedsLink([]).pass).toBe(false);
    expect(checkCancelNeedsLink([unlinked("delete_my_finds")]).pass).toBe(false);
  });
});

describe("screenWords (the --speaker pass)", () => {
  it("finds screen-only phrasing, any case", () => {
    expect(screenWords("And 2 more On Screen. Tap Listen live. It's on the card, or on the screen.")).toEqual(["On Screen", "Tap", "the card", "on the screen"]);
  });
  it("lets device-neutral speech through", () => {
    expect(screenWords("The last 5 on 88Nine: 1, \"Taps\" by Screens. Want the next two? Cardinal is on tape.")).toEqual([]);
  });
});

describe("checkRecentSongsPage", () => {
  it("needs recent_songs asked for that page", () => {
    expect(checkRecentSongsPage(2)([tool("recent_songs", { station: "88nine", count: 10, page: 2 })]).pass).toBe(true);
    expect(checkRecentSongsPage(2)([tool("recent_songs", { station: "88nine" })]).pass).toBe(false);
  });
});
