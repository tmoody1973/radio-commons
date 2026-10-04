import { auth } from "@clerk/nextjs/server";
import { PlaylistUnavailable, playlistFromEnv } from "@/lib/playlist";

const MAX_TOKEN_LENGTH = 4096;

interface ConnectRequest {
  userId: string | null;
  body: unknown;
  connect: (listenerId: string, token: string) => Promise<void>;
  /** The request's Origin header and this site's origin; a mismatch is a cross-site request riding the session cookie. */
  origin?: string | null;
  siteOrigin?: string;
}

export async function handleConnect({ userId, body, connect, origin, siteOrigin }: ConnectRequest): Promise<Response> {
  if (origin && origin !== siteOrigin) return Response.json({ error: "cross_origin" }, { status: 403 });
  if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
  const token = (body as { musicUserToken?: unknown } | null)?.musicUserToken;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return Response.json({ error: "invalid_token" }, { status: 400 });
  }
  try {
    await connect(userId, token);
  } catch (error) {
    if (error instanceof PlaylistUnavailable) return Response.json({ error: "unavailable" }, { status: 503 });
    throw error;
  }
  return Response.json({ linked: true });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const body = await req.json().catch(() => null);
  return handleConnect({
    userId,
    body,
    origin: req.headers.get("origin"),
    siteOrigin: new URL(req.url).origin,
    connect: (id, token) => playlistFromEnv().connectAppleMusic(id, token),
  });
}
