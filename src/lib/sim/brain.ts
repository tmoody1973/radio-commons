import { BedrockRuntimeClient, ConverseCommand, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import type { McpTool, McpToolResult } from "@/lib/sim/mcpClient";
import { summarize, type ChatMessage, type TrailEntry } from "@/lib/sim/trail";

/** What the listener hears and reads: no "[On screen: …]" notes (context for the model) and no markdown asterisks. */
export function spokenReply(text: string): string {
  return text.replace(/\s*\[On screen:[^\]]*\]/g, "").replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1").trim();
}

const MILWAUKEE_TIME_ZONE = "America/Chicago";

/** A real Alexa knows the date; without this line the model asks the listener for it. */
function milwaukeeNow(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: MILWAUKEE_TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(now).map((part) => [part.type, part.value]),
  );
  const meridiem = parts.dayPeriod.toLowerCase().startsWith("a") ? "a.m." : "p.m.";
  return `${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute} ${meridiem}`;
}

/** Which Echo the simulator plays: a Show has a screen for cards; a Dot is a speaker, so only the spoken answer exists. */
export type Device = "show" | "dot";

// Alexa+ knows its own device; these are the only rules that change with it.
const DEVICE_RULES: Record<Device, { device: string; give: string; play: string; cantDo: string }> = {
  show: {
    device: "an Echo Show",
    give: "tell the listener to pick a level on the screen.",
    play: "so its card with ▶ is on screen; then tell them to tap it.",
    cantDo: "You can't start audio or open maps yourself: to play, tell the listener to tap ▶ on the screen; for directions, tell them to tap Directions or a place on the screen; to save an event, tell them to tap Add to calendar; to book a table, tell them to tap Reserve (shown when the restaurant takes reservations). For a Milwaukee Music Premiere, tell them to tap Play song to hear the track; a Studio Milwaukee Session is watched on the station's page (tap Watch on radiomilwaukee.org).",
  },
  dot: {
    device: "an Echo Dot, a smart speaker with no screen: the listener only hears you",
    give: "it also names radiomilwaukee.org slash give, the way to give from a speaker.",
    play: "and say what it is and that it's on radiomilwaukee.org.",
    cantDo: "Nothing is shown and nothing can be pressed on this speaker, so never mention a screen, a card, buttons or touching anything. You can't play a story or open maps here: say where to find it (radiomilwaukee.org) and, for directions, the address.",
  },
};

