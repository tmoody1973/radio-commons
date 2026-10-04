import { createHash, randomBytes } from "node:crypto";

/** The simulator's half of Alexa+ account linking: OAuth 2.1 authorization code + PKCE against the listener Clerk app. */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface AuthServer {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string;
}

// Alexa asks for exactly these (B3 advertises them as scopes_supported).
const SCOPES = "openid profile offline_access";

async function getJson(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
}

/** Finds the auth server the way an MCP client does: the MCP server's protected-resource document names it. */
export async function discover(mcpUrl: string, fetchImpl: typeof fetch = fetch): Promise<AuthServer> {
  const protectedResource = await getJson(new URL("/.well-known/oauth-protected-resource", mcpUrl).toString(), fetchImpl);
  const issuer = (protectedResource?.authorization_servers as unknown[] | undefined)?.[0];
  if (typeof issuer !== "string" || !issuer) throw new Error("MCP server names no authorization server");
  const base = issuer.replace(/\/$/, "");
  const metadata =
    (await getJson(`${base}/.well-known/oauth-authorization-server`, fetchImpl)) ?? (await getJson(`${base}/.well-known/openid-configuration`, fetchImpl));
  if (!metadata) throw new Error("Auth server metadata not found");
  const methods = metadata.code_challenge_methods_supported;
  if (!Array.isArray(methods) || !methods.includes("S256")) throw new Error("Auth server does not support PKCE S256");
  const { authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint } = metadata;
  if (typeof authorizationEndpoint !== "string" || !authorizationEndpoint) throw new Error("Auth server metadata has no authorization_endpoint");
  if (typeof tokenEndpoint !== "string" || !tokenEndpoint) throw new Error("Auth server metadata has no token_endpoint");
  return {
    authorizationEndpoint,
    tokenEndpoint,
    resource: typeof protectedResource?.resource === "string" ? protectedResource.resource : mcpUrl,
  };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url"); // 43 chars
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export const randomState = () => randomBytes(16).toString("base64url");

export function authorizeUrl(o: { authorizationEndpoint: string; clientId: string; redirectUri: string; challenge: string; state: string; resource: string }): string {
  const url = new URL(o.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    scope: SCOPES,
    code_challenge: o.challenge,
    code_challenge_method: "S256",
    state: o.state,
    resource: o.resource,
  }).toString();
  return url.toString();
}

interface Client {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** POSTs a token request with HTTP Basic client auth (what the Task 0 spike measured working on Clerk). */
async function tokenRequest(client: Client, params: Record<string, string>): Promise<Record<string, unknown>> {
  const basic = Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64");
  const response = await (client.fetch ?? fetch)(client.tokenEndpoint, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  // Only the OAuth error code: never the code, verifier, tokens or secret.
  if (!response.ok) throw new Error(`token endpoint: ${typeof body.error === "string" ? body.error : response.status}`);
  if (typeof body.access_token !== "string") throw new Error("token endpoint: no access_token");
  return body;
}

function toTokens(body: Record<string, unknown>, previousRefreshToken: string, now: () => number): Tokens {
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken: String(body.access_token),
    // Clerk rotates refresh tokens; keep the old one only if the response leaves it out.
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : previousRefreshToken,
    expiresAt: now() + expiresIn * 1000,
  };
}

export async function exchangeCode(o: Client & { code: string; verifier: string; redirectUri: string; resource: string }): Promise<Tokens> {
  const body = await tokenRequest(o, { grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, redirect_uri: o.redirectUri, resource: o.resource });
  return toTokens(body, "", o.now ?? Date.now);
}

export async function refreshTokens(o: Client & { refreshToken: string }): Promise<Tokens> {
  const body = await tokenRequest(o, { grant_type: "refresh_token", refresh_token: o.refreshToken });
  return toTokens(body, o.refreshToken, o.now ?? Date.now);
}
