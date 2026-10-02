import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CARD_URI } from "@/lib/mcp";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  text: string;
  structured: Record<string, unknown> | null;
  isError: boolean;
}

export interface McpSession {
  tools: McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  readCard(): Promise<string>;
  close(): Promise<void>;
}

/** Connects to a Radio Commons MCP endpoint over Streamable HTTP, the way Alexa+ does. */
export async function connectMcp(url: string, fetchImpl?: typeof fetch): Promise<McpSession> {
  const client = new Client({ name: "radio-commons-simulator", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), fetchImpl ? { fetch: fetchImpl } : undefined));
  const { tools } = await client.listTools();
  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as Record<string, unknown> })),
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const content = (result.content ?? []) as { type: string; text?: string }[];
      return {
        text: content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n"),
        structured: (result.structuredContent as Record<string, unknown> | undefined) ?? null,
        isError: result.isError === true,
      };
    },
    async readCard() {
      const read = await client.readResource({ uri: CARD_URI });
      const first = read.contents[0] as { text?: string } | undefined;
      if (!first?.text) throw new Error("Story card resource was empty");
      return first.text;
    },
    close: () => client.close(),
  };
}
