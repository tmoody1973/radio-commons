import type { TrailEntry } from "@/lib/sim/trail";
import { LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH, LINK_ACCOUNT_SPEECH } from "@/lib/speech";
import { GIVE_UNAVAILABLE_SPEECH } from "@/lib/give";

type ToolEntry = Extract<TrailEntry, { kind: "tool" }>;
export interface CheckResult { pass: boolean; detail: string }
export interface ShownSong { playId: string; station?: string }

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

/** "save number N": the number itself, or the playId of song N from the previous turn's on-screen list. Never an invented id. */
export const checkSaveNumber = (n: number) => (trail: TrailEntry[], shown: ShownSong[]): CheckResult => {
  const calls = toolCalls(trail, "save_find");
  const right = (call: ToolEntry) => call.input.number === n || (typeof call.input.playId === "string" && call.input.playId === shown[n - 1]?.playId);
  return result(calls.length > 0 && calls.every((call) => right(call) && worked(call, true)), calls);
};

/** "save the HYFIN song" after on_air_now: that station, or the playId on_air_now showed for it. */
export const checkSaveStation = (station: string) => (trail: TrailEntry[], shown: ShownSong[]): CheckResult => {
  const calls = toolCalls(trail, "save_find");
  const shownId = shown.find((song) => song.station === station)?.playId;
  const right = (call: ToolEntry) => call.input.station === station || (shownId !== undefined && call.input.playId === shownId);
  return result(calls.length > 0 && calls.every((call) => right(call) && worked(call, true)), calls);
};

const SONG_ARGS = ["number", "playId", "title", "artist", "station"];
const SAVED = /^(Saved|It was already in your Finds)/;

/** "save that song" with several stations on air: no save of a guessed song; Alexa (or save_find) asks which. */
export function checkAsksWhichStation(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "save_find");
  const guessed = calls.some((call) => SONG_ARGS.some((key) => call.input[key] !== undefined) || SAVED.test(call.summary));
  const reply = trail.findLast((entry) => entry.kind === "reply");
  const asked = calls.length > 0 || (reply?.kind === "reply" && /which/i.test(reply.text));
  return { pass: !guessed && asked, detail: `${describe(calls)} -> ${reply?.kind === "reply" ? reply.text : "no reply"}` };
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

/** "what's on right now" (no station) or "what's playing on HYFIN" (that station): on_air_now, never the recent-songs list. */
export const checkOnAirNow = (station?: string) => (trail: TrailEntry[]): CheckResult => {
  const calls = toolCalls(trail, "on_air_now");
  return result(calls.length > 0 && calls.every((call) => call.input.station === station && !call.isError), calls);
};

/** "what can you do": the capabilities summary. */
export function checkWhatCanYouDo(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "what_can_you_do");
  return result(calls.length > 0 && calls.every((call) => !call.isError), calls);
}

/**
 * "I want to support Radio Milwaukee": the give tool, and either its card (view "give") or, before the Amazon Pay keys
 * exist, exactly "Donations aren't set up yet". The detail says which, so a green run never hides a missing setup.
 */
export function checkSupport(trail: TrailEntry[], _shown: ShownSong[], view?: string): CheckResult {
  const calls = toolCalls(trail, "support_radio_milwaukee");
  const ran = calls.length > 0 && calls.every((call) => !call.isError);
  const card = ran && view === "give";
  const notSetUp = ran && !card && calls.every((call) => call.summary === GIVE_UNAVAILABLE_SPEECH);
  const which = card ? "give card shown" : notSetUp ? "not set up yet (no Amazon Pay keys)" : "neither the give card nor the not-set-up reply";
  return { pass: card || notSetUp, detail: `${describe(calls)} -> ${which}` };
}

/** "cancel my membership" from the unlinked eval: cancel_membership, stopped at account linking (it never runs anonymously). */
export function checkCancelNeedsLink(trail: TrailEntry[]): CheckResult {
  const calls = toolCalls(trail, "cancel_membership");
  return result(calls.length > 0 && calls.every((call) => call.isError && call.summary === LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH), calls);
}

/** "next three" after "the last ten songs": recent_songs again, asked for that page. */
export const checkRecentSongsPage = (page: number) => (trail: TrailEntry[]): CheckResult => {
  const calls = toolCalls(trail, "recent_songs");
  return result(calls.length > 0 && calls.every((call) => call.input.page === page && !call.isError), calls);
};

// A speaker has no screen: these phrases strand a listener on an Echo Dot.
const SCREEN_ONLY = /\bon (?:the )?screen\b|\btap\b|\bthe card\b/gi;

/** The screen-only phrases in a spoken reply (empty when it works on a speaker). Used by `eval:turns --speaker`. */
export const screenWords = (reply: string): string[] => reply.match(SCREEN_ONLY) ?? [];
