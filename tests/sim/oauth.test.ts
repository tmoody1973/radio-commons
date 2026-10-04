import { describe, expect, it } from "vitest";
import { authorizeUrl, discover, exchangeCode, pkcePair, refreshTokens } from "@/lib/sim/oauth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("oauth helpers", () => {
  it("discovers the auth server from the MCP server's protected-resource document", async () => {
    const fetchFake = async (url: string | URL | Request) => {
      const u = String(url);
      if (u === "https://rc.example/.well-known/oauth-protected-resource") return json({ resource: "https://rc.example/api/mcp", authorization_servers: ["https://auth.example"] });
      if (u === "https://auth.example/.well-known/oauth-authorization-server") return json({ authorization_endpoint: "https://auth.example/oauth/authorize", token_endpoint: "https://auth.example/oauth/token", code_challenge_methods_supported: ["S256"] });
      return json({}, 404);
    };
    await expect(discover("https://rc.example/api/mcp", fetchFake as typeof fetch)).resolves.toEqual({
      authorizationEndpoint: "https://auth.example/oauth/authorize",
      tokenEndpoint: "https://auth.example/oauth/token",
      resource: "https://rc.example/api/mcp",
    });
  });

  it("falls back to OpenID discovery when the OAuth metadata is missing", async () => {
    const fetchFake = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith("oauth-protected-resource")) return json({ resource: "https://rc.example/api/mcp", authorization_servers: ["https://auth.example"] });
      if (u === "https://auth.example/.well-known/openid-configuration") return json({ authorization_endpoint: "https://auth.example/a", token_endpoint: "https://auth.example/t", code_challenge_methods_supported: ["S256"] });
      return json({}, 404);
    };
    await expect(discover("https://rc.example/api/mcp", fetchFake as typeof fetch)).resolves.toMatchObject({ tokenEndpoint: "https://auth.example/t" });
  });

  it("refuses an auth server that doesn't advertise S256", async () => {
    const fetchFake = async (url: string | URL | Request) =>
      String(url).includes("protected-resource") ? json({ resource: "r", authorization_servers: ["https://a"] }) : json({ authorization_endpoint: "x", token_endpoint: "y", code_challenge_methods_supported: ["plain"] });
    await expect(discover("https://rc.example/api/mcp", fetchFake as typeof fetch)).rejects.toThrow(/S256/);
  });

  it("makes a PKCE pair whose challenge is the S256 of the verifier", async () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    expect(challenge).toBe(digest);
  });

  it("builds an authorize URL with PKCE, state, scopes and resource", () => {
    const url = new URL(authorizeUrl({ authorizationEndpoint: "https://a/authorize", clientId: "cid", redirectUri: "https://rc/cb", challenge: "ch", state: "st", resource: "https://rc/api/mcp" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code", client_id: "cid", redirect_uri: "https://rc/cb", scope: "openid profile offline_access",
      code_challenge: "ch", code_challenge_method: "S256", state: "st", resource: "https://rc/api/mcp",
    });
  });

  it("exchanges a code and refreshes, computing expiresAt", async () => {
    const seen: URLSearchParams[] = [];
    const fetchFake = async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new URLSearchParams(String(init?.body)));
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer" });
    };
    const now = () => 1_000_000;
    const tokens = await exchangeCode({ tokenEndpoint: "https://a/token", clientId: "cid", clientSecret: "sec", code: "c", verifier: "v", redirectUri: "https://rc/cb", resource: "r", fetch: fetchFake as unknown as typeof fetch, now });
    expect(tokens).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 1_000_000 + 3_600_000 });
    expect(seen[0].get("grant_type")).toBe("authorization_code");
    expect(seen[0].get("code_verifier")).toBe("v");
    const refreshed = await refreshTokens({ tokenEndpoint: "https://a/token", clientId: "cid", clientSecret: "sec", refreshToken: "rt", fetch: fetchFake as unknown as typeof fetch, now });
    expect(seen[1].get("grant_type")).toBe("refresh_token");
    expect(refreshed.accessToken).toBe("at");
  });

  it("authenticates with HTTP Basic and never puts the secret in the body", async () => {
    let init: RequestInit | undefined;
    const fetchFake = async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return json({ access_token: "at", refresh_token: "rt", expires_in: 60 });
    };
    await exchangeCode({ tokenEndpoint: "https://a/token", clientId: "cid", clientSecret: "sec", code: "c", verifier: "v", redirectUri: "u", resource: "r", fetch: fetchFake as unknown as typeof fetch });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    expect(new Headers(init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(String(init?.body)).not.toContain("sec");
  });

  it("keeps the old refresh token when a refresh response omits a new one, and stores a rotated one", async () => {
    const omit = async () => json({ access_token: "at2", expires_in: 60 });
    expect((await refreshTokens({ tokenEndpoint: "t", clientId: "c", clientSecret: "s", refreshToken: "old", fetch: omit as unknown as typeof fetch })).refreshToken).toBe("old");
    const rotate = async () => json({ access_token: "at2", refresh_token: "new", expires_in: 60 });
    expect((await refreshTokens({ tokenEndpoint: "t", clientId: "c", clientSecret: "s", refreshToken: "old", fetch: rotate as unknown as typeof fetch })).refreshToken).toBe("new");
  });

  it("throws (without echoing secrets) when the token endpoint refuses", async () => {
    const fetchFake = async () => json({ error: "invalid_grant" }, 400);
    const exchange = exchangeCode({ tokenEndpoint: "https://a/token", clientId: "cid", clientSecret: "sec", code: "c", verifier: "v", redirectUri: "u", resource: "r", fetch: fetchFake as unknown as typeof fetch });
    await expect(exchange).rejects.toThrow(/invalid_grant/);
    await expect(exchange).rejects.toThrow(/^token endpoint: invalid_grant$/); // the OAuth code only, no request values
  });
});
