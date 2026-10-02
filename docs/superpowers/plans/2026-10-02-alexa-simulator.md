# Radio Commons slice 2: Alexa+ simulator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Echo-Show-styled web page at `/simulator` where you hold to talk, an AI playing Alexa+ uses the real Radio Commons MCP tools, speaks the answer, shows the story card, and lists what it did.

**Architecture:** One server route, `POST /api/sim/turn`, does a spoken turn: Deepgram Nova-3 transcribes the clip; Claude Haiku 4.5 on Amazon Bedrock (Converse API, tool use) chooses tools; each tool call goes through the official MCP client (`@modelcontextprotocol/client`, Streamable HTTP) to our own `/api/mcp`; Amazon Polly speaks the reply. The browser carries the conversation, plays the audio, renders the story card as an MCP Apps host (`AppBridge` + sandboxed iframe), and shows the trail.

**Tech Stack:** Next.js 16 (App Router), `@modelcontextprotocol/client` ^2.2 (`Client`, `StreamableHTTPClientTransport` with a `fetch` option), `@modelcontextprotocol/ext-apps` ^2.0.3 (`AppBridge`, `PostMessageTransport` from `/app-bridge`), `@aws-sdk/client-bedrock-runtime` (`ConverseCommand`), `@aws-sdk/client-polly` (`SynthesizeSpeechCommand`), Deepgram REST `/v1/listen`, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-alexa-simulator-design.md` (approved 2026-10-02).

## Global Constraints

- The slice 1 MCP server is used **unchanged**; the simulator is a client of `/api/mcp` (`MCP_URL`, default `https://radio-commons.vercel.app/api/mcp`).
- Trust rules in the system prompt: answer only from tool results; always say the show and month; describe summaries as Radio Milwaukee's; if a tool finds nothing or apologizes, say so and stop; never answer local-story questions from general knowledge; short, spoken replies.
- Limits: ≤ **4** tool calls per turn; **15 s** per turn; audio clip ≤ **15 s** and ≤ **1 MB**; typed text ≤ **300** chars; conversation ≤ **20** messages kept.
- Keys server-side only: `DEEPGRAM_API_KEY`, `SIM_AWS_ACCESS_KEY_ID`, `SIM_AWS_SECRET_ACCESS_KEY`, `SIM_AWS_REGION` (default `us-east-1`), `SIM_PASSCODE`. Never `NEXT_PUBLIC_`. Nothing secret in the public repo.
- `/api/sim/turn` requires the `x-sim-passcode` header to equal `SIM_PASSCODE` (constant-time compare); 401 otherwise.
- Bedrock model: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (the profile Backstory uses). Polly: `Engine: "generative"`, voice chosen in Task 6 (default `Ruth`); never a voice imitating Alexa.
- **PROD** steps (Tarik's go-ahead): creating the AWS key, setting Vercel env vars, merging, production deploys.

## Review Focus

1. **The brain answers from its own knowledge when a tool finds nothing.** Expected: it says it couldn't find the story. Test: Task 2 "a no-match stays a no-match" (fake model that tries to answer anyway is not in scope; the test checks the system prompt carries the rule and that a no-match tool result produces the tool's text when the model echoes it).
2. **A tool loop that never ends** (model keeps calling tools). Expected: stops at 4 calls with an apology. Test: Task 2 "stops after four tool calls".
3. **Someone without the passcode, or with a huge upload.** Expected: 401 / 413 before any paid API is called. Tests: Task 3 "refuses without the passcode" and "refuses an oversized clip".
4. **Deepgram hears nothing.** Expected: "Sorry, I didn't catch that." without calling Bedrock. Test: Task 3 "empty transcript".
5. **Polly fails.** Expected: reply still shown as captions, `audio: null`. Test: Task 3 "voice unavailable".

---

## File Map

