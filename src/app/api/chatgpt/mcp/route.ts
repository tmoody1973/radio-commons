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

// ponytail: no warm-up calls here; ChatGPT has no 500 ms budget. Add them if first-call latency shows up in hand tests.
let client: BackstoryClient | undefined;
const backstory = () => (client ??= backstoryFromEnv());
let playlistClient: PlaylistClient | undefined;
const playlist = () => (playlistClient ??= playlistFromEnv());

const handler = buildMcpHandler({ backstory, fieldGuide: fieldGuideFromEnv, playlist, defer: (task) => after(task), cardHtml: chatCardPage, surface: "chat" });

// No 401 gate: a signed-out call reaches the tool, whose mcp/www_authenticate error opens ChatGPT's sign-in screen.
const authed = withMcpAuth(handler, verifyChatGptToken, { required: false, resourceMetadataPath: `/.well-known/oauth-protected-resource${CHAT_RESOURCE_PATH}` });

export { authed as DELETE, authed as GET, authed as POST };
