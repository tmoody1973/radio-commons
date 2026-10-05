// Real listener sentences through the LIVE simulator turn endpoint; judges the tool trail.
// Run: npm run eval:turns   (EVAL_URL overrides the target; SIM_PASSCODE comes from .env.local, never printed)
import { loadEnvConfig } from "@next/env";
import {
  checkFollowThao, checkRecentSongs, checkSaveNumber3, checkSearchPlaylist, checkTrackStory, checkWhatsNew,
  type CheckResult, type ShownSong,
} from "../src/lib/sim/evalChecks";
import type { ChatMessage, TrailEntry } from "../src/lib/sim/trail";
import { nextHistory, onScreenFrom } from "../src/lib/sim/ui";

const DEFAULT_URL = "https://radio-commons.vercel.app";

interface TurnBody { heard: string; reply: string; card: { result: { structuredContent?: Record<string, unknown> } } | null; trail: TrailEntry[] }
interface Step { text: string; judge: (trail: TrailEntry[], shown: ShownSong[]) => CheckResult }
interface Scenario { name: string; steps: Step[] }

const SCENARIOS: Scenario[] = [
  { name: "save by number", steps: [
    { text: "what were the last 5 songs on 88nine", judge: checkRecentSongs },
    { text: "save number 3", judge: checkSaveNumber3 },
  ] },
  { name: "last play of an artist", steps: [{ text: "when did you last play Nas", judge: checkSearchPlaylist }] },
  { name: "credits", steps: [{ text: "what are the credits on Groove Thang", judge: checkTrackStory }] },
  { name: "follow", steps: [{ text: "follow Thao", judge: checkFollowThao }] },
  { name: "what's new", steps: [{ text: "what's new for me", judge: checkWhatsNew }] },
];

function parseArgs(env: NodeJS.ProcessEnv): { baseUrl: string; passcode: string } {
  const passcode = env.SIM_PASSCODE;
  if (!passcode) throw new Error("SIM_PASSCODE is not set (.env.local or the environment).");
  const baseUrl = (env.EVAL_URL ?? DEFAULT_URL).replace(/\/$/, "");
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(baseUrl);
  if (!baseUrl.startsWith("https://") && !isLocal) throw new Error("EVAL_URL must be https (http only for localhost) so the passcode is never sent in clear text.");
  return { baseUrl, passcode };
}

async function sendTurn(baseUrl: string, passcode: string, text: string, history: ChatMessage[]): Promise<TurnBody> {
  const form = new FormData();
  form.set("text", text);
  form.set("history", JSON.stringify(history));
  const response = await fetch(`${baseUrl}/api/sim/turn`, { method: "POST", headers: { "x-sim-passcode": passcode }, body: form });
  if (!response.ok) throw new Error(`HTTP ${response.status} from the turn endpoint`);
  try {
    return (await response.json()) as TurnBody;
  } catch {
    throw new Error("bad JSON from the simulator");
  }
}

async function runScenario(scenario: Scenario, baseUrl: string, passcode: string): Promise<boolean> {
  let history: ChatMessage[] = [];
  let shown: ShownSong[] = [];
  let allPassed = true;
  for (const step of scenario.steps) {
    let outcome: CheckResult;
    try {
      const body = await sendTurn(baseUrl, passcode, step.text, history);
      outcome = step.judge(body.trail, shown);
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
  console.log(`Target: ${baseUrl}`);
  const results = [];
  for (const scenario of SCENARIOS) results.push(await runScenario(scenario, baseUrl, passcode));
  if (results.includes(false)) process.exit(1);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
