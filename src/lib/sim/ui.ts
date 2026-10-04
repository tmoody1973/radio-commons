import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 2000; // the turn route rejects longer history messages

/**
 * The conversation the page carries between turns (the server keeps none). Alexa+ keeps tool results in its context;
 * the page keeps only words, so it notes the story on screen to let a follow-up use its id instead of guessing one.
 */
interface ShownSong { playId: string; title: string; artist: string }
type OnScreen = { storyId: string; title: string } | { songs: ShownSong[] };

const plain = (text: string) => text.replace(/["[\]]/g, "");

/** What the card showed, in the form the next turn needs: a story's id, or each song's number and playId. */
export function onScreenFrom(structured: Record<string, unknown> | undefined): OnScreen | undefined {
  const story = structured?.story as { storyId: string; title: string } | undefined;
  if (story?.storyId) return { storyId: story.storyId, title: story.title };
  const songs = (structured?.songs ?? structured?.matches) as ShownSong[] | undefined;
  if (Array.isArray(songs) && songs.length) return { songs: songs.map(({ playId, title, artist }) => ({ playId, title, artist })) };
  return undefined;
}

function screenNote(onScreen: OnScreen): string {
  if ("storyId" in onScreen) return `"${plain(onScreen.title)}", storyId ${onScreen.storyId}`;
  return onScreen.songs.map((song, i) => `${i + 1}. "${plain(song.title)}" by ${plain(song.artist)}, playId ${song.playId}`).join("; ");
}

/** Alexa+ keeps tool results in the conversation; the simulator keeps what was on screen, ids included. */
export function nextHistory(history: ChatMessage[], heard: string, reply: string, onScreen?: OnScreen): ChatMessage[] {
  if (!heard) return history;
  const note = onScreen ? ` [On screen: ${screenNote(onScreen)}]` : "";
  // Trim the spoken reply, never the ids: they are what the next turn needs.
  const remembered = `${reply.slice(0, Math.max(0, MAX_MESSAGE_CHARS - note.length))}${note}`.slice(0, MAX_MESSAGE_CHARS);
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
