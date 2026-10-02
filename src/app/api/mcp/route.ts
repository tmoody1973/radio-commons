import { backstoryFromEnv, type BackstoryClient } from "@/lib/backstory";
import { storyCardPage } from "@/lib/card";
import { buildMcpHandler } from "@/lib/mcp";

// Convex and Vercel's default region are both in US East; keep the function there.
export const preferredRegion = "iad1";

// One client per server instance. Opening its connection now means a listener's first question after a cold start
// doesn't spend the 500 ms budget on DNS and TLS (the first live search timed out on exactly that).
let client: BackstoryClient | undefined;
const backstory = () => (client ??= backstoryFromEnv());
if (process.env.BACKSTORY_CONVEX_URL) void backstory().searchStoryCards("warm up").catch(() => undefined); // not at build time in CI

const handler = buildMcpHandler({ backstory, cardHtml: storyCardPage });

export { handler as DELETE, handler as GET, handler as POST };
