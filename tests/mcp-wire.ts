type Handler = (request: Request) => Promise<Response>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC results are free-form; tests assert on their fields
export type RpcMessage = { result?: any; error?: { message: string } };

/** One JSON-RPC call the way a 2025-11-25 Streamable HTTP client (Alexa+) sends it. Reads JSON or a single SSE message. */
export async function mcpPost(handler: Handler, body: { method: string; params?: unknown }, id = 1): Promise<{ status: number; message: RpcMessage }> {
  const response = await handler(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
  }));
  const text = await response.text();
  const json = text.trimStart().startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}");
  return { status: response.status, message: JSON.parse(json) as RpcMessage };
}

export const INITIALIZE = {
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "alexa-plus-test", version: "1" } },
};
