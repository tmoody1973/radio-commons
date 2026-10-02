import { backstoryFromEnv } from "@/lib/backstory";
import { storyCardPage } from "@/lib/card";
import { buildMcpHandler } from "@/lib/mcp";

const handler = buildMcpHandler({ backstory: backstoryFromEnv, cardHtml: storyCardPage });

export { handler as DELETE, handler as GET, handler as POST };