| File | Responsibility |
|---|---|
| `src/lib/sim/types.ts` | `ChatMessage`, `TrailEntry`, `TurnResult`, `ToolCallRecord` |
| `src/lib/sim/mcpClient.ts` | `connectMcp(url, fetch?)` → `{ tools, callTool, readCard, close }` |
| `src/lib/sim/brain.ts` | `SYSTEM_PROMPT`, `runBrain({ messages, tools, callTool, converse, limits })` |
| `src/lib/sim/trail.ts` | `trailEntry(...)` builders (pure) |
| `src/lib/sim/stt.ts` | `transcribe(audio, contentType, deps)` (Deepgram) |
| `src/lib/sim/tts.ts` | `speak(text, deps)` (Polly) |
| `src/lib/sim/turn.ts` | `handleTurn(input, deps)`: limits, passcode, STT → brain → TTS, errors |
| `src/app/api/sim/turn/route.ts` | Mounts `handleTurn` with real deps |
| `src/app/api/sim/card/route.ts` | Returns the card HTML (read through the MCP client) for the iframe |
| `src/app/simulator/page.tsx`, `src/components/sim/*` | Echo Show frame, talk button, captions, card host, trail, typed backup, passcode |
| `tests/sim/*.test.ts` | unit + contract tests |

---

### Task 1: MCP client for the simulator

**Files:** Create `src/lib/sim/types.ts`, `src/lib/sim/mcpClient.ts`, `tests/sim/mcpClient.test.ts`

**Interfaces:**
- Consumes: `buildMcpHandler` (slice 1, for the in-process test only).
- Produces:
  ```ts
  export interface McpTool { name: string; description: string; inputSchema: Record<string, unknown> }
  export interface McpToolResult { text: string; structured: Record<string, unknown> | null; isError: boolean }
  export interface McpSession { tools: McpTool[]; callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>; readCard(): Promise<string>; close(): Promise<void> }
  export function connectMcp(url: string, fetchImpl?: typeof fetch): Promise<McpSession>
  ```

- [ ] **Step 1: Failing contract test** — `tests/sim/mcpClient.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import { connectMcp } from "@/lib/sim/mcpClient";
import { fakeBackstory } from "../mcp.test";

const handler = buildMcpHandler({ backstory: () => fakeBackstory(), cardHtml: () => "<!doctype html><title>card</title>" });
const inProcessFetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;

describe("simulator MCP client", () => {
  it("lists our tools, calls them, and reads the card, like Alexa+ would", async () => {
    const mcp = await connectMcp("http://localhost/api/mcp", inProcessFetch);
    expect(mcp.tools.map((t) => t.name).sort()).toEqual(["find_station_story", "get_station_story"]);
    const found = await mcp.callTool("find_station_story", { description: "art shop" });
    expect(found.text).toMatch(/^I found one Radio Milwaukee story/);
    expect(found.isError).toBe(false);
    expect(await mcp.readCard()).toContain("<title>card</title>");
    await mcp.close();
  });
});
```
(If importing `fakeBackstory` from another test file drags in its `describe` blocks, move `fakeBackstory` and `STORY` into `tests/fixtures.ts` and import from there in both files.)

- [ ] **Step 2: Run → FAIL** (`@/lib/sim/mcpClient` missing).

