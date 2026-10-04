import { NextResponse, type NextRequest } from "next/server";
import { linkConfigFromEnv, mcpUrl } from "@/lib/sim/deps";
import { discover, exchangeCode } from "@/lib/sim/oauth";
import { cookieOptions, LINK_COOKIE, LINK_COOKIE_PATH, openSession, sealSession, SESSION_COOKIE } from "@/lib/sim/session";

export const preferredRegion = "iad1";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function backToSimulator(request: NextRequest, outcome: "ok" | "failed"): NextResponse {
  const response = NextResponse.redirect(new URL(`/simulator?link=${outcome}`, request.url), 302);
  response.cookies.set(LINK_COOKIE, "", cookieOptions(LINK_COOKIE_PATH, 0)); // one-shot
  return response;
}

/** Clerk sends the listener back here with a code; trade it (with the PKCE verifier) for tokens and keep them sealed. */
export async function GET(request: NextRequest) {
  const config = linkConfigFromEnv();
  const sealed = request.cookies.get(LINK_COOKIE)?.value;
  const pending = config && sealed ? openSession<{ verifier: string; state: string }>(sealed, config.secret) : null;
  const code = request.nextUrl.searchParams.get("code");
  if (!config || !pending || !code || request.nextUrl.searchParams.get("state") !== pending.state) return backToSimulator(request, "failed");
  try {
    const server = await discover(mcpUrl());
    const tokens = await exchangeCode({
      tokenEndpoint: server.tokenEndpoint, clientId: config.clientId, clientSecret: config.clientSecret,
      code, verifier: pending.verifier, redirectUri: config.redirectUri, resource: server.resource,
    });
    const response = backToSimulator(request, "ok");
    response.cookies.set(SESSION_COOKIE, sealSession(tokens, config.secret), cookieOptions("/", SESSION_MAX_AGE));
    return response;
  } catch (error) {
    // Messages carry only the OAuth error code, never the code, verifier or tokens.
    console.error(JSON.stringify({ route: "sim/link/callback", error: error instanceof Error ? error.message : String(error) }));
    return backToSimulator(request, "failed");
  }
}
