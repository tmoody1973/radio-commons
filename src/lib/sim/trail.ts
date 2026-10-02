export type ChatMessage = { role: "user" | "assistant"; text: string };

/** One line of the "What Alexa did" panel. */
export type TrailEntry =
  | { kind: "heard"; text: string; ms?: number }
  | { kind: "tool"; name: string; input: Record<string, unknown>; ms: number; isError: boolean; summary: string }
  | { kind: "reply"; text: string; ms: number }
  | { kind: "error"; text: string };

export const summarize = (text: string) => (text.length <= 120 ? text : `${text.slice(0, 119)}…`);
