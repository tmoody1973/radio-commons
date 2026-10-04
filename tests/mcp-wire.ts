type Handler = (request: Request) => Promise<Response>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC results are free-form; tests assert on their fields
export type RpcMessage = { result?: any; error?: { message: string } };

/** One JSON-RPC call the way a 2025-11-25 Streamable HTTP client (Alexa+) sends it. Reads JSON or a single SSE message. */
export async function mcpPost(handler: Handler, body: { method: string; params?: unknown }, id = 1): Promise<{ status: number; message: RpcMessage }> {
  return send(handler, mcpRequest(body, id));
}

/** Same call, but as a listener the auth wrapper already verified: the SDK hands req.auth to the tool as extra.authInfo. */
export async function mcpPostAs(handler: Handler, body: { method: string; params?: unknown }, userId: string, id = 1): Promise<{ status: number; message: RpcMessage }> {
  const request = mcpRequest(body, id);
  Object.assign(request, { auth: { token: "t", clientId: "alexa", scopes: [], extra: { userId } } });
  return send(handler, request);
}

export const mcpRequest = (body: { method: string; params?: unknown }, id = 1, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
  });

export async function send(handler: Handler, request: Request): Promise<{ status: number; message: RpcMessage }> {
  const response = await handler(request);
  const text = await response.text();
  const json = text.trimStart().startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}");
  return { status: response.status, message: JSON.parse(json) as RpcMessage };
}

export const INITIALIZE = {
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "alexa-plus-test", version: "1" } },
};
