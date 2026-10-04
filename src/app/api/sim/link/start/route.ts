import { NextResponse, type NextRequest } from "next/server";
import { linkConfigFromEnv, mcpUrl } from "@/lib/sim/deps";
import { authorizeUrl, discover, pkcePair, randomState } from "@/lib/sim/oauth";
import { cookieOptions, LINK_COOKIE, LINK_COOKIE_PATH, sealSession } from "@/lib/sim/session";
import { passcodeMatches } from "@/lib/sim/turn";

export const preferredRegion = "iad1";

const LINK_COOKIE_MAX_AGE = 600;

const linkFailed = (request: NextRequest) => NextResponse.redirect(new URL("/simulator?link=failed", request.url), 302);

/** "Link Radio Milwaukee account": sends the browser to the listener Clerk login, as Alexa's account linking does. */
export async function GET(request: NextRequest) {
  // A browser navigation, so failures land back on the simulator rather than on raw JSON.
  if (!passcodeMatches(request.nextUrl.searchParams.get("passcode"), process.env.SIM_PASSCODE ?? "")) return linkFailed(request);
  const config = linkConfigFromEnv();
  if (!config) return Response.json({ error: "Account linking isn't configured." }, { status: 503 });
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  let location: string;
  try {
    const server = await discover(mcpUrl());
    location = authorizeUrl({ authorizationEndpoint: server.authorizationEndpoint, clientId: config.clientId, redirectUri: config.redirectUri, challenge, state, resource: server.resource });
  } catch (error) {
    console.error(JSON.stringify({ route: "sim/link/start", error: error instanceof Error ? error.message : String(error) }));
    return linkFailed(request);
  }
  const response = NextResponse.redirect(location, 302);
  response.cookies.set(LINK_COOKIE, sealSession({ verifier, state }, config.secret), cookieOptions(LINK_COOKIE_PATH, LINK_COOKIE_MAX_AGE));
  return response;
}
