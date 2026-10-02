export type ChatMessage = { role: "user" | "assistant"; text: string };

/** One line of the "What Alexa did" panel. */
export type TrailEntry =
  | { kind: "heard"; text: string; ms?: number }
  | { kind: "tool"; name: string; input: Record<string, unknown>; ms: number; isError: boolean; summary: string }
  | { kind: "think"; ms: number }
  | { kind: "stage"; stage: "connect" | "voice"; ms: number }
  | { kind: "reply"; text: string; ms: number; sourced: boolean }
  | { kind: "error"; text: string };

/** The first line of a tool's reply (the spoken one), not the ids it adds for the model. */
export const summarize = (text: string) => {
  const line = text.split("\n")[0];
  return line.length <= 120 ? line : `${line.slice(0, 119)}…`;
};
