import { NextResponse, type NextRequest } from "next/server";
import { linkConfigFromEnv, mcpUrl } from "@/lib/sim/deps";
import { authorizeUrl, discover, pkcePair, randomState } from "@/lib/sim/oauth";
import { cookieOptions, LINK_COOKIE, LINK_COOKIE_PATH, sealSession } from "@/lib/sim/session";
import { passcodeMatches } from "@/lib/sim/turn";

export const preferredRegion = "iad1";

const LINK_COOKIE_MAX_AGE = 600;

/** "Link Radio Milwaukee account": sends the browser to the listener Clerk login, as Alexa's account linking does. */
export async function GET(request: NextRequest) {
  if (!passcodeMatches(request.nextUrl.searchParams.get("passcode"), process.env.SIM_PASSCODE ?? "")) {
    return Response.json({ error: "Wrong or missing passcode." }, { status: 401 });
  }
  const config = linkConfigFromEnv();
  if (!config) return Response.json({ error: "Account linking isn't configured." }, { status: 503 });
  let server;
  try {
    server = await discover(mcpUrl());
  } catch (error) {
    console.error(JSON.stringify({ route: "sim/link/start", error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.redirect(new URL("/simulator?link=failed", request.url), 302);
  }
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  const response = NextResponse.redirect(
    authorizeUrl({ authorizationEndpoint: server.authorizationEndpoint, clientId: config.clientId, redirectUri: config.redirectUri, challenge, state, resource: server.resource }),
    302,
  );
  response.cookies.set(LINK_COOKIE, sealSession({ verifier, state }, config.secret), cookieOptions(LINK_COOKIE_PATH, LINK_COOKIE_MAX_AGE));
  return response;
}
