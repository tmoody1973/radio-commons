import type { TrailEntry } from "@/lib/sim/trail";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";

type ToolEntry = Extract<TrailEntry, { kind: "tool" }>;
export interface CheckResult { pass: boolean; detail: string }
export interface ShownSong { playId: string }

const toolCalls = (trail: TrailEntry[], name: string): ToolEntry[] =>
  trail.filter((entry): entry is ToolEntry => entry.kind === "tool" && entry.name === name);

const describe = (calls: ToolEntry[]) => calls.map((call) => `${call.name}(${JSON.stringify(call.input)})`).join(", ") || "no tool called";
const result = (pass: boolean, calls: ToolEntry[]): CheckResult => ({ pass, detail: describe(calls) });

/** The tool ran without error. For signed-in tools an unlinked run may stop at the account-linking refusal: still the right tool. */
const worked = (call: ToolEntry, allowLinking: boolean) => !call.isError || (allowLinking && call.summary === LINK_ACCOUNT_SPEECH);

export function checkRecentSongs(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "recent_songs");
  return result(calls.length > 0 && calls.every((call) => !call.isError), calls);
}

/** "save number 3": the number itself, or the playId of song 3 from the previous turn's on-screen list. Never an invented id. */
export function checkSaveNumber3(trail: TrailEntry[], shown: ShownSong[]): CheckResult {
  const calls = toolCalls(trail, "save_find");
  const right = (call: ToolEntry) => call.input.number === 3 || (typeof call.input.playId === "string" && call.input.playId === shown[2]?.playId);
  return result(calls.length > 0 && calls.every((call) => right(call) && worked(call, true)), calls);
}

export function checkSearchPlaylist(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "search_playlist");
  return result(calls.length > 0 && calls.every((call) => !call.isError), calls);
}

export function checkTrackStory(trail: TrailEntry[]): CheckResult {
  const calls = [...toolCalls(trail, "search_playlist"), ...toolCalls(trail, "get_track_story")];
  const hasStory = calls.some((call) => call.name === "get_track_story");
  return result(hasStory && calls.every((call) => !call.isError), calls);
}

export function checkFollowThao(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "follow_artist");
  const namesThao = (call: ToolEntry) => Object.values(call.input).some((value) => typeof value === "string" && /thao/i.test(value));
  return result(calls.length > 0 && calls.every((call) => namesThao(call) && worked(call, true)), calls);
}

export function checkWhatsNew(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "whats_new_for_me");
  return result(calls.length > 0 && calls.every((call) => worked(call, true)), calls);
}

/** "any 88nine artists have concerts coming up": the station's artists for 88Nine, never the listener's follows digest. */
export function checkStationArtistShows(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "station_artist_shows");
  const digest = toolCalls(trail, "whats_new_for_me");
  const right = calls.length > 0 && digest.length === 0 && calls.every((call) => call.input.station === "88nine" && !call.isError);
  return result(right, [...calls, ...digest]);
}
