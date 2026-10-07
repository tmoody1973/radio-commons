import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The voice says "slash connect" (short to hear); the page lives one level down.
  async redirects() {
    return [{ source: "/connect", destination: "/connect/apple-music", permanent: true }];
  },
  // ChatGPT reads protected-resource metadata at the root /.well-known address and requires its `resource` to be the
  // server URL it was given. On the ChatGPT door's own host, that root address serves the chat door's metadata;
  // without CHATGPT_DOOR_HOST (production, Alexa+) there is no rewrite at all.
  async rewrites() {
    const host = process.env.CHATGPT_DOOR_HOST;
    if (!host) return [];
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        has: [{ type: "host" as const, value: host }],
        destination: "/.well-known/oauth-protected-resource/api/chatgpt/mcp",
      },
    ];
  },
};

export default nextConfig;
