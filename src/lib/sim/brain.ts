import { BedrockRuntimeClient, ConverseCommand, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import type { McpTool, McpToolResult } from "@/lib/sim/mcpClient";
import { summarize, type ChatMessage, type TrailEntry } from "@/lib/sim/trail";

/** The trust rules from slice 1, given to the model that plays Alexa+. */
export const SYSTEM_PROMPT = `You are playing Alexa+ on an Echo Show, using Radio Milwaukee's story tools.
Answer only from the results of your tools. For a story the listener describes, call find_station_story; when one story matches (or the listener picks one), call get_station_story and speak its answer.
Always say the show and the month. Describe summaries as Radio Milwaukee's, not your own.
If a tool finds nothing or apologizes, say exactly that and stop. Never answer questions about local stories, people or places from your own knowledge.
Keep replies short and natural for speaking: at most two sentences (about 45 words), no markdown. Never list more than two places; if there are more, say "and more" (the screen shows them all). End with the one offer the tool suggests.`;

export const APOLOGY = "Sorry, something went wrong. Please try again.";

type ToolUse = { toolUseId: string; name: string; input: Record<string, unknown> };
type Block = { text: string } | { toolUse: ToolUse };
export type Converse = (request: { system: string; messages: unknown[]; tools: McpTool[] }) => Promise<{ stopReason: string; content: Block[] }>;

interface BrainOptions {
  history: ChatMessage[];
  tools: McpTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  converse: Converse;
  maxToolCalls?: number;
  deadlineMs?: number;
}

export interface BrainResult {
  reply: string;
  trail: TrailEntry[];
  /** The last get_station_story result, for the story card. */
  lastStory: Record<string, unknown> | null;
}

function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("the turn took longer than its time limit"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("the turn took longer than its time limit")), remaining);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The Alexa+ role: let the model call our MCP tools until it answers, within a call cap and a time limit. */
export async function runBrain({ history, tools, callTool, converse, maxToolCalls = 4, deadlineMs = 15_000 }: BrainOptions): Promise<BrainResult> {
  const deadline = Date.now() + deadlineMs;
  const trail: TrailEntry[] = [];
  const messages: unknown[] = history.map((m) => ({ role: m.role, content: [{ text: m.text }] }));
  let lastStory: Record<string, unknown> | null = null;
  let toolCalls = 0;
  let sourced = false; // did any tool answer successfully this turn?
  try {
    for (;;) {
      const started = Date.now();
      const response = await withDeadline(converse({ system: SYSTEM_PROMPT, messages, tools }), deadline);
      trail.push({ kind: "think", ms: Date.now() - started });
      messages.push({ role: "assistant", content: response.content });
      const uses = response.content.flatMap((b) => ("toolUse" in b ? [b.toolUse] : []));
      if (uses.length === 0) {
        const reply = response.content.flatMap((b) => ("text" in b ? [b.text] : [])).join(" ").trim();
        trail.push({ kind: "reply", text: reply, ms: Date.now() - started, sourced });
        return { reply: reply || APOLOGY, trail, lastStory };
      }
      const results = [];
      for (const use of uses) {
        if (toolCalls >= maxToolCalls) throw new Error(`stopped after ${maxToolCalls} tool calls`);
        toolCalls++;
        const t0 = Date.now();
        const result = await withDeadline(callTool(use.name, use.input), deadline);
        trail.push({ kind: "tool", name: use.name, input: use.input, ms: Date.now() - t0, isError: result.isError, summary: summarize(result.text) });
        if (!result.isError) sourced = true;
        if (use.name === "get_station_story" && result.structured?.story) lastStory = result.structured;
        results.push({ toolResult: { toolUseId: use.toolUseId, content: [{ text: result.text }], status: result.isError ? "error" : "success" } });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    trail.push({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    return { reply: APOLOGY, trail, lastStory };
  }
}

/** Bedrock Converse, offering our MCP tools as Bedrock tools (their JSON Schemas pass straight through). */
export function bedrockConverse(client: BedrockRuntimeClient, modelId: string): Converse {
  return async ({ system, messages, tools }) => {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: messages as Message[],
        inferenceConfig: { maxTokens: 200, temperature: 0.2 },
        toolConfig: {
          tools: tools.map((t): Tool => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema as never } } })),
        },
      }),
    );
    return { stopReason: response.stopReason ?? "", content: (response.output?.message?.content ?? []) as Block[] };
  };
}
