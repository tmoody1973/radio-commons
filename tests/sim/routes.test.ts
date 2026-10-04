import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as linkCallback } from "@/app/api/sim/link/callback/route";
import { GET as linkStart } from "@/app/api/sim/link/start/route";
import { POST as turn } from "@/app/api/sim/turn/route";
import { LINK_COOKIE, sealSession, SESSION_COOKIE } from "@/lib/sim/session";

const SECRET = randomBytes(32).toString("base64");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SIM_PASSCODE", "right");
  vi.stubEnv("SIM_SESSION_SECRET", SECRET);
  vi.stubEnv("CLERK_LISTENER_OAUTH_CLIENT_ID", "client");
  vi.stubEnv("CLERK_LISTENER_OAUTH_CLIENT_SECRET", "client-secret");
  vi.stubEnv("SIM_PUBLIC_ORIGIN", "https://sim.example");
  vi.stubEnv("MCP_URL", "https://rc.example/api/mcp");
  fetchSpy = vi.fn(async () => json({}, 404));
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const failedLocation = "https://sim.example/simulator?link=failed";

describe("GET /api/sim/link/start", () => {
  it("sends a wrong passcode back to the simulator without calling out", async () => {
    const response = await linkStart(new NextRequest("https://sim.example/api/sim/link/start?passcode=wrong"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(failedLocation);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends malformed auth server metadata back to the simulator", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) =>
      String(url).includes("protected-resource")
        ? json({ resource: "https://rc.example/api/mcp", authorization_servers: ["https://auth.example"] })
        : json({ code_challenge_methods_supported: ["S256"] }),
    );
    const response = await linkStart(new NextRequest("https://sim.example/api/sim/link/start?passcode=right"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(failedLocation);
  });
});

describe("GET /api/sim/link/callback", () => {
  it("refuses a state mismatch, clears the link cookie and never exchanges the code", async () => {
    const sealed = sealSession({ verifier: "v", state: "A" }, SECRET);
    const request = new NextRequest("https://sim.example/api/sim/link/callback?code=c&state=B", { headers: { cookie: `${LINK_COOKIE}=${sealed}` } });
    const response = await linkCallback(request);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(failedLocation);
    expect(response.cookies.get(LINK_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/sim/turn", () => {
  it("checks the passcode before refreshing a linked listener's tokens", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "dg");
    vi.stubEnv("SIM_AWS_ACCESS_KEY_ID", "id");
    vi.stubEnv("SIM_AWS_SECRET_ACCESS_KEY", "secret");
    const expired = sealSession({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() - 1000 }, SECRET);
    const form = new FormData();
    form.set("text", "hello");
    form.set("history", "[]");
    const request = new NextRequest("https://sim.example/api/sim/turn", {
      method: "POST",
      body: form,
      headers: { "x-sim-passcode": "wrong", cookie: `${SESSION_COOKIE}=${expired}` },
    });
    const response = await turn(request);
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
