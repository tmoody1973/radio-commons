import { EXT_APPS_BUNDLE } from "@/generated/ext-apps-bundle";
import { TOKENS } from "./tokens";

const MAPLIBRE = "https://unpkg.com/maplibre-gl@4.7.1/dist/";
const MAP_STYLE = "https://maps.geo.us-east-1.amazonaws.com/v2/styles/Standard/descriptor";

/** The MCP Apps bundle ends `export{…,X as App}`; bind its minified local name so the page can use App inline. */
function appBundle(): string {
  const local = EXT_APPS_BUNDLE.match(/\b([A-Za-z0-9_$]+) as App\b/)?.[1];
  if (!local) throw new Error("MCP Apps bundle no longer exports App the expected way; check @modelcontextprotocol/ext-apps");
  return `${EXT_APPS_BUNDLE.replace(/<\/script/gi, "<\\/script")}\nconst App = ${local};`;
}

const theme = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(";");

// Authored at Amazon's 768×480 base canvas; one root zoom scales it to the screen (≈1.667 on an Echo Show 8).
const STYLE = `:root{--accent:${TOKENS.accent};--on-accent:${TOKENS.onAccent};--z:1}
html[data-theme=light]{${theme(TOKENS.light)}}html[data-theme=dark]{${theme(TOKENS.dark)}}
body{margin:0;background:var(--screen);color:var(--text);font:16px/1.35 Figtree,system-ui,sans-serif}
#root{box-sizing:border-box;min-height:calc(100vh / var(--z));display:flex}
.card{box-sizing:border-box;flex:1;margin:0;padding:18px 22px;border-radius:16px;background:var(--card);display:flex;flex-direction:column;gap:14px}
.logo{height:18px;width:auto;align-self:flex-start}html[data-theme=dark] .logo{filter:invert(1)}
.meta{margin:0;font-size:16px;font-weight:600;color:var(--muted)}
h2{margin:4px 0 0;font-size:28px;line-height:1.12}
.line{margin:6px 0 0;font-size:16px;color:var(--muted)}
.line.small{font-size:14px}
.setlist{margin:8px 0 0;padding-left:22px;font-size:15px;line-height:1.35}
.body{display:flex;gap:24px;align-items:center}.info{min-width:0}
.art{width:180px;height:180px;border-radius:12px;object-fit:cover;flex:none}.ph{background:var(--inner)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}
button{font:inherit;cursor:pointer;border:0}
.primary,.secondary{min-height:48px;padding:0 24px;border-radius:9999px;display:inline-flex;align-items:center;gap:8px;font-size:17px}
.primary{background:var(--accent);color:var(--on-accent);font-weight:700}.secondary{background:var(--secondary);color:var(--text);font-weight:600}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px}
.source{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted);min-width:0}.thumb{width:40px;height:40px;border-radius:8px;object-fit:cover}
.said{flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px}
blockquote{margin:0;font-size:40px;line-height:1.1;font-weight:700}blockquote.q-mid{font-size:28px}blockquote.q-long{font-size:22px;line-height:1.25}
.moments{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px;color:var(--muted)}.moments li{display:flex;align-items:center;gap:10px}.moments span{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.carousel{display:flex;gap:16px;overflow-x:auto;padding-bottom:4px}
.tile{position:relative;flex:0 0 224px;padding:0;border-radius:16px;background:var(--inner);color:var(--text);text-align:left;overflow:hidden;display:flex;flex-direction:column}
.tile-art{width:100%;height:132px;object-fit:cover;display:block}
.badge,.num{width:32px;height:32px;border-radius:9999px;background:var(--accent);color:var(--on-accent);font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.badge{position:absolute;top:10px;left:10px}
.tile-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:10px 12px 2px;font-size:18px;font-weight:700;line-height:1.2}
.tile-date{margin:0 12px 12px;font-size:14px;color:var(--muted)}
.song{cursor:default}.song .tile-art{height:160px}.song .tile-actions{margin-top:auto}
.split{display:flex;gap:20px;min-height:0}.mapbox{position:relative;flex:none;border-radius:12px;overflow:hidden}.mapbox img{display:block}
.pin{position:absolute;transform:translate(-50%,-50%);min-width:30px;height:30px;padding:0 8px;box-sizing:border-box;border-radius:9999px;background:var(--accent);color:var(--on-accent);border:2px solid #fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;white-space:nowrap}
.list{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}
.row{min-height:52px;padding:6px 10px;border-radius:12px;background:var(--inner);color:var(--text);display:flex;align-items:center;gap:12px;text-align:left}
.what{display:flex;flex-direction:column;min-width:0}.what b{font-size:18px}.what small{font-size:14px;color:var(--muted)}
.list .fullscreen{margin-top:auto;justify-content:center}
.row-wrap{display:flex;gap:8px;align-items:stretch}.row-wrap .row{flex:1;min-width:0}.row-wrap .reserve,.row-wrap .tickets{min-height:52px;padding:0 16px}
.find,.digest{flex-basis:264px}
.chip{position:absolute;top:10px;right:10px;padding:4px 10px;border-radius:9999px;background:var(--card);color:var(--text);font-size:13px;font-weight:700}.chip.warn{background:var(--text);color:var(--card)}
.next{display:flex;flex-direction:column;gap:6px}.show-row{cursor:default}.show-row .thumb{width:96px;height:54px;flex:none}.show-row .ph{background:var(--secondary)}
.event{cursor:default;flex-basis:300px}.event .tile-art{height:96px}
.ev-head{display:flex;align-items:center;gap:8px;margin:12px 12px 0}.event .badge{position:static}
.ev-cat{font-size:14px;font-weight:600;color:var(--muted);text-transform:capitalize}
.tag{margin-left:auto;padding:4px 10px;border-radius:9999px;background:var(--secondary);color:var(--text);font-size:13px;font-weight:700}
.tile-actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 12px 12px}.tile-actions .secondary{min-height:48px;padding:0 14px;font-size:15px;white-space:nowrap}
.event-row{cursor:default}.event-row .what{flex:1}.secondary.small{min-height:48px;min-width:48px;padding:0;justify-content:center}
.pin.anchor{background:var(--text);color:var(--card);font-size:16px}
.row-wrap .calendar{min-height:52px;min-width:52px}
.cap-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;flex:1}
.cap{padding:14px;gap:6px;cursor:default}.cap .tile-title{margin:0;font-size:20px}
.cap-what{font-size:15px;line-height:1.3;color:var(--muted)}
.onair-row{cursor:default}.onair-row .what{flex:1}.onair-row .thumb{width:48px;height:48px;flex:none}
.onair-row b,.onair-row small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.what .station{font-weight:700;color:var(--text)}
.onair-row .primary,.onair-row .secondary{min-height:48px;padding:0 16px;font-size:15px;white-space:nowrap}
.secondary.say{margin-top:auto;min-height:48px;padding:8px 14px;border-radius:14px;font-size:15px;line-height:1.25;text-align:left}
#fullmap{position:fixed;inset:0}
.overlay{position:fixed;zoom:var(--z)}
.bar{top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:16px;background:var(--card)}
.side{top:80px;right:10px;bottom:10px;width:300px;box-sizing:border-box;padding:14px;border-radius:16px;background:var(--card);overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.side-title{margin:0 0 4px;font-size:18px;font-weight:700}.side>*{flex-shrink:0}
/* Map pins live inside the unscaled map, so they size from --z directly (CSS zoom would shift their position). */
.mappin{min-width:calc(30px * var(--z));height:calc(30px * var(--z));padding:0 calc(8px * var(--z));box-sizing:border-box;border-radius:9999px;background:${TOKENS.accent};color:${TOKENS.onAccent};border:calc(2px * var(--z)) solid #fff;font:700 calc(15px * var(--z)) Figtree,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)}`;

