import { describe, expect, it } from "vitest";
import { handleConnect } from "@/app/api/connect/apple-music/route";
import { PlaylistUnavailable } from "@/lib/playlist";

const noop = async () => {};

describe("POST /api/connect/apple-music", () => {
  it("rejects a signed-out request", async () => {
    expect((await handleConnect({ userId: null, body: { musicUserToken: "t" }, connect: noop })).status).toBe(401);
  });
  it("rejects a missing or oversized token", async () => {
    expect((await handleConnect({ userId: "u", body: {}, connect: noop })).status).toBe(400);
    expect((await handleConnect({ userId: "u", body: null, connect: noop })).status).toBe(400);
    expect((await handleConnect({ userId: "u", body: { musicUserToken: "x".repeat(5000) }, connect: noop })).status).toBe(400);
  });
  it("stores the token for the signed-in listener", async () => {
    const calls: string[] = [];
    const res = await handleConnect({ userId: "user_1", body: { musicUserToken: "mut" }, connect: async (id, token) => { calls.push(`${id}:${token}`); } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: true });
    expect(calls).toEqual(["user_1:mut"]);
  });
  it("rejects a cross-origin request without connecting", async () => {
    const calls: string[] = [];
    const res = await handleConnect({
      userId: "user_1", body: { musicUserToken: "mut" }, origin: "https://evil.example", siteOrigin: "https://radio-commons.vercel.app",
      connect: async (id) => { calls.push(id); },
    });
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
  it("accepts a same-origin request and one with no Origin header", async () => {
    const same = await handleConnect({ userId: "u", body: { musicUserToken: "t" }, origin: "https://a.test", siteOrigin: "https://a.test", connect: noop });
    const none = await handleConnect({ userId: "u", body: { musicUserToken: "t" }, origin: null, siteOrigin: "https://a.test", connect: noop });
    expect([same.status, none.status]).toEqual([200, 200]);
  });
  it("answers 503 with a generic message when the playlist is unavailable", async () => {
    const res = await handleConnect({
      userId: "u", body: { musicUserToken: "secret-mut" },
      connect: async () => { throw new PlaylistUnavailable("appleMusicLinks:connect failed", { cause: new Error("secret-mut") }); },
    });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("secret-mut");
  });
});