- [ ] **Step 3: Implement**
```ts
// src/lib/sim/mcpClient.ts
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CARD_URI } from "@/lib/mcp";

export interface McpTool { name: string; description: string; inputSchema: Record<string, unknown> }
export interface McpToolResult { text: string; structured: Record<string, unknown> | null; isError: boolean }
export interface McpSession {
  tools: McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  readCard(): Promise<string>;
  close(): Promise<void>;
}

/** Connects to a Radio Commons MCP endpoint over Streamable HTTP, the way Alexa+ does. */
export async function connectMcp(url: string, fetchImpl?: typeof fetch): Promise<McpSession> {
  const client = new Client({ name: "radio-commons-simulator", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), fetchImpl ? { fetch: fetchImpl } : undefined));
  const { tools } = await client.listTools();
  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as Record<string, unknown> })),
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const content = (result.content ?? []) as { type: string; text?: string }[];
      return {
        text: content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n"),
        structured: (result.structuredContent as Record<string, unknown> | undefined) ?? null,
        isError: result.isError === true,
      };
    },
    async readCard() {
      const read = await client.readResource({ uri: CARD_URI });
      const first = read.contents[0] as { text?: string } | undefined;
      if (!first?.text) throw new Error("Story card resource was empty");
      return first.text;
    },
    close: () => client.close(),
  };
}
```
Check `node_modules/@modelcontextprotocol/client/dist/index.d.mts` for the exact `callTool` result typing; adjust casts, not behavior.

- [ ] **Step 4: Run → PASS; typecheck.** `npx vitest run tests/sim/mcpClient.test.ts && npm run typecheck`.
- [ ] **Step 5: Commit** — branch `feat/simulator`; `git commit -m "feat: simulator MCP client (Streamable HTTP, like Alexa+)"`.

---

### Task 2: The brain — Bedrock tool loop with the trust rules

**Files:** Create `src/lib/sim/brain.ts`, `src/lib/sim/trail.ts`, `tests/sim/brain.test.ts`; add `@aws-sdk/client-bedrock-runtime`.

**Interfaces:**
- Consumes: `McpTool`, `McpToolResult` (Task 1).
- Produces:
  ```ts
  export type ChatMessage = { role: "user" | "assistant"; text: string };
  export type TrailEntry =
    | { kind: "heard"; text: string; ms?: number }
    | { kind: "tool"; name: string; input: Record<string, unknown>; ms: number; isError: boolean; summary: string }
    | { kind: "reply"; text: string; ms: number }
    | { kind: "error"; text: string };
  export type Converse = (request: { system: string; messages: unknown[]; tools: McpTool[] }) =>
    Promise<{ stopReason: string; content: ({ text: string } | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } })[] }>;
  export const SYSTEM_PROMPT: string;
  export async function runBrain(opts: { history: ChatMessage[]; tools: McpTool[]; callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>; converse: Converse; maxToolCalls?: number; deadlineMs?: number })
    : Promise<{ reply: string; trail: TrailEntry[]; lastStory: Record<string, unknown> | null }>;
  export function bedrockConverse(client: BedrockRuntimeClient, modelId: string): Converse;
  ```

