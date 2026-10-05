import { describe, expect, it } from "vitest";
import { openSession, sealSession } from "@/lib/sim/session";

const secret = Buffer.alloc(32, 3).toString("base64");

describe("session cookie", () => {
  it("round-trips and hides the contents", () => {
    // Long, distinctive values: random ciphertext can't contain them by chance (a 2-letter "at" sometimes did).
    const tokens = { accessToken: "access-token-plaintext-1", refreshToken: "refresh-token-plaintext-2", expiresAt: 5 };
    const sealed = sealSession(tokens, secret);
    expect(sealed).not.toContain(tokens.accessToken);
    expect(sealed).not.toContain(tokens.refreshToken);
    expect(openSession(sealed, secret)).toEqual(tokens);
  });
  it("returns null for tampered, garbage, or wrong-secret cookies", () => {
    const sealed = sealSession({ accessToken: "at", refreshToken: "rt", expiresAt: 5 }, secret);
    expect(openSession(sealed.slice(0, -2) + "xx", secret)).toBeNull();
    expect(openSession("garbage", secret)).toBeNull();
    expect(openSession(sealed, Buffer.alloc(32, 4).toString("base64"))).toBeNull();
  });
  it("refuses a secret that isn't 32 bytes", () => {
    expect(() => sealSession({ a: 1 }, Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(openSession("anything", "")).toBeNull();
  });
});
