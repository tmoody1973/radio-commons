import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";

const MAX_HISTORY = 20;

/**
 * The conversation the page carries between turns (the server keeps none). Alexa+ keeps tool results in its context;
 * the page keeps only words, so it notes the story on screen to let a follow-up use its id instead of guessing one.
 */
export function nextHistory(history: ChatMessage[], heard: string, reply: string, onScreen?: { storyId: string; title: string }): ChatMessage[] {
  if (!heard) return history;
  const title = onScreen?.title.replace(/["[\]]/g, "");
  const remembered = onScreen ? `${reply} [On screen: "${title}", storyId ${onScreen.storyId}]` : reply;
  return [...history, { role: "user" as const, text: heard }, { role: "assistant" as const, text: remembered }].slice(-MAX_HISTORY);
}

export function trailLabel(entry: TrailEntry): string {
  switch (entry.kind) {
    case "heard":
      return `Heard “${entry.text}”${entry.ms !== undefined ? ` (${entry.ms} ms)` : ""}`;
    case "tool":
      return `${entry.isError ? "⚠ " : ""}Called ${entry.name} · ${entry.ms} ms → ${entry.summary}`;
    case "think":
      return `Thought (${entry.ms} ms)`;
    case "stage":
      return entry.stage === "connect" ? `Connected to the MCP server (${entry.ms} ms)` : `Spoke the answer (${entry.ms} ms)`;
    case "reply":
      return entry.sourced ? `Answered from Radio Milwaukee's record (${entry.ms} ms)` : `Answered without looking anything up (${entry.ms} ms)`;
    case "error":
      return `Problem: ${entry.text}`;
  }
}


/** What the screen shows after a turn: the new card; none if a tool ran and found nothing to show; else the old one. */
export function cardAfterTurn<T>(previous: T | null, next: T | null, trail: TrailEntry[]): T | null {
  if (next) return next;
  return trail.some((entry) => entry.kind === "tool") ? null : previous;
}

/** A Finds tool asked the listener to link their account (refused in the tool, or a 401 from the server). */
export const needsAccountLink = (trail: TrailEntry[]) =>
  trail.some((entry) => entry.kind === "tool" && entry.isError && entry.summary === LINK_ACCOUNT_SPEECH);
