import { Client, SdkHttpError, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CARD_URI } from "@/lib/mcp";
import { LINK_ACCOUNT_SPEECH } from "@/lib/speech";

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

// What a Finds tool says without a linked account. The server answers HTTP 401 before the tool runs, and the official
// client throws on that, so the simulator shows the same words B4's tools would, instead of a crashed turn.
const LINK_REQUIRED: McpToolResult = { text: LINK_ACCOUNT_SPEECH, structured: { error: "account_linking_required" }, isError: true };

/** Connects to a Radio Commons MCP endpoint over Streamable HTTP, the way Alexa+ does (with its token once linked). */
export async function connectMcp(url: string, opts: { fetch?: typeof fetch; bearer?: string } = {}): Promise<McpSession> {
  const client = new Client({ name: "radio-commons-simulator", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      fetch: opts.fetch,
      requestInit: opts.bearer ? { headers: { Authorization: `Bearer ${opts.bearer}` } } : undefined,
    }),
  );
  const { tools } = await client.listTools();
  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as Record<string, unknown> })),
    async callTool(name, args) {
      let result;
      try {
        result = await client.callTool({ name, arguments: args });
      } catch (error) {
        if (error instanceof SdkHttpError && error.status === 401) return LINK_REQUIRED;
        throw error;
      }
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
