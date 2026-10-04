import { describe, expect, it, vi } from "vitest";
import { verifySpeech } from "@/lib/sim/speakToken";
import { handleTurn, isStopCommand, type TurnDeps } from "@/lib/sim/turn";

const deps = (over: Partial<TurnDeps> = {}): TurnDeps => ({
  passcode: "milwaukee",
  speechSecret: "a-separate-high-entropy-secret",
  transcribe: vi.fn(async () => "the frugal dining episode"),
  mcp: async () => ({
    tools: [],
    callTool: async () => ({ text: "x", structured: null, isError: false }),
    readCard: async () => "",
    close: async () => {},
  }),
  converse: async () => ({ stopReason: "end_turn", content: [{ text: "From This Bites, September 2026: frugal dining." }] }),
  ...over,
});
const clip = { bytes: new Uint8Array(1000), contentType: "audio/webm" };

describe("a spoken turn", () => {
  it("hears, answers and speaks", async () => {
    const { status, body } = await handleTurn({ passcode: "milwaukee", history: [], audio: clip }, deps());
    expect(status).toBe(200);
    expect(body).toMatchObject({ heard: "the frugal dining episode", reply: "From This Bites, September 2026: frugal dining." });
    // The voice comes from a signed link the page streams, so captions appear before the audio is made.
    expect(verifySpeech((body as { speech: string }).speech, "a-separate-high-entropy-secret")).toBe("From This Bites, September 2026: frugal dining.");
    // Never signed with the passcode: a leaked link must not help anyone guess it.
    expect(verifySpeech((body as { speech: string }).speech, "milwaukee")).toBeNull();
  });
  it("refuses without the passcode, before any paid call", async () => {
    const d = deps();
    expect((await handleTurn({ passcode: "nope", history: [], audio: clip }, d)).status).toBe(401);
    expect((await handleTurn({ passcode: null, history: [], audio: clip }, d)).status).toBe(401);
    expect(d.transcribe).not.toHaveBeenCalled();
  });
  it("refuses an oversized clip or long text", async () => {
    expect((await handleTurn({ passcode: "milwaukee", history: [], audio: { bytes: new Uint8Array(1_100_000), contentType: "audio/webm" } }, deps())).status).toBe(413);
    expect((await handleTurn({ passcode: "milwaukee", history: [], text: "x".repeat(301) }, deps())).status).toBe(413);
  });
  it("refuses a turn with neither audio nor text", async () => {
    expect((await handleTurn({ passcode: "milwaukee", history: [] }, deps())).status).toBe(400);
  });
  it("empty transcript: 'didn't catch that', no model call", async () => {
    const converse = vi.fn();
    const { body } = await handleTurn({ passcode: "milwaukee", history: [], audio: clip }, deps({ transcribe: async () => "  ", converse }));
    expect(body).toMatchObject({ reply: "Sorry, I didn't catch that." });
    expect(converse).not.toHaveBeenCalled();
  });
  it("speech-to-text failure: 'didn't catch that', with the cause in the trail", async () => {
    const { body } = await handleTurn({ passcode: "milwaukee", history: [], audio: clip }, deps({ transcribe: async () => { throw new Error("deepgram 503"); } }));
    expect(body).toMatchObject({ reply: "Sorry, I didn't catch that." });
    expect((body as { trail: unknown[] }).trail[0]).toMatchObject({ kind: "error", text: expect.stringContaining("deepgram 503") });
  });
  it("sends only the last 20 messages of history to the model", async () => {
    const seen: unknown[][] = [];
    const history = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `m${i}` }));
    await handleTurn({ passcode: "milwaukee", history, text: "hi" }, deps({ converse: async ({ messages }) => { seen.push([...messages]); return { stopReason: "end_turn", content: [{ text: "ok" }] }; } }));
    expect(seen[0].length).toBeLessThanOrEqual(21);
    expect(seen[0][0]).toMatchObject({ role: "user" }); // Bedrock requires the conversation to start with the listener
  });
  it("times connecting to the MCP server", async () => {
    const { body } = await handleTurn({ passcode: "milwaukee", history: [], text: "frugal dining" }, deps());
    const kinds = (body as { trail: { kind: string; stage?: string }[] }).trail.filter((e) => e.kind === "stage").map((e) => e.stage);
    expect(kinds).toEqual(["connect"]);
  });
  it("connects with the listener's access token when linked, anonymously otherwise", async () => {
    const base = deps();
    const mcp = vi.fn(base.mcp);
    await handleTurn({ passcode: "milwaukee", history: [], text: "what's in my Finds?", accessToken: "at" }, deps({ mcp }));
    await handleTurn({ passcode: "milwaukee", history: [], text: "what's in my Finds?" }, deps({ mcp }));
    expect(mcp.mock.calls).toEqual([["at"], [undefined]]);
  });
  it("MCP server unreachable: Alexa's apology with the cause in the trail, not a crash", async () => {
    const { status, body } = await handleTurn({ passcode: "milwaukee", history: [], text: "frugal dining" }, deps({ mcp: async () => { throw new Error("ECONNREFUSED"); } }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ reply: "Sorry, something went wrong. Please try again.", card: null });
    expect((body as { trail: { kind: string; text?: string }[] }).trail.some((e) => e.kind === "error" && e.text?.includes("ECONNREFUSED"))).toBe(true);
  });
  it("'stop', 'pause' or 'Alexa, stop' pauses the card's audio on the device, without asking the AI", async () => {
    for (const text of ["Alexa, stop.", "stop audio", "Pause", "pause the episode", "stop playing"]) {
      let asked = false;
      const { body } = await handleTurn({ passcode: "milwaukee", history: [], text }, deps({ converse: async () => { asked = true; throw new Error("should not be called"); } }));
      expect(asked).toBe(false);
      expect(body).toMatchObject({ reply: "Paused.", control: "pause", card: null });
    }
  });
  it("a question that merely contains 'stop' still goes to Alexa", () => {
    expect(isStopCommand("what's the stop near the cafe")).toBe(false);
    expect(isStopCommand("Alexa stop")).toBe(true);
  });
});
