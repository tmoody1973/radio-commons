import { describe, expect, it, vi } from "vitest";
import { handleSpeak } from "@/lib/sim/speak";
import { signSpeech } from "@/lib/sim/speakToken";

const SECRET = "milwaukee";
const stream = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } });

describe("streaming the spoken reply", () => {
  it("streams Polly's audio for a valid link", async () => {
    const synthesize = vi.fn(async () => stream());
    const response = await handleSpeak(signSpeech("Hello from This Bites.", SECRET), { secret: SECRET, synthesize });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(synthesize).toHaveBeenCalledWith("Hello from This Bites.");
  });
  it("refuses a bad or expired link before calling Polly", async () => {
    const synthesize = vi.fn();
    expect((await handleSpeak("nonsense", { secret: SECRET, synthesize })).status).toBe(403);
    expect((await handleSpeak(signSpeech("hi", SECRET, Date.now() - 120_000), { secret: SECRET, synthesize })).status).toBe(403);
    expect(synthesize).not.toHaveBeenCalled();
  });
  it("voice unavailable: a 502 the page turns into captions-only", async () => {
    const response = await handleSpeak(signSpeech("hi", SECRET), { secret: SECRET, synthesize: async () => { throw new Error("polly down"); } });
    expect(response.status).toBe(502);
  });
});
