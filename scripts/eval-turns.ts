// Real listener sentences through the LIVE simulator turn endpoint; judges the tool trail.
// Run: npm run eval:turns   (EVAL_URL overrides the target; SIM_PASSCODE comes from .env.local, never printed)
//      npm run eval:turns -- --speaker   (Echo Dot mode: also fails any reply that says "on screen", "tap" or "the card")
import { loadEnvConfig } from "@next/env";
import {
  checkCancelNeedsLink, checkMembershipNeedsLink, checkSupportLevel, checkFollowThao, checkOnAirNow, checkSupport, checkRecentSongs, checkAsksWhichStation, checkRecentSongsPage, checkSaveNumber, screenWords, checkSaveStation, checkSearchPlaylist, checkStationArtistShows, checkStationSchedule, checkTrackStory, checkWhatCanYouDo, checkWhatsNew,
  type CheckResult, type ShownSong,
} from "../src/lib/sim/evalChecks";
import type { ChatMessage, TrailEntry } from "../src/lib/sim/trail";
import { nextHistory, onScreenFrom } from "../src/lib/sim/ui";

const DEFAULT_URL = "https://radio-commons.vercel.app";

interface TurnBody { heard: string; reply: string; card: { result: { structuredContent?: Record<string, unknown> } } | null; trail: TrailEntry[] }
interface Step { text: string; judge: (trail: TrailEntry[], shown: ShownSong[], view?: string) => CheckResult }
interface Scenario { name: string; steps: Step[] }

const SCENARIOS: Scenario[] = [
  { name: "save by number", steps: [
    { text: "what were the last 5 songs on 88nine", judge: checkRecentSongs },
    { text: "save number 3", judge: checkSaveNumber(3) },
  ] },
  { name: "the next page keeps counting", steps: [
    { text: "what were the last ten songs on 88nine", judge: checkRecentSongs },
    { text: "the next three", judge: checkRecentSongsPage(2) },
    { text: "save number 5", judge: checkSaveNumber(5) },
  ] },
  { name: "save from on air by number", steps: [
    { text: "what's on right now", judge: checkOnAirNow() },
    { text: "save number 2", judge: checkSaveNumber(2) },
  ] },
  { name: "save from on air by station", steps: [
    { text: "what's on right now", judge: checkOnAirNow() },
    { text: "save the HYFIN song", judge: checkSaveStation("hyfin") },
  ] },
  { name: "save from on air asks which", steps: [
    { text: "what's on right now", judge: checkOnAirNow() },
    { text: "save that song", judge: checkAsksWhichStation },
  ] },
  { name: "last play of an artist", steps: [{ text: "when did you last play Nas", judge: checkSearchPlaylist }] },
  { name: "credits", steps: [{ text: "what are the credits on Groove Thang", judge: checkTrackStory }] },
  { name: "follow", steps: [{ text: "follow Thao", judge: checkFollowThao }] },
  { name: "what's new", steps: [{ text: "what's new for me", judge: checkWhatsNew }] },
  { name: "station artists' shows", steps: [{ text: "any 88nine artists have concerts coming up", judge: checkStationArtistShows }] },
  { name: "followed artists' shows", steps: [{ text: "do any artists I follow have concerts", judge: checkWhatsNew }] },
  { name: "what can you do", steps: [{ text: "what can you do", judge: checkWhatCanYouDo }] },
  { name: "on air now", steps: [{ text: "what's on right now", judge: checkOnAirNow() }] },
  { name: "on air on one station", steps: [{ text: "what's playing on HYFIN", judge: checkOnAirNow("hyfin") }] },
  { name: "who's on", steps: [{ text: "who's on 88nine right now", judge: checkStationSchedule() }] },
  { name: "when is a show on", steps: [{ text: "when is rhythm lab on", judge: checkStationSchedule(/rhythm lab/i) }] },
  { name: "when is a host on", steps: [{ text: "when is erin wolf on", judge: checkStationSchedule(/erin wolf/i) }] },
  // Needs the Amazon Pay env on the target; without it the tool says donations aren't set up and this fails.
  { name: "support the station", steps: [{ text: "I want to support Radio Milwaukee", judge: checkSupport }] },
  { name: "cancel needs a linked account", steps: [{ text: "cancel my Radio Milwaukee membership", judge: checkCancelNeedsLink }] },
  // The eval runs unlinked; the linked answers are covered by tests/giveTools.test.ts.
  { name: "membership needs a linked account", steps: [{ text: "am I a Radio Milwaukee member", judge: checkMembershipNeedsLink }] },
  { name: "upgrade opens one level", steps: [{ text: "upgrade me to Front Row", judge: checkSupportLevel("front-row") }] },
];

