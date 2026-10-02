import { connectMcp } from "@/lib/sim/mcpClient";
import { mcpUrl } from "@/lib/sim/deps";

export const preferredRegion = "iad1";

/** The story card page, read from our MCP server like any MCP Apps host would. It holds no story until the host sends one. */
export async function GET() {
  const mcp = await connectMcp(mcpUrl());
  try {
    return new Response(await mcp.readCard(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  } finally {
    await mcp.close().catch(() => undefined);
  }
}
