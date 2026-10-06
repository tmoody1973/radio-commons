import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The voice says "slash connect" (short to hear); the page lives one level down.
  async redirects() {
    return [{ source: "/connect", destination: "/connect/apple-music", permanent: true }];
  },
};

export default nextConfig;