const script = (mapKey: string) => `
const root = document.getElementById("root");
const app = new App({ name: "radio-commons-story-card", version: "0.2.0" }, {});
const MAP_STYLE = ${JSON.stringify(`${MAP_STYLE}?key=${encodeURIComponent(mapKey)}`)};
const MAPLIBRE = ${JSON.stringify(MAPLIBRE)};
let current = null;
let audio = null;

// The host says how wide the card is and which theme it shows; resolve once per change and let CSS do the rest.
function applyContext() {
  const ctx = app.getHostContext() || {};
  const width = (ctx.containerDimensions && ctx.containerDimensions.width) || window.innerWidth;
  const full = ctx.displayMode === "fullscreen" && current && current.fullHtml;
  const z = width / 768;
  document.documentElement.dataset.theme = ctx.theme === "dark" ? "dark" : "light";
  document.documentElement.style.setProperty("--z", String(z));
  // The pan-and-zoom map manages its own scale, so fullscreen leaves the page unscaled and scales only the overlays.
  document.documentElement.style.zoom = full ? "1" : String(z);
  render(full);
}

function render(full) {
  if (!current) return;
  root.innerHTML = full ? current.fullHtml : current.cardHtml;
  // The map picture follows the theme: Amazon draws light and dark versions.
  const dark = document.documentElement.dataset.theme === "dark";
  root.querySelectorAll("img[data-themed]").forEach((img) => { img.src = img.src.replace(/theme=(light|dark)/, dark ? "theme=dark" : "theme=light"); });
  if (full) startMap();
}

app.ontoolresult = (result) => {
  const data = result && result.structuredContent;
  if (!data || typeof data.cardHtml !== "string") { root.textContent = "Story unavailable."; return; }
  current = data;
  if (audio) audio.pause(); // a new answer replaces the card, so its sound stops too
  audio = null;
  applyContext();
};
app.onhostcontextchanged = () => applyContext();

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = MAPLIBRE + "maplibre-gl.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = MAPLIBRE + "maplibre-gl.js"; js.onload = resolve; js.onerror = reject;
    document.head.appendChild(js);
  });
}

function startMap() {
  const el = document.getElementById("fullmap");
  if (!el || !Array.isArray(current.mapPlaces) || current.mapPlaces.length === 0) return;
  loadMapLibre().then(() => {
    const dark = document.documentElement.dataset.theme === "dark";
    const z = Number(document.documentElement.style.getPropertyValue("--z")) || 1;
    const map = new maplibregl.Map({ container: el, style: MAP_STYLE + "&color-scheme=" + (dark ? "Dark" : "Light"), attributionControl: { compact: true } });
    const bounds = new maplibregl.LngLatBounds();
    for (const group of current.mapPlaces) {
      const pin = document.createElement("div");
      pin.className = "mappin";
      pin.textContent = group.numbers.join("·");
      new maplibregl.Marker({ element: pin }).setLngLat([group.lng, group.lat]).addTo(map);
      bounds.extend([group.lng, group.lat]);
    }
    map.fitBounds(bounds, { padding: { top: 100 * z, bottom: 40 * z, left: 40 * z, right: 340 * z }, duration: 0, maxZoom: 15 });
  }).catch(() => { el.textContent = "The map couldn't load here."; });
}

// The card's main button is the player: it reads "Pause" while anything plays and pauses on tap.
function mainButton() { return root.querySelector(".actions .primary"); }
function showPlaying(playing) {
  const main = mainButton();
  if (!main || !main.lastChild) return;
  if (!main.dataset.label) main.dataset.label = main.lastChild.textContent;
  main.lastChild.textContent = playing ? " Pause" : main.dataset.label;
}
function pauseAudio() {
  if (audio && !audio.paused) audio.pause();
  showPlaying(false);
}

function play(button) {
  audio = audio || new Audio(button.dataset.audio);
  audio.onpause = () => showPlaying(false);
  if (button === mainButton() && !audio.paused) { pauseAudio(); return; }
  if (button.classList.contains("play-from")) audio.currentTime = Number(button.dataset.start);
  else if (button.classList.contains("secondary")) audio.currentTime = 0; // "Whole episode" starts at the top
  if (!audio.paused) { showPlaying(true); return; } // already playing: that was a jump
  audio.play().then(() => {
    showPlaying(true);
    window.parent.postMessage({ type: "radio-commons:playing" }, "*"); // lets a host stop its own voice
  }).catch(() => { button.lastChild.textContent = " Can't play here"; });
}

// List tiles each carry their own preview (or live stream): one plays at a time, and its button reads "Pause" (or its data-playing) while it does.
function rowLabel(button, playing) {
  if (!button.dataset.label) button.dataset.label = button.lastChild.textContent;
  button.lastChild.textContent = playing ? (button.dataset.playing || " Pause") : button.dataset.label;
}
function playRow(button) {
  const same = audio && audio.dataset.row === button.dataset.audio;
  if (same && !audio.paused) {
    audio.pause();
    if (button.classList.contains("live")) audio = null; // a live stream restarts fresh, never from a stale buffer
    return;
  }
  if (audio && !same) audio.pause();
  if (!same) { audio = new Audio(button.dataset.audio); audio.dataset.row = button.dataset.audio; }
  audio.onpause = () => rowLabel(button, false);
  audio.play().then(() => {
    rowLabel(button, true);
    window.parent.postMessage({ type: "radio-commons:playing" }, "*");
  }).catch(() => { button.lastChild.textContent = " Can't play here"; });
}

// The host pauses the card when the listener says "stop" or "pause" (Alexa handles those on the device itself).
window.addEventListener("message", (event) => {
  if (event.source === window.parent && event.data && event.data.type === "radio-commons:pause") pauseAudio();
});

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const has = (name) => button.classList.contains(name);
  // The card asks; the host decides: a follow-up turn, a map link, or a bigger view.
  if (has("ask")) { app.sendMessage({ role: "user", content: [{ type: "text", text: button.dataset.ask }] }).catch(() => {}); return; }
  if (has("calendar") || has("details") || has("reserve") || has("tickets")) { app.openLink({ url: button.dataset.url }).catch(() => {}); return; }
  if (has("directions")) { app.openLink({ url: button.dataset.url }).catch(() => { button.textContent = "Can't open maps here"; }); return; }
  if (has("fullscreen")) { app.requestDisplayMode({ mode: "fullscreen" }).then(applyContext).catch(() => {}); return; }
  if (has("close")) { app.requestDisplayMode({ mode: "inline" }).then(applyContext).catch(() => {}); return; }
  if (has("row-play")) { playRow(button); return; }
  if (has("play") || has("play-from")) play(button);
});

await app.connect();
applyContext();`;

let cached: { key: string; html: string } | null = null;

/** The MCP App page Alexa+ shows on screens: the official App bundle inline, then it renders the view each tool returns. */
// The browser key can only fetch map tiles (pan and zoom); the map-picture key stays on the server (/api/map).
export function storyCardPage(mapKey = process.env.AMAZON_LOCATION_BROWSER_KEY ?? ""): string {
  if (cached?.key !== mapKey) {
    const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<title>Radio Milwaukee story</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap">`
      + `<style>${STYLE}</style></head><body><main id="root" aria-live="polite">Loading the story…</main>`
      + `<script type="module">${appBundle()}${script(mapKey)}</script></body></html>`;
    cached = { key: mapKey, html };
  }
  return cached.html;
}