function parseArgs(env: NodeJS.ProcessEnv): { baseUrl: string; passcode: string } {
  const passcode = env.SIM_PASSCODE;
  if (!passcode) throw new Error("SIM_PASSCODE is not set (.env.local or the environment).");
  const baseUrl = (env.EVAL_URL ?? DEFAULT_URL).replace(/\/$/, "");
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(baseUrl);
  if (!baseUrl.startsWith("https://") && !isLocal) throw new Error("EVAL_URL must be https (http only for localhost) so the passcode is never sent in clear text.");
  return { baseUrl, passcode };
}

async function sendTurn(baseUrl: string, passcode: string, text: string, history: ChatMessage[], speaker: boolean): Promise<TurnBody> {
  const form = new FormData();
  form.set("text", text);
  if (speaker) form.set("device", "dot");
  form.set("history", JSON.stringify(history));
  const response = await fetch(`${baseUrl}/api/sim/turn`, { method: "POST", headers: { "x-sim-passcode": passcode }, body: form });
  if (!response.ok) throw new Error(`HTTP ${response.status} from the turn endpoint`);
  try {
    return (await response.json()) as TurnBody;
  } catch {
    throw new Error("bad JSON from the simulator");
  }
}

/** On a speaker, a reply that points at a screen fails the step whatever the tool trail says. */
function speakerOutcome(outcome: CheckResult, reply: string): CheckResult {
  const found = screenWords(reply);
  return found.length ? { pass: false, detail: `${outcome.detail} -> said ${found.map((w) => `"${w}"`).join(", ")} on a speaker: "${reply}"` } : outcome;
}

async function runScenario(scenario: Scenario, baseUrl: string, passcode: string, speaker: boolean): Promise<boolean> {
  let history: ChatMessage[] = [];
  let shown: ShownSong[] = [];
  let allPassed = true;
  for (const step of scenario.steps) {
    let outcome: CheckResult;
    try {
      const body = await sendTurn(baseUrl, passcode, step.text, history, speaker);
      const view = body.card?.result.structuredContent?.view;
      outcome = step.judge(body.trail, shown, typeof view === "string" ? view : undefined);
      if (speaker) outcome = speakerOutcome(outcome, body.reply);
      const onScreen = onScreenFrom(body.card?.result.structuredContent);
      shown = onScreen && "songs" in onScreen ? onScreen.songs : shown;
      history = nextHistory(history, body.heard || step.text, body.reply, onScreen);
    } catch (error) {
      outcome = { pass: false, detail: error instanceof Error ? error.message : String(error) };
    }
    allPassed &&= outcome.pass;
    console.log(`${outcome.pass ? "PASS" : "FAIL"}  [${scenario.name}] "${step.text}" -> ${outcome.detail}`);
    if (!outcome.pass) break; // later steps depend on this one's history
  }
  return allPassed;
}

async function main() {
  loadEnvConfig(process.cwd());
  const { baseUrl, passcode } = parseArgs(process.env);
  if (process.argv.includes("--dry-run")) return console.log(`dry run ok: target ${baseUrl}, ${SCENARIOS.length} scenarios, passcode present`);
  const speaker = process.argv.includes("--speaker");
  console.log(`Target: ${baseUrl}${speaker ? " (Echo Dot: no screen)" : ""}`);
  const results = [];
  for (const scenario of SCENARIOS) results.push(await runScenario(scenario, baseUrl, passcode, speaker));
  if (results.includes(false)) process.exit(1);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
