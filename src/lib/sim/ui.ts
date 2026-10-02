import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";

const MAX_HISTORY = 20;

/** The conversation the page carries between turns (the server keeps none). */
export function nextHistory(history: ChatMessage[], heard: string, reply: string): ChatMessage[] {
  if (!heard) return history;
  return [...history, { role: "user" as const, text: heard }, { role: "assistant" as const, text: reply }].slice(-MAX_HISTORY);
}

export function trailLabel(entry: TrailEntry): string {
  switch (entry.kind) {
    case "heard":
      return `Heard “${entry.text}”${entry.ms !== undefined ? ` (${entry.ms} ms)` : ""}`;
    case "tool":
      return `${entry.isError ? "⚠ " : ""}Called ${entry.name} · ${entry.ms} ms → ${entry.summary}`;
    case "reply":
      return `Answered from Radio Milwaukee's record (${entry.ms} ms)`;
    case "error":
      return `Problem: ${entry.text}`;
  }
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}
