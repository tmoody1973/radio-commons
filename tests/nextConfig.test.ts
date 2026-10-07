import { afterEach, describe, expect, it, vi } from "vitest";

// ChatGPT reads protected-resource metadata at the ROOT /.well-known address and requires its `resource` to equal
// the server URL it was given (developers.openai.com/plugins/build/auth). On the ChatGPT door's own host, the root
// address must therefore serve the chat door's metadata; every other host (Alexa+) keeps today's.
const rewrites = async () => {
  vi.resetModules();
  const config = (await import("../next.config")).default;
  return config.rewrites ? await config.rewrites() : undefined;
};

describe("next.config rewrites", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("adds no rewrite when CHATGPT_DOOR_HOST is unset (production, Alexa+)", async () => {
    vi.stubEnv("CHATGPT_DOOR_HOST", "");
    expect(await rewrites()).toEqual({ beforeFiles: [] });
  });

  it("on the ChatGPT host only, serves the chat door's metadata at the root address", async () => {
    vi.stubEnv("CHATGPT_DOOR_HOST", "chatgpt-dev.rmke.org");
    // beforeFiles: a plain rewrite list only runs when no route matches, and the root metadata route exists.
    expect(await rewrites()).toEqual({ beforeFiles: [
      {
        source: "/.well-known/oauth-protected-resource",
        has: [{ type: "host", value: "chatgpt-dev.rmke.org" }],
        destination: "/.well-known/oauth-protected-resource/api/chatgpt/mcp",
      },
    ] });
  });
});
