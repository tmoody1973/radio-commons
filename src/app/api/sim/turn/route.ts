import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { linkConfigFromEnv, mcpUrl, turnDepsFromEnv } from "@/lib/sim/deps";
import { discover, refreshTokens, type Tokens } from "@/lib/sim/oauth";
import { cookieOptions, openSession, sealSession, SESSION_COOKIE, sessionSecret } from "@/lib/sim/session";
import { handleTurn, passcodeMatches } from "@/lib/sim/turn";

export const preferredRegion = "iad1";
export const maxDuration = 30;

const historySchema = z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(100);
const REFRESH_MARGIN_MS = 60_000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** The linked listener's tokens, refreshed when about to expire. `cookie`: a new sealed value, or "" to clear it. */
async function linkedSession(request: NextRequest): Promise<{ accessToken?: string; cookie?: string }> {
  const secret = sessionSecret();
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || !sealed) return {};
  const tokens = openSession<Tokens>(sealed, secret);
  if (!tokens) return { cookie: "" };
  if (tokens.expiresAt - Date.now() >= REFRESH_MARGIN_MS) return { accessToken: tokens.accessToken };
  try {
    const config = linkConfigFromEnv();
    if (!config) throw new Error("account linking isn't configured");
    const { tokenEndpoint } = await discover(mcpUrl());
    const fresh = await refreshTokens({ tokenEndpoint, clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: tokens.refreshToken });
    return { accessToken: fresh.accessToken, cookie: sealSession(fresh, secret) };
  } catch (error) {
    // Continue anonymously; the listener can link again. Never log the tokens.
    console.error(JSON.stringify({ route: "sim/turn", error: `refresh failed: ${error instanceof Error ? error.message : String(error)}` }));
    return { cookie: "" };
  }
}

/** One simulated Alexa+ turn. Multipart form: `audio` (file) or `text`, plus `history` (JSON). */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send a multipart form." }, { status: 400 });
  }
  let rawHistory: unknown;
  try {
    rawHistory = JSON.parse(String(form.get("history") ?? "[]"));
  } catch {
    rawHistory = null;
  }
  const history = historySchema.safeParse(rawHistory);
  if (!history.success) return Response.json({ error: "Bad conversation history." }, { status: 400 });
  const audio = form.get("audio");
  const text = form.get("text");
  let deps;
  try {
    deps = turnDepsFromEnv();
  } catch (error) {
    console.error(JSON.stringify({ route: "sim/turn", error: String(error) }));
    return Response.json({ error: "The simulator isn't configured." }, { status: 503 });
  }
  const passcode = request.headers.get("x-sim-passcode");
  // Before linkedSession: a stranger's request must not trigger a token refresh (an outbound call).
  if (!passcodeMatches(passcode, deps.passcode)) return Response.json({ error: "Wrong or missing passcode." }, { status: 401 });
  const linked = await linkedSession(request);
  const { status, body } = await handleTurn(
    {
      passcode,
      accessToken: linked.accessToken,
      history: history.data,
      audio: audio instanceof File ? { bytes: new Uint8Array(await audio.arrayBuffer()), contentType: audio.type || "audio/webm" } : undefined,
      text: typeof text === "string" && text.trim() ? text : undefined,
    },
    deps,
  );
  const response = NextResponse.json(body, { status });
  if (linked.cookie !== undefined) response.cookies.set(SESSION_COOKIE, linked.cookie, cookieOptions("/", linked.cookie ? SESSION_MAX_AGE : 0));
  return response;
}
