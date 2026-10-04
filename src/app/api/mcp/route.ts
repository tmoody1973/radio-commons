import { withMcpAuth } from "mcp-handler";
import { backstoryFromEnv, type BackstoryClient } from "@/lib/backstory";
import { storyCardPage } from "@/lib/card";
import { fieldGuideFromEnv } from "@/lib/fieldGuide";
import { gateAuthTools, RESOURCE_METADATA_PATH, verifyListenerToken } from "@/lib/listenerAuth";
import { buildMcpHandler } from "@/lib/mcp";
import { playlistFromEnv, type PlaylistClient } from "@/lib/playlist";

// Convex and Vercel's default region are both in US East; keep the function there.
export const preferredRegion = "iad1";

// One client per server instance. Opening its connection now means a listener's first question after a cold start
// doesn't spend the 500 ms budget on DNS and TLS (the first live search timed out on exactly that).
let client: BackstoryClient | undefined;
const backstory = () => (client ??= backstoryFromEnv());
if (process.env.BACKSTORY_CONVEX_URL) void backstory().searchStoryCards("warm up").catch(() => undefined); // not at build time in CI

// Wake the Field Guide too: its first answer after a quiet spell is slow (server and database both starting).
if (process.env.BACKSTORY_CONVEX_URL) void fieldGuideFromEnv().picks().catch(() => undefined);

// Created on first use, so a build without the playlist env vars never constructs it.
let playlistClient: PlaylistClient | undefined;
const playlist = () => (playlistClient ??= playlistFromEnv());

const handler = buildMcpHandler({ backstory, fieldGuide: fieldGuideFromEnv, playlist, cardHtml: storyCardPage });

// Optional auth: anonymous listeners keep every non-Finds tool; a valid listener token unlocks the Finds tools.
const authed = withMcpAuth(gateAuthTools(handler), verifyListenerToken, { required: false, resourceMetadataPath: RESOURCE_METADATA_PATH });

export { authed as DELETE, authed as GET, authed as POST };