- [ ] **Step 1: Failing tests** — `tests/sim/brain.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { runBrain, SYSTEM_PROMPT, type Converse } from "@/lib/sim/brain";

const TOOLS = [{ name: "find_station_story", description: "find", inputSchema: { type: "object" } }, { name: "get_station_story", description: "get", inputSchema: { type: "object" } }];
const toolUse = (name: string, input: Record<string, unknown>, id = name) => ({ stopReason: "tool_use", content: [{ toolUse: { toolUseId: id, name, input } }] });
const say = (text: string) => ({ stopReason: "end_turn", content: [{ text }] });

/** A scripted model: returns the next response each time it's called. */
const scripted = (...responses: Awaited<ReturnType<Converse>>[]): Converse => { let i = 0; return async () => responses[Math.min(i++, responses.length - 1)]; };

describe("brain", () => {
  it("finds, then tells, then answers; the trail records each tool call and the card data", async () => {
    const calls: string[] = [];
    const result = await runBrain({
      history: [{ role: "user", text: "the frugal dining episode" }],
      tools: TOOLS,
      callTool: async (name) => {
        calls.push(name);
        return name === "find_station_story"
          ? { text: "I found one Radio Milwaukee story: Frugal dining…", structured: { matches: [{ storyId: "s1" }] }, isError: false }
          : { text: "From This Bites, September 2026: …", structured: { story: { storyId: "s1" }, cardHtml: "<article>" }, isError: false };
      },
      converse: scripted(toolUse("find_station_story", { description: "frugal dining" }), toolUse("get_station_story", { storyId: "s1" }), say("From This Bites, September 2026: frugal dining.")),
    });
    expect(calls).toEqual(["find_station_story", "get_station_story"]);
    expect(result.reply).toBe("From This Bites, September 2026: frugal dining.");
    expect(result.trail.filter((e) => e.kind === "tool").map((e) => (e as { name: string }).name)).toEqual(["find_station_story", "get_station_story"]);
    expect(result.lastStory).toMatchObject({ story: { storyId: "s1" } });
  });

  it("stops after four tool calls", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "loop" }], tools: TOOLS,
      callTool: async () => ({ text: "none", structured: null, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "x" })),
    });
    expect(result.trail.filter((e) => e.kind === "tool")).toHaveLength(4);
    expect(result.reply).toBe("Sorry, something went wrong. Please try again.");
  });

  it("a no-match stays a no-match: the trust rules are in the system prompt", async () => {
    expect(SYSTEM_PROMPT).toMatch(/only from the results of your tools/i);
    expect(SYSTEM_PROMPT).toMatch(/never answer .* from your own knowledge/i);
    const result = await runBrain({
      history: [{ role: "user", text: "moon base" }], tools: TOOLS,
      callTool: async () => ({ text: "I couldn't find a Radio Milwaukee story about that.", structured: { matches: [] }, isError: false }),
      converse: scripted(toolUse("find_station_story", { description: "moon base" }), say("I couldn't find a Radio Milwaukee story about that.")),
    });
    expect(result.reply).toBe("I couldn't find a Radio Milwaukee story about that.");
    expect(result.lastStory).toBeNull();
  });

  it("gives up with an apology after the deadline", async () => {
    const result = await runBrain({
      history: [{ role: "user", text: "slow" }], tools: TOOLS, deadlineMs: 20,
      callTool: async () => ({ text: "x", structured: null, isError: false }),
      converse: async () => { await new Promise((r) => setTimeout(r, 40)); return say("late"); },
    });
    expect(result.reply).toBe("Sorry, something went wrong. Please try again.");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `src/lib/sim/trail.ts` (types + `summarize(result)` = first 120 chars of text) and `src/lib/sim/brain.ts`:
```ts
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message } from "@aws-sdk/client-bedrock-runtime";
import type { McpTool, McpToolResult } from "@/lib/sim/mcpClient";
import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";

export const SYSTEM_PROMPT = `You are playing Alexa+ on an Echo Show, using Radio Milwaukee's story tools.
Answer only from the results of your tools. For a story the listener describes, call find_station_story; when one story matches (or the listener picks one), call get_station_story and speak its answer.
Always say the show and the month. Describe summaries as Radio Milwaukee's, not your own.
If a tool finds nothing or apologizes, say exactly that and stop. Never answer questions about local stories, people or places from your own knowledge.
Keep replies short and natural for speaking: no lists, no markdown, at most three sentences, end with the one offer the tool suggests.`;

const APOLOGY = "Sorry, something went wrong. Please try again.";
type Block = { text: string } | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } };
export type Converse = (request: { system: string; messages: unknown[]; tools: McpTool[] }) => Promise<{ stopReason: string; content: Block[] }>;

