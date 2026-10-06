import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("/connect", () => {
  it("permanently redirects to the Apple Music connect page, which the voice names as slash connect", async () => {
    expect(await nextConfig.redirects?.()).toContainEqual({ source: "/connect", destination: "/connect/apple-music", permanent: true });
  });
});
