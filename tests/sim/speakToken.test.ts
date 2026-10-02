import { describe, expect, it } from "vitest";
import { signSpeech, verifySpeech } from "@/lib/sim/speakToken";

const SECRET = "414-bites";

describe("signed speech links", () => {
  it("round-trips the text within the time limit", () => {
    const token = signSpeech("From This Bites, September 2026.", SECRET, 1_000);
    expect(verifySpeech(token, SECRET, 2_000)).toBe("From This Bites, September 2026.");
  });
  it("refuses a tampered text, a wrong secret, or an expired link", () => {
    const token = signSpeech("hello", SECRET, 1_000);
    const [payload, sig] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ t: "goodbye", e: 61_000 })).toString("base64url")}.${sig}`;
    expect(verifySpeech(tampered, SECRET, 2_000)).toBeNull();
    expect(verifySpeech(token, "other", 2_000)).toBeNull();
    expect(verifySpeech(token, SECRET, 1_000 + 61_000)).toBeNull();
    expect(verifySpeech(`${payload}`, SECRET, 2_000)).toBeNull();
  });
});
