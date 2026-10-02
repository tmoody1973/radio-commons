import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The story card inlines this file at runtime (src/lib/card.ts); make sure Vercel ships it with the MCP route.
  outputFileTracingIncludes: {
    "/api/mcp": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"],
  },
};

export default nextConfig;
