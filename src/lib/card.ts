import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Story } from "@/lib/backstory";
import { monthYear } from "@/lib/speech";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The card's inner HTML, made on the server so every piece of story text is escaped in one tested place. */
export function renderCard(story: Story): string {
  const image = story.imageUrl ? `<img src="${escape(story.imageUrl)}" alt="${escape(story.show)} artwork" width="120" height="120">` : "";
  const places = story.places.length
    ? `<h3>Places</h3><ul>${story.places.map((p) => `<li>${escape(p.name)}${p.neighborhood ? ` · ${escape(p.neighborhood)}` : ""}</li>`).join("")}</ul>`
    : "";
  const actions = story.actions.length
    ? `<h3>Things to do</h3><ul class="chips">${story.actions.map((a) => `<li>${escape(a.label)}</li>`).join("")}</ul>`
    : "";
  return `<article>${image}<div><p class="source">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p>`
    + `<h2>${escape(story.title)}</h2><p>${escape(story.summary)}</p>${places}${actions}`
    + `<button type="button" class="play" data-audio="${escape(story.audioUrl)}">▶ Play episode</button></div></article>`;
}

/** The MCP Apps bundle ends `export{…,X as App}`; bind its minified local name so the page can use App inline. */
function appBundle(): string {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
  const local = source.match(/\b([A-Za-z0-9_$]+) as App\b/)?.[1];
  if (!local) throw new Error("MCP Apps bundle no longer exports App the expected way; check @modelcontextprotocol/ext-apps");
  return `${source.replace(/<\/script/gi, "<\\/script")}\nconst App = ${local};`;
}

const STYLE = `body{margin:0;font:16px/1.4 system-ui,sans-serif;background:#F7F1DB;color:#1E2124}
article{display:flex;gap:16px;padding:16px;border:3px solid #1E2124;background:#fff}
img{border:3px solid #1E2124;object-fit:cover;flex:none}
.source{margin:0;color:#5C6369;font-size:14px}h2{margin:4px 0 8px;font-size:22px}h3{margin:12px 0 4px;font-size:15px}
ul{margin:0;padding-left:18px}.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.chips li{border:2px solid #1E2124;padding:2px 8px}
.play{margin-top:12px;padding:8px 14px;border:3px solid #1E2124;background:#F7941D;color:#1E2124;font-weight:700;cursor:pointer}`;

const SCRIPT = `
const root = document.getElementById("root");
const app = new App({ name: "radio-commons-story-card", version: "0.1.0" }, {});
app.ontoolresult = (result) => {
  const html = result && result.structuredContent && result.structuredContent.cardHtml;
  root.innerHTML = typeof html === "string" ? html : "Story unavailable.";
};
let audio = null;
root.addEventListener("click", (event) => {
  const button = event.target.closest("button.play");
  if (!button) return;
  audio = audio || new Audio(button.dataset.audio);
  if (audio.paused) { audio.play(); button.textContent = "❚❚ Pause"; } else { audio.pause(); button.textContent = "▶ Play episode"; }
});
await app.connect();`;

let cached: string | null = null;

/** The MCP App page Alexa+ shows on screens: the official App bundle inline, then it renders the card the tool returns. */
export function storyCardPage(): string {
  cached ??= `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Radio Milwaukee story</title><style>${STYLE}</style></head>`
    + `<body><main id="root" aria-live="polite">Loading the story…</main><script type="module">${appBundle()}${SCRIPT}</script></body></html>`;
  return cached;
}
