import { describe, expect, it } from "vitest";
import { buildMcpHandler } from "@/lib/mcp";
import { connectMcp } from "@/lib/sim/mcpClient";
import { fakeBackstory } from "../fixtures";

const handler = buildMcpHandler({ backstory: () => fakeBackstory(), cardHtml: () => "<!doctype html><title>card</title>" });
const inProcessFetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;

describe("simulator MCP client", () => {
  it("lists our tools, calls them, and reads the card, like Alexa+ would", async () => {
    const mcp = await connectMcp("http://localhost/api/mcp", inProcessFetch);
    expect(mcp.tools.map((t) => t.name).sort()).toEqual(["ask_station_story", "find_station_story", "get_station_story"]);
    expect(mcp.tools[0].inputSchema).toMatchObject({ type: "object" });
    const found = await mcp.callTool("find_station_story", { description: "art shop" });
    expect(found.text).toMatch(/^I found one Radio Milwaukee story/);
    expect(found.isError).toBe(false);
    expect(found.structured).toMatchObject({ stationId: "radiomilwaukee" });
    expect(await mcp.readCard()).toContain("<title>card</title>");
    await mcp.close();
  });
});
