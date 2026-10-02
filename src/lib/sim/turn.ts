import { timingSafeEqual } from "node:crypto";
import { runBrain, type Converse } from "@/lib/sim/brain";
import type { McpSession } from "@/lib/sim/mcpClient";
import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";

export const MAX_AUDIO_BYTES = 1_000_000; // ~15 s of webm/opus speech
export const MAX_TEXT_CHARS = 300;
const MAX_HISTORY = 20;
const DIDNT_CATCH = "Sorry, I didn't catch that.";

export interface TurnInput {
  passcode: string | null;
  history: ChatMessage[];
  audio?: { bytes: Uint8Array; contentType: string };
  text?: string;
}

export interface TurnResult {
  heard: string;
  reply: string;
  /** Base64 MP3, or null when the voice is unavailable (captions still show). */
  audio: string | null;
  /** What the story card needs: the tool input and its result, as an MCP Apps host passes them. */
  card: { input: Record<string, unknown>; result: Record<string, unknown> } | null;
  trail: TrailEntry[];
}

export interface TurnDeps {
  passcode: string;
  transcribe(bytes: Uint8Array, contentType: string): Promise<string>;
  mcp(): Promise<McpSession>;
  converse: Converse;
  speak(text: string): Promise<Uint8Array>;
}

type Reply = { status: number; body: TurnResult | { error: string } };

/** The last turns, starting with the listener: Bedrock rejects a conversation that opens with the assistant. */
function recentHistory(history: ChatMessage[]): ChatMessage[] {
  const recent = history.slice(-MAX_HISTORY);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

function passcodeMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One spoken turn: check the passcode and limits before any paid call, hear, think with our MCP tools, speak. */
export async function handleTurn(input: TurnInput, deps: TurnDeps): Promise<Reply> {
  if (!passcodeMatches(input.passcode, deps.passcode)) return { status: 401, body: { error: "Wrong or missing passcode." } };
  if (input.audio && input.audio.bytes.length > MAX_AUDIO_BYTES) return { status: 413, body: { error: "That recording is too long." } };
  if (input.text && input.text.length > MAX_TEXT_CHARS) return { status: 413, body: { error: "That question is too long." } };
  if (!input.audio && !input.text) return { status: 400, body: { error: "Send a recording or a question." } };

  const trail: TrailEntry[] = [];
  let heard = input.text?.trim() ?? "";
  if (input.audio) {
    const started = Date.now();
    try {
      heard = (await deps.transcribe(input.audio.bytes, input.audio.contentType)).trim();
      trail.push({ kind: "heard", text: heard, ms: Date.now() - started });
    } catch (error) {
      trail.push({ kind: "error", text: `speech-to-text failed: ${String(error instanceof Error ? error.message : error)}` });
      heard = "";
    }
  } else {
    trail.push({ kind: "heard", text: heard });
  }
  if (!heard) return { status: 200, body: { heard: "", reply: DIDNT_CATCH, audio: await voice(DIDNT_CATCH, deps, trail), card: null, trail } };

  const session = await deps.mcp();
  try {
    const brain = await runBrain({
      history: [...recentHistory(input.history), { role: "user", text: heard }],
      tools: session.tools,
      callTool: (name, args) => session.callTool(name, args),
      converse: deps.converse,
    });
    trail.push(...brain.trail);
    const story = brain.lastStory?.story as { storyId?: string } | undefined;
    const card = brain.lastStory
      ? { input: { storyId: story?.storyId ?? "" }, result: { content: [{ type: "text", text: brain.reply }], structuredContent: brain.lastStory } }
      : null;
    return { status: 200, body: { heard, reply: brain.reply, audio: await voice(brain.reply, deps, trail), card, trail } };
  } finally {
    await session.close().catch(() => undefined);
  }
}

async function voice(text: string, deps: TurnDeps, trail: TrailEntry[]): Promise<string | null> {
  try {
    return Buffer.from(await deps.speak(text)).toString("base64");
  } catch (error) {
    trail.push({ kind: "error", text: `voice unavailable: ${String(error instanceof Error ? error.message : error)}` });
    return null;
  }
}
