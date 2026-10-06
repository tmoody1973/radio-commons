import { createPublicKey, verify, type KeyObject } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { getPublicOrigin } from "mcp-handler";

export const AUTH_TOOLS = ["save_find", "list_finds", "delete_my_finds", "follow_artist", "unfollow_artist", "whats_new_for_me", "cancel_membership", "my_membership"] as const;
const AUTH_TOOL_SET = new Set<string>(AUTH_TOOLS);
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
/** The scopes a listener's sign-in asks for, on both doors. */
export const OAUTH_SCOPES = ["openid", "profile", "offline_access"] as const;
const ACCESS_TOKEN_TYPES = new Set(["at+jwt", "application/at+jwt"]);

export type ListenerAuthInfo = AuthInfo & { extra: { userId: string } };

interface AccessTokenClaims {
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  client_id?: unknown;
  azp?: unknown;
  scope?: unknown;
}

const decodeSegment = (segment: string): Record<string, unknown> => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

// Env files often store a PEM on one line with literal "\n"s.
const publicKeyFrom = (pem: string): KeyObject => createPublicKey(pem.replace(/\\n/g, "\n"));

/** RS256 signature and header check. Returns the claims only when the signature is good. */
function verifiedClaims(token: string, key: KeyObject): AccessTokenClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return undefined;
  const { alg, typ } = decodeSegment(header);
  // Pinning alg stops alg-confusion; requiring at+jwt keeps Clerk session tokens (same key, same issuer) out.
  if (alg !== "RS256" || !ACCESS_TOKEN_TYPES.has(String(typ).toLowerCase())) return undefined;
  const signatureValid = verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), key, Buffer.from(signature, "base64url"));
  return signatureValid ? decodeSegment(payload) : undefined;
}

/**
 * Checks a listener's Clerk OAuth access token locally (no network call, so it fits the 500 ms budget).
 * Clerk doesn't set `aud`, so the token is bound to us by issuer + our Alexa+ OAuth client id instead.
 * Undefined = anonymous: a bad token never errors, the listener just can't use the Finds tools.
 */
function tokenVerifier(clientIdVar: "CLERK_LISTENER_OAUTH_CLIENT_ID" | "CLERK_CHATGPT_OAUTH_CLIENT_ID") {
  return async (_req: Request, bearer?: string): Promise<ListenerAuthInfo | undefined> => {
    const { CLERK_LISTENER_ISSUER: issuer, CLERK_LISTENER_JWT_KEY: pem } = process.env;
    const clientId = process.env[clientIdVar];
    if (!bearer || !issuer || !pem || !clientId) return undefined;
    try {
      const claims = verifiedClaims(bearer, publicKeyFrom(pem));
      if (!claims || claims.iss !== issuer || typeof claims.sub !== "string" || !claims.sub) return undefined;
      if (typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) return undefined;
      if ((claims.client_id ?? claims.azp) !== clientId) return undefined;
      const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];
      return { token: bearer, clientId, scopes, expiresAt: claims.exp, extra: { userId: claims.sub } };
    } catch {
      return undefined; // malformed token or key; never log the token
    }
  };
}

/** Alexa+ door: tokens issued to the Alexa+ account-linking client. */
export const verifyListenerToken = tokenVerifier("CLERK_LISTENER_OAUTH_CLIENT_ID");
/** ChatGPT door: tokens issued to the ChatGPT client (same Clerk app and listeners, a second OAuth client). */
export const verifyChatGptToken = tokenVerifier("CLERK_CHATGPT_OAUTH_CLIENT_ID");

/** Amazon wants HTTP 401 for an auth-needing tool without a token; MCP tools can't set status, so the route does it. */
export function gateAuthTools(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST" || (req as Request & { auth?: unknown }).auth) return handler(req);
    const body: unknown = await req.clone().json().catch(() => null);
    // The SDK accepts JSON-RPC batches, so one Finds call hidden in a batch must still be caught.
    const messages = (Array.isArray(body) ? body : [body]) as (JsonRpcMessage | null)[];
    if (!messages.some(callsAuthTool)) return handler(req);
    return accountLinkingRequired(req);
  };
}

type JsonRpcMessage = { method?: unknown; params?: { name?: unknown } };

const callsAuthTool = (message: JsonRpcMessage | null) =>
  message?.method === "tools/call" && AUTH_TOOL_SET.has(String(message.params?.name ?? ""));

function accountLinkingRequired(req: Request): Response {
  const metadata = `resource_metadata="${getPublicOrigin(req)}${RESOURCE_METADATA_PATH}"`;
  // withMcpAuth lets a failed bearer through as anonymous; RFC 6750 says to tell the client its token was rejected.
  const sentBearer = /^bearer\s/i.test(req.headers.get("authorization") ?? "");
  return new Response(JSON.stringify({ error: "account_linking_required" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": sentBearer ? `Bearer error="invalid_token", ${metadata}` : `Bearer ${metadata}` },
  });
}

export function listenerIdFrom(extra: { authInfo?: { extra?: { userId?: unknown } } }): string | undefined {
  const id = extra.authInfo?.extra?.userId;
  return typeof id === "string" ? id : undefined;
}
