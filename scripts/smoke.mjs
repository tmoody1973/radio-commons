// Calls a deployed Radio Commons MCP endpoint the way Alexa+ does (Streamable HTTP, protocol 2025-11-25).
//   node scripts/smoke.mjs https://radio-commons.vercel.app/api/mcp ["what to search"] [timing-runs]
const [url = "http://localhost:3000/api/mcp", query = "frugal dining", runs = "0"] = process.argv.slice(2);
let id = 0;

async function rpc(method, params) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await response.text();
  const ms = Math.round(performance.now() - started);
  const json = text.trimStart().startsWith("{") ? text : (text.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim() ?? "{}");
  const message = JSON.parse(json);
  if (!response.ok || message.error) throw new Error(`${method} → HTTP ${response.status} ${JSON.stringify(message.error ?? text.slice(0, 200))}`);
  return { result: message.result, ms };
}

const call = (name, args) => rpc("tools/call", { name, arguments: args });
const pct = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((p / 100) * values.length))];

const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
console.log(`initialize: protocol ${init.result.protocolVersion} (${init.ms} ms)`);
const tools = await rpc("tools/list", {});
console.log(`tools: ${tools.result.tools.map((t) => t.name).join(", ")} (${tools.ms} ms)`);
const found = await call("find_station_story", { description: query });
console.log(`find "${query}" (${found.ms} ms): ${found.result.content[0].text}`);
const match = found.result.structuredContent?.matches?.[0];
if (match) {
  const story = await call("get_station_story", { storyId: match.storyId });
  const s = story.result.structuredContent.story;
  console.log(`get (${story.ms} ms): ${story.result.content[0].text.slice(0, 160)}…`);
  console.log(`  image ${s.imageUrl} | audio ${s.audioUrl.slice(0, 40)}… | card ${story.result.structuredContent.cardHtml.length} chars`);
  const card = await rpc("resources/read", { uri: "ui://radio-commons/story-card.html" });
  console.log(`card resource: ${card.result.contents[0].mimeType}, ${card.result.contents[0].text.length} chars (${card.ms} ms)`);
  const n = Number(runs);
  if (n > 0) {
    for (const [name, args] of [["find_station_story", { description: query }], ["get_station_story", { storyId: match.storyId }]]) {
      const times = [];
      for (let i = 0; i < n; i++) times.push((await call(name, args)).ms);
      console.log(`${name} x${n}: p50 ${pct(times, 50)} ms, p95 ${pct(times, 95)} ms, max ${Math.max(...times)} ms`);
    }
  }
}