/** The trust rules from slice 1, given to the model that plays Alexa+, led by the current Milwaukee date and time. */
export const systemPrompt = (now: Date, device: Device = "show"): string => {
  const rules = DEVICE_RULES[device];
  return `Right now in Milwaukee it is ${milwaukeeNow(now)} (${MILWAUKEE_TIME_ZONE}).
You are playing Alexa+ on ${rules.device}, using Radio Milwaukee's story tools.
Answer only from the results of your tools. For any question about a Milwaukee place, person, business or event, or a story the listener describes, call find_station_story first (Radio Milwaukee may have covered it) before saying you don't know; when one story matches (or the listener picks one), call get_station_story and speak its answer.
For a question about details inside a story the listener has found, call ask_station_story and quote its passage word for word, with the time, even if it is longer than the two-sentence limit below.
For "what can you do", "help", "what can Radio Milwaukee do" or "how do I use this", call what_can_you_do and speak its summary; if they then say "tell me more", describe its capabilities two at a time, each with its example.
Only when the listener says me, my or I follow ("what's new for me", "my artists", "do any artists I follow have concerts"), call whats_new_for_me. For artists the station plays ("any 88Nine artists have concerts coming up", "artists you play", "artists on HYFIN", "who's touring"), call station_artist_shows with that station (none for all of Radio Milwaukee), never whats_new_for_me. For "the latest episode/story" or "any new episodes of [show]", call latest_station_stories (with the show if named). When you read a list, keep the tool's order and numbers (the listener picks by them) and never call one newer or older unless the tool says so. When the listener asks where a story's places are, call get_station_story with view "places"; it shows them numbered on a map.
For general events not tied to the station's artists ("what's on tonight", "live music this weekend", "anything free"), call find_events; for events "tonight / today / tomorrow / this weekend / this week", call find_events with that when, and never ask the listener for today's date; for "near there" or "near [a place in the story]", pass nearStoryId from the story being discussed (and nearPlace if they named one). For "what is Radio Milwaukee recommending", call station_picks. For "what's new at Radio Milwaukee this week" or "what's happening at the station", call station_briefing and speak its answer; when the listener picks an item, open it the way its button does (the story by name with find_station_story, or station_picks) and never add to the newsletter's own sentences; for a Read item, say it's on radiomilwaukee.org. Always say each event's venue and day/time, as the tool does.
For "I want to support Radio Milwaukee", "donate" or "become a member", call support_radio_milwaukee and speak its reply (it says it's a demo); ${rules.give} For "upgrade me to Front Row" or one named level, call support_radio_milwaukee with that level (ga, main-floor, front-row, vip). For "am I a member", "what's my membership" or "when does my membership renew", call my_membership and speak its reply. For "cancel my membership", call cancel_membership without confirmed and ask its question; only after the listener says yes, call it again with confirmed true.
For what's on or playing right now ("what's on now", "what's playing on HYFIN") or to listen to a station ("listen to 88Nine", "play HYFIN", "put on Rhythm Lab"), call on_air_now (with the station if named) and speak its answer; for "the last 5 songs" or "what did you just play", call recent_songs. For who's on or hosting ("who's on 88Nine", "who's the DJ"), when a show or host is on ("when is Rhythm Lab on", "when is Erin Wolf on"), "did I miss [show]" or "what's on tonight on 88Nine", call station_schedule (query = the show or host named; Rhythm Lab Radio is an 88Nine show); for what song is playing, call on_air_now. After on_air_now, for "save the HYFIN song" call save_find with that station; for "save number 2" pass number 2; for "save that song" or "save it" when several stations were named, call save_find with no song details (it asks which station) and never guess one.
When the listener asks to play or hear something else (a song, a premiere, an episode, a session), call find_station_story with what they named, then get_station_story for the match, ${rules.play} Never answer a play request without looking it up first.
${rules.cantDo} Never sing or quote song lyrics.
Story ids come only from tool results or an earlier "[On screen: …, storyId …]" note (the simulator's record of earlier tool results, on every device); never guess a storyId, and never read ids or those notes aloud. If you have no id for the story, call find_station_story with its title first.
Always say the show and the month. Describe summaries as Radio Milwaukee's, not your own.
If a tool finds nothing or apologizes, say exactly that and stop. Never answer questions about local stories, people or places from your own knowledge.
Keep replies short and natural for speaking: at most two sentences (about 45 words), no markdown. Never list more than two places; if there are more, say "and more". End with the one offer the tool suggests.
When a tool's reply offers the next ones ("Want the next two?") and the listener says yes, more, the next ones or keep going, call the same tool again with the same arguments and the next page (page 2, then 3); numbers keep counting, so "save number 5" still means the fifth song.`;
};

export const APOLOGY = "Sorry, something went wrong. Please try again.";

type ToolUse = { toolUseId: string; name: string; input: Record<string, unknown> };
type Block = { text: string } | { toolUse: ToolUse };
export type Converse = (request: { system: string; messages: unknown[]; tools: McpTool[] }) => Promise<{ stopReason: string; content: Block[] }>;

interface BrainOptions {
  history: ChatMessage[];
  tools: McpTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  converse: Converse;
  now?: () => Date;
  device?: Device;
  maxToolCalls?: number;
  deadlineMs?: number;
}

export interface BrainResult {
  reply: string;
  trail: TrailEntry[];
  /** The last tool result that carries a card (structuredContent.cardHtml), for the screen. */
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
export async function runBrain({ history, tools, callTool, converse, now = () => new Date(), device = "show", maxToolCalls = 4, deadlineMs = 15_000 }: BrainOptions): Promise<BrainResult> {
  const deadline = Date.now() + deadlineMs;
  const trail: TrailEntry[] = [];
  const messages: unknown[] = history.map((m) => ({ role: m.role, content: [{ text: m.text }] }));
  let lastStory: Record<string, unknown> | null = null;
  let toolCalls = 0;
  let sourced = false; // did any tool answer successfully this turn?
  try {
    for (;;) {
      const started = Date.now();
      const response = await withDeadline(converse({ system: systemPrompt(now(), device), messages, tools }), deadline);
      trail.push({ kind: "think", ms: Date.now() - started });
      messages.push({ role: "assistant", content: response.content });
      const uses = response.content.flatMap((b) => ("toolUse" in b ? [b.toolUse] : []));
      if (uses.length === 0) {
        // The page's "[On screen: …]" notes are context for the model, never words for the listener.
        const reply = spokenReply(response.content.flatMap((b) => ("text" in b ? [b.text] : [])).join(" "));
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
        // Whatever the tool put on screen (a story, a quote, a list, a map) is what the card shows.
        if (typeof result.structured?.cardHtml === "string") lastStory = result.structured;
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