export async function runBrain(opts: {
  history: ChatMessage[]; tools: McpTool[]; callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  converse: Converse; maxToolCalls?: number; deadlineMs?: number;
}): Promise<{ reply: string; trail: TrailEntry[]; lastStory: Record<string, unknown> | null }> {
  const { maxToolCalls = 4, deadlineMs = 15_000 } = opts;
  const deadline = Date.now() + deadlineMs;
  const trail: TrailEntry[] = [];
  const messages: unknown[] = opts.history.map((m) => ({ role: m.role, content: [{ text: m.text }] }));
  let lastStory: Record<string, unknown> | null = null;
  let toolCalls = 0;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("turn took longer than the time limit");
      const started = Date.now();
      const response = await Promise.race([
        opts.converse({ system: SYSTEM_PROMPT, messages, tools: opts.tools }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("turn took longer than the time limit")), remaining)),
      ]);
      messages.push({ role: "assistant", content: response.content });
      const uses = response.content.flatMap((b) => ("toolUse" in b ? [b.toolUse] : []));
      if (uses.length === 0) {
        const reply = response.content.flatMap((b) => ("text" in b ? [b.text] : [])).join(" ").trim();
        trail.push({ kind: "reply", text: reply, ms: Date.now() - started });
        return { reply: reply || APOLOGY, trail, lastStory };
      }
      const results = [];
      for (const use of uses) {
        if (toolCalls >= maxToolCalls) throw new Error(`stopped after ${maxToolCalls} tool calls`);
        toolCalls++;
        const t0 = Date.now();
        const result = await opts.callTool(use.name, use.input);
        trail.push({ kind: "tool", name: use.name, input: use.input, ms: Date.now() - t0, isError: result.isError, summary: result.text.slice(0, 120) });
        if (use.name === "get_station_story" && result.structured?.story) lastStory = result.structured;
        results.push({ toolResult: { toolUseId: use.toolUseId, content: [{ text: result.text }], status: result.isError ? "error" : "success" } });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    trail.push({ kind: "error", text: String(error instanceof Error ? error.message : error) });
    return { reply: APOLOGY, trail, lastStory };
  }
}

/** Bedrock Converse with our MCP tools offered as Bedrock tools (their JSON Schemas pass through). */
export function bedrockConverse(client: BedrockRuntimeClient, modelId: string): Converse {
  return async ({ system, messages, tools }) => {
    const response = await client.send(new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: messages as Message[],
      inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      toolConfig: { tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })) },
    }));
    return { stopReason: response.stopReason ?? "", content: (response.output?.message?.content ?? []) as ContentBlock[] as Block[] };
  };
}
```
(Run `npm install @aws-sdk/client-bedrock-runtime`. Check the Bedrock `ToolResultBlock`/`Message` types and adjust the `toolResult` shape if the compiler disagrees.)

- [ ] **Step 4: Run → PASS; typecheck.**
- [ ] **Step 5: Commit** — `git commit -m "feat: simulator brain: Bedrock tool loop with the trust rules, caps and trail"`.

---

### Task 3: A spoken turn on the server

**Files:** Create `src/lib/sim/stt.ts`, `src/lib/sim/tts.ts`, `src/lib/sim/turn.ts`, `src/app/api/sim/turn/route.ts`, `src/app/api/sim/card/route.ts`, `tests/sim/turn.test.ts`; add `@aws-sdk/client-polly`.

**Interfaces:**
- Consumes: `connectMcp`, `runBrain`, `bedrockConverse`.
- Produces:
  ```ts
  export interface TurnInput { passcode: string | null; history: ChatMessage[]; audio?: { bytes: Uint8Array; contentType: string }; text?: string }
  export interface TurnResult { heard: string; reply: string; audio: string | null /* base64 mp3 */; card: { input: Record<string, unknown>; result: Record<string, unknown> } | null; trail: TrailEntry[] }
  export interface TurnDeps { passcode: string; transcribe(bytes: Uint8Array, contentType: string): Promise<string>; mcp(): Promise<McpSession>; converse: Converse; speak(text: string): Promise<Uint8Array> }
  export async function handleTurn(input: TurnInput, deps: TurnDeps): Promise<{ status: number; body: TurnResult | { error: string } }>
  ```

- [ ] **Step 1: Failing tests** — `tests/sim/turn.test.ts` (fakes for every dependency):
```ts
import { describe, expect, it, vi } from "vitest";
import { handleTurn, type TurnDeps } from "@/lib/sim/turn";

