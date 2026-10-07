import { after } from "next/server";
import { withMcpAuth } from "mcp-handler";
import { backstoryFromEnv, type BackstoryClient } from "@/lib/backstory";
import { chatCardPage } from "@/lib/card";
import { fieldGuideFromEnv } from "@/lib/fieldGuide";
import { verifyChatGptToken } from "@/lib/listenerAuth";
import { buildMcpHandler, CHAT_RESOURCE_PATH } from "@/lib/mcp";
import { playlistFromEnv, type PlaylistClient } from "@/lib/playlist";

// The ChatGPT door: same tools and data as /api/mcp (Alexa+), with chat replies, cards and sign-in (decision 010).
export const preferredRegion = "iad1";

let client: BackstoryClient | undefined;
const backstory = () => (client ??= backstoryFromEnv());
let playlistClient: PlaylistClient | undefined;
const playlist = () => (playlistClient ??= playlistFromEnv());
// No 500 ms budget here: the Field Guide may take a cold start (seen in the hand test, 2026-10-07).
const FIELD_GUIDE_TIMEOUT_MS = 6000;
const fieldGuide = () => fieldGuideFromEnv(FIELD_GUIDE_TIMEOUT_MS);

// Wake both like /api/mcp does, so the first ChatGPT question after a quiet spell isn't the one that times out.
if (process.env.BACKSTORY_CONVEX_URL) void backstory().searchStoryCards("warm up").catch(() => undefined); // not at build time in CI
if (process.env.BACKSTORY_CONVEX_URL) void fieldGuide().picks().catch(() => undefined);

const handler = buildMcpHandler({ backstory, fieldGuide, playlist, defer: (task) => after(task), cardHtml: chatCardPage, surface: "chat" });

// No 401 gate: a signed-out call reaches the tool, whose mcp/www_authenticate error opens ChatGPT's sign-in screen.
const authed = withMcpAuth(handler, verifyChatGptToken, { required: false, resourceMetadataPath: `/.well-known/oauth-protected-resource${CHAT_RESOURCE_PATH}` });

export { authed as DELETE, authed as GET, authed as POST };
