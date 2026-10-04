import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withMcpAuth } from "mcp-handler";
import { gateAuthTools, listenerIdFrom, verifyListenerToken } from "@/lib/listenerAuth";

const ok = async () => new Response("ok", { status: 200 });
const rpc = (name: string, auth?: unknown) => {
  const req = new Request("https://rc.example/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
  if (auth) Object.assign(req, { auth });
  return req;
};

describe("gateAuthTools", () => {
  it("lets anonymous listeners use non-Finds tools", async () => {
    expect((await gateAuthTools(ok)(rpc("find_station_story"))).status).toBe(200);
  });
  it("returns 401 with resource metadata for a Finds tool without a token", async () => {
    const res = await gateAuthTools(ok)(rpc("save_find"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/resource_metadata=".*\/\.well-known\/oauth-protected-resource/);
  });
  it("passes a Finds tool through when the request carries auth", async () => {
    expect((await gateAuthTools(ok)(rpc("list_finds", { extra: { userId: "user_1" } }))).status).toBe(200);
  });
  const batch = (...names: string[]) =>
    new Request("https://rc.example/api/mcp", { method: "POST", body: JSON.stringify(names.map((name, id) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } }))) });
  it("returns 401 for a JSON-RPC batch that includes a Finds tool", async () => {
    expect((await gateAuthTools(ok)(batch("find_station_story", "save_find"))).status).toBe(401);
  });
  it("passes a batch of only anonymous tools through", async () => {
    expect((await gateAuthTools(ok)(batch("find_station_story", "find_song_played"))).status).toBe(200);
  });
  it("says invalid_token when the request carried a bearer that failed verification", async () => {
    const req = new Request(rpc("save_find"), { headers: { authorization: "Bearer junk" } });
    expect((await gateAuthTools(ok)(req)).headers.get("www-authenticate")).toMatch(/^Bearer error="invalid_token", resource_metadata=".*\/\.well-known\/oauth-protected-resource"$/);
  });
  it("leaves error out of the challenge when there was no bearer", async () => {
    expect((await gateAuthTools(ok)(rpc("save_find"))).headers.get("www-authenticate")).toMatch(/^Bearer resource_metadata="/);
  });
  it("passes non-JSON and non-tool requests untouched", async () => {
    expect((await gateAuthTools(ok)(new Request("https://rc.example/api/mcp", { method: "GET" }))).status).toBe(200);
    expect((await gateAuthTools(ok)(new Request("https://rc.example/api/mcp", { method: "POST", body: "not json" }))).status).toBe(200);
  });
});

describe("listenerIdFrom", () => {
  it("reads the Clerk user id from tool extra", () => {
    expect(listenerIdFrom({ authInfo: { extra: { userId: "user_1" } } })).toBe("user_1");
    expect(listenerIdFrom({})).toBeUndefined();
  });
});

describe("verifyListenerToken", () => {
  const ISSUER = "https://issuer.example";
  const CLIENT_ID = "alexa-client";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const now = () => Math.floor(Date.now() / 1000);
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signJwt = (payload: object, { header = { alg: "RS256", typ: "at+jwt", kid: "ins_1" }, key = privateKey } = {}) => {
    const input = `${b64(header)}.${b64(payload)}`;
    return `${input}.${createSign("RSA-SHA256").update(input).sign(key).toString("base64url")}`;
  };
  const claims = (overrides: object = {}) => ({ iss: ISSUER, sub: "user_1", client_id: CLIENT_ID, azp: CLIENT_ID, scope: "openid profile offline_access", iat: now(), exp: now() + 3600, ...overrides });
  const verify = (token?: string) => verifyListenerToken(new Request("https://rc.example/api/mcp", { method: "POST" }), token);

  beforeEach(() => {
    vi.stubEnv("CLERK_LISTENER_ISSUER", ISSUER);
    vi.stubEnv("CLERK_LISTENER_OAUTH_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("CLERK_LISTENER_JWT_KEY", publicKey.export({ type: "spki", format: "pem" }).toString());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a Clerk access token and returns the listener id", async () => {
    const token = signJwt(claims());
    expect(await verify(token)).toEqual({ token, clientId: CLIENT_ID, scopes: ["openid", "profile", "offline_access"], expiresAt: expect.any(Number), extra: { userId: "user_1" } });
  });
  it("accepts a token that carries the client id only in azp", async () => {
    expect((await verify(signJwt(claims({ client_id: undefined }))))?.extra.userId).toBe("user_1");
  });
  it("accepts the PEM with escaped newlines, as env files often store it", async () => {
    vi.stubEnv("CLERK_LISTENER_JWT_KEY", publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "\\n"));
    expect((await verify(signJwt(claims())))?.extra.userId).toBe("user_1");
  });

  it("accepts the typ header in any case", async () => {
    expect((await verify(signJwt(claims(), { header: { alg: "RS256", typ: "AT+JWT", kid: "ins_1" } })))?.extra.userId).toBe("user_1");
  });

  const hs256WithPemSecret = () => {
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const input = `${b64({ alg: "HS256", typ: "at+jwt" })}.${b64(claims())}`;
    return `${input}.${createHmac("sha256", pem).update(input).digest("base64url")}`;
  };

  it.each([
    ["no token", undefined],
    ["four segments", `${signJwt(claims())}.extra`],
    ["HS256 signed with the public key as secret", hs256WithPemSecret()],
    ["garbage", "not-a-jwt"],
    ["three junk segments", "a.b.c"],
    ["wrong issuer", signJwt(claims({ iss: "https://evil.example" }))],
    ["wrong client id", signJwt(claims({ client_id: "someone-else", azp: "someone-else" }))],
    ["expired", signJwt(claims({ exp: now() - 10 }))],
    ["missing exp", signJwt(claims({ exp: undefined }))],
    ["missing sub", signJwt(claims({ sub: undefined }))],
    ["bad signature", signJwt(claims(), { key: other.privateKey })],
    ["alg none", `${b64({ alg: "none", typ: "at+jwt" })}.${b64(claims())}.`],
    ["a session token (not at+jwt)", signJwt(claims(), { header: { alg: "RS256", typ: "JWT", kid: "ins_1" } })],
  ])("treats %s as anonymous", async (_label, token) => {
    expect(await verify(token)).toBeUndefined();
  });

  describe("wired as the route wires it (withMcpAuth, optional)", () => {
    const route = () => withMcpAuth(gateAuthTools(ok), verifyListenerToken, { required: false, resourceMetadataPath: "/.well-known/oauth-protected-resource" });
    const withBearer = (req: Request, token: string) => new Request(req, { headers: { authorization: `Bearer ${token}` } });

    it("serves anonymous tools even with a junk token, and 401s Finds tools", async () => {
      expect((await route()(withBearer(rpc("find_station_story"), "junk"))).status).toBe(200);
      expect((await route()(withBearer(rpc("save_find"), "junk"))).status).toBe(401);
    });
    it("lets a valid listener token through to a Finds tool", async () => {
      expect((await route()(withBearer(rpc("save_find"), signJwt(claims())))).status).toBe(200);
    });
  });

  it("treats every token as anonymous when the env is not configured", async () => {
    vi.stubEnv("CLERK_LISTENER_JWT_KEY", "");
    expect(await verify(signJwt(claims()))).toBeUndefined();
  });
});

describe("/.well-known/oauth-protected-resource", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("points Alexa at the Clerk issuer and lists the scopes it must ask for", async () => {
    vi.stubEnv("CLERK_LISTENER_ISSUER", "https://issuer.example");
    vi.stubEnv("MCP_RESOURCE_URL", "");
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/route");
    const res = GET(new Request("https://rc.example/.well-known/oauth-protected-resource"));
    expect(await res.json()).toEqual({
      resource: "https://rc.example/api/mcp",
      authorization_servers: ["https://issuer.example"],
      scopes_supported: ["openid", "profile", "offline_access"],
    });
  });
});