const deps = (over: Partial<TurnDeps> = {}): TurnDeps => ({
  passcode: "milwaukee",
  transcribe: vi.fn(async () => "the frugal dining episode"),
  mcp: async () => ({ tools: [], callTool: async () => ({ text: "x", structured: null, isError: false }), readCard: async () => "", close: async () => {} }),
  converse: async () => ({ stopReason: "end_turn", content: [{ text: "From This Bites, September 2026: frugal dining." }] }),
  speak: vi.fn(async () => new Uint8Array([1, 2, 3])),
  ...over,
});
const clip = { bytes: new Uint8Array(1000), contentType: "audio/webm" };

describe("a spoken turn", () => {
  it("hears, answers and speaks", async () => {
    const { status, body } = await handleTurn({ passcode: "milwaukee", history: [], audio: clip }, deps());
    expect(status).toBe(200);
    expect(body).toMatchObject({ heard: "the frugal dining episode", reply: "From This Bites, September 2026: frugal dining.", audio: "AQID" });
  });
  it("refuses without the passcode, before any paid call", async () => {
    const d = deps();
    expect((await handleTurn({ passcode: "nope", history: [], audio: clip }, d)).status).toBe(401);
    expect(d.transcribe).not.toHaveBeenCalled();
  });
  it("refuses an oversized clip or long text", async () => {
    expect((await handleTurn({ passcode: "milwaukee", history: [], audio: { bytes: new Uint8Array(1_100_000), contentType: "audio/webm" } }, deps())).status).toBe(413);
    expect((await handleTurn({ passcode: "milwaukee", history: [], text: "x".repeat(301) }, deps())).status).toBe(413);
  });
  it("empty transcript: 'didn't catch that', no model call", async () => {
    const converse = vi.fn();
    const { body } = await handleTurn({ passcode: "milwaukee", history: [], audio: clip }, deps({ transcribe: async () => "  ", converse }));
    expect(body).toMatchObject({ reply: "Sorry, I didn't catch that." });
    expect(converse).not.toHaveBeenCalled();
  });
  it("voice unavailable: captions still come back", async () => {
    const { body } = await handleTurn({ passcode: "milwaukee", history: [], text: "frugal dining" }, deps({ speak: async () => { throw new Error("polly down"); } }));
    expect(body).toMatchObject({ reply: "From This Bites, September 2026: frugal dining.", audio: null });
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**
  - `src/lib/sim/stt.ts`: `deepgramTranscribe(apiKey, fetchImpl = fetch)` → `(bytes, contentType) => POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true` plus `keyterm` params for `["Radio Milwaukee", "This Bites", "Uniquely Milwaukee", "Ann Christenson", "Tarik Moody", "Kim Shine"]`, headers `Authorization: Token <key>`, `Content-Type: <contentType>`, body = bytes; returns `results.channels[0].alternatives[0].transcript` (throw on non-200 with status).
  - `src/lib/sim/tts.ts`: `pollySpeak(client: PollyClient, voiceId = "Ruth")` → `SynthesizeSpeechCommand({ Engine: "generative", VoiceId, OutputFormat: "mp3", Text })`, read `AudioStream.transformToByteArray()`.
  - `src/lib/sim/turn.ts`: constant-time passcode check (`crypto.timingSafeEqual` on equal-length buffers; length mismatch → 401); limits (1 MB audio, 300 chars, history sliced to last 20); `heard = text ?? await transcribe(...)`, trimmed; empty → reply "Sorry, I didn't catch that." with no model call; else `mcp()` → `runBrain({ history: [...history, { role: "user", text: heard }], tools, callTool, converse })` → `close()` in `finally`; `speak(reply)` in its own try (failure → `audio: null` and an `error` trail entry); `card` = `{ input: { storyId }, result: { content: [{type:"text",text}], structuredContent: lastStory } }` when `lastStory` is set.
  - `src/app/api/sim/turn/route.ts`: `POST` reads `x-sim-passcode`, a `multipart/form-data` body (`audio` file, `text`, `history` JSON), builds real deps from env (`DEEPGRAM_API_KEY`; `new BedrockRuntimeClient({ region: SIM_AWS_REGION, credentials: { accessKeyId: SIM_AWS_ACCESS_KEY_ID, secretAccessKey: SIM_AWS_SECRET_ACCESS_KEY } })`; `PollyClient` likewise; `MCP_URL`), returns JSON. `export const maxDuration = 30; export const preferredRegion = "iad1";`
  - `src/app/api/sim/card/route.ts`: `GET` returns `readCard()` HTML with `content-type: text/html` (no passcode: the card holds no data until the host sends a result).

- [ ] **Step 4: Run → PASS; typecheck; build.**
- [ ] **Step 5: Commit** — `git commit -m "feat: simulator turn: Deepgram in, Bedrock brain over MCP, Polly out, passcode and limits"`.

---

### Task 4: The Echo Show page

**Files:** Create `src/app/simulator/page.tsx`, `src/components/sim/Simulator.tsx` (client), `src/components/sim/TalkButton.tsx`, `src/components/sim/TrailPanel.tsx`, `src/components/sim/simulator.module.css`; Test: `tests/sim/ui-logic.test.ts` for pure helpers.

**Interfaces:**
- Consumes: `TurnResult`, `TrailEntry`, `ChatMessage`.
- Produces: pure helpers in `src/lib/sim/ui.ts`: `nextHistory(history, heard, reply): ChatMessage[]` (keeps last 20), `trailLabel(entry): string` ("Heard: …", "find_station_story · 118 ms", "Answered from Radio Milwaukee"), `mapsUrl(lat, lng, name)`.

- [ ] **Step 1: Failing tests** for the three helpers (history capped at 20; tool label includes name and ms; maps URL encodes the name and coordinates: `https://www.google.com/maps/search/?api=1&query=43.01,-88.01`).
- [ ] **Step 2: Run → FAIL; implement `src/lib/sim/ui.ts`; PASS.**
- [ ] **Step 3: Build the page** (read `node_modules/next/dist/docs/01-app` for client components first):
  - Dark page; a 1280×800 rounded "device" with a cream screen (Field Guide palette: `#F7F1DB`, ink `#1E2124`, orange `#F7941D`).
  - States: idle (artwork + "Try: …" prompts), listening (pulsing light bar on the screen's bottom edge), thinking (light bar sweeping), answering (captions over the card area).
  - `TalkButton`: hold mouse/space to record with `MediaRecorder` (`audio/webm;codecs=opus`), stop at 15 s; on release POST `FormData` to `/api/sim/turn` with `x-sim-passcode` from `sessionStorage` (prompted once; wrapped in try/catch).
  - Plays `audio` (base64 MP3) through one `<audio>` element; captions show `reply`.
  - Typed backup box (≤ 300 chars), Enter to send.
  - "What Alexa did" toggle opens `TrailPanel` listing `trailLabel` lines; hidden by default for clean video.
  - On load: `fetch("/api/mcp", { method: "POST", … initialize … })` once to warm the server.
  - Accessibility: the talk button is a real `<button>` with `aria-pressed`, space bar works, captions are an `aria-live="polite"` region, everything reachable by keyboard.
- [ ] **Step 4: typecheck, build, lint; commit** — `git commit -m "feat: Echo Show simulator page with hold-to-talk, captions and the 'What Alexa did' trail"`.

---

### Task 5: The story card on the simulator's screen (MCP Apps host)

**Files:** Create `src/components/sim/CardHost.tsx` (client); Modify `src/lib/card.ts` (Play button robustness).

**Interfaces:** Consumes `TurnResult.card`; `GET /api/sim/card` (Task 3); `AppBridge`, `PostMessageTransport` from `@modelcontextprotocol/ext-apps/app-bridge` (constructor `new AppBridge(null, hostInfo, { openLinks: {} })`; `bridge.oninitialized = () => { bridge.sendToolInput({ arguments }); bridge.sendToolResult(result) }`; `await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow))`; `teardownResource` before unmount). Read `node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.d.ts` for exact names before writing.

- [ ] **Step 1: Failing test** in `tests/card.test.ts`: the page's Play handler handles a rejected `play()` (assert the script contains `.catch(` on `audio.play()` and the text "Can't play here").
- [ ] **Step 2: Implement** the `card.ts` fix (from slice 1's deferred minor): `audio.play().then(() => { button.textContent = "❚❚ Pause"; }).catch(() => { button.textContent = "Can't play here"; })`; and post a `window.parent.postMessage({ type: "radio-commons:playing" }, "*")` when playback starts so the host can stop Polly (spec open question 2).
- [ ] **Step 3: `CardHost`:** fetch `/api/sim/card` once; render `<iframe sandbox="allow-scripts" srcDoc={html} title="Story card">`; on each new `card`, create the bridge, connect, send input + result; listen for `radio-commons:playing` and pause the Polly `<audio>`.
- [ ] **Step 4: typecheck, test, build, lint; commit** — `git commit -m "feat: simulator renders the real story card as an MCP Apps host"`.

---

### Task 6: Keys, deploy, live checks, voice

- [ ] **Step 1 (Tarik, PROD):** In AWS (account 953791390715 or any), create IAM user `radio-commons-sim` with an inline policy allowing only `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the Haiku inference profile and its underlying models, and `polly:SynthesizeSpeech` on `*`; create an access key; enable Bedrock model access for Claude Haiku 4.5 in us-east-1 if not already. Tarik adds to Vercel (Production + Preview) with `vercel env add`: `SIM_AWS_ACCESS_KEY_ID`, `SIM_AWS_SECRET_ACCESS_KEY`, `SIM_AWS_REGION=us-east-1`, `DEEPGRAM_API_KEY`, `SIM_PASSCODE` (he picks), `MCP_URL=https://radio-commons.vercel.app/api/mcp`.
- [ ] **Step 2 (PROD):** PR → CI green → merge → `vercel deploy --prod`.
- [ ] **Step 3: Live turn check:** `curl -F text="the frugal dining episode" -H "x-sim-passcode: …" https://radio-commons.vercel.app/api/sim/turn` → reply names This Bites and September 2026, `audio` non-null, `card` present, trail has find + get. Then a recorded clip (`say -o /tmp/q.aiff "What was that This Bites episode about frugal dining?" && ffmpeg -i /tmp/q.aiff /tmp/q.webm`) with `-F audio=@/tmp/q.webm`.
- [ ] **Step 4: Voice pick:** synthesize the same reply with 3 generative voices (e.g. Ruth, Danielle, Matthew); Tarik chooses; set `SIM_POLLY_VOICE`.
- [ ] **Step 5: Browser check (ego-browser):** open `/simulator`, enter passcode, type a question; screenshot idle, thinking, answer with card; click Play in the card; open the trail. Fix anything that looks wrong before calling it done.
- [ ] **Step 6:** Measure 10 typed turns and 3 spoken turns (release → audio start) and record in `docs/LEARNING-LOG.md`.

---

### Task 7: Docs and final review

- [ ] README: "Try the simulator" section (URL, passcode by request, what it shows, why it exists: Amazon's forum answer).
- [ ] `docs/decisions/002-alexa-simulator.md` (decision format; "What actually happened" blank).
- [ ] Learning log entry (latency, what the brain did well/poorly, any trust-rule slips seen in testing).
- [ ] Final whole-branch review (fresh reviewer, most capable model) against this plan's Review Focus; fix Critical/Important test-first; PR, CI, merge, deploy.
