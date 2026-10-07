import { TOKENS } from "./tokens";

/**
 * The ChatGPT door's card styles, appended after the shared base styles (so every view inherits them). Values from
 * openai/apps-sdk-ui (system font, 4px steps, 16/24 body, 14/20 small, 12/18 meta, radii 12/16, borders at 10%, pill
 * buttons); layout from the mockups Tarik approved on 2026-10-07. ChatGPT's rules: system font, no logo, system colors,
 * brand color only on primary buttons and badges, at most two actions, fit the content (no vh, no zoom).
 */
const FONT = `ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`;

export const CHAT_STYLE = `
:root{--accent:${TOKENS.accent};--on-accent:${TOKENS.onAccent};--z:1}
html[data-theme=light]{--screen:transparent;--card:#ffffff;--inner:#f3f3f3;--text:#0d0d0d;--muted:#5d5d5d;--secondary:#ededed;--text-2:#5d5d5d;--border:rgba(13,13,13,.10);--divider:rgba(13,13,13,.06);--soft:#ededed;--soft-hover:#e3e3e3;--ring:rgba(13,13,13,.06);--focus:#0169cc}
html[data-theme=dark]{--screen:transparent;--card:#212121;--inner:#2a2a2a;--text:#ffffff;--muted:#afafaf;--secondary:#303030;--text-2:#afafaf;--border:rgba(255,255,255,.12);--divider:rgba(255,255,255,.08);--soft:#303030;--soft-hover:#3a3a3a;--ring:rgba(255,255,255,.08);--focus:#0285ff}
html,body{height:auto}
body{margin:0;background:transparent;color:var(--text);font:400 16px/24px ${FONT};-webkit-font-smoothing:antialiased}
#root{min-height:0;display:block}
.logo{display:none}
.card{display:block;box-sizing:border-box;border:1px solid var(--border);border-radius:16px;padding:16px;background:transparent}
@media (min-width:576px){.card{border-radius:20px}}
h2,p{margin:0}
.meta{font-size:12px;line-height:18px;color:var(--text-2);display:block}
.line{font-size:14px;line-height:20px;color:var(--text-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.line.small{font-size:12px;line-height:18px}
button{font:inherit;cursor:pointer;border:0}
.primary,.secondary{min-height:0;height:36px;padding:0 16px;border-radius:9999px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.primary{background:var(--accent);color:var(--on-accent)}
.secondary{background:var(--soft);color:var(--text)}
.secondary:hover{background:var(--soft-hover)}
button svg{width:16px;height:16px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.story .body{display:flex;gap:16px;align-items:flex-start}
.story .art{width:112px;height:112px;flex:none;border-radius:12px;object-fit:cover;box-shadow:0 0 0 1px var(--ring)}
.story .info{min-width:0;display:flex;flex-direction:column;gap:2px}
.story h2{font-size:18px;line-height:26px;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media (max-width:480px){.story .art{width:88px;height:88px}.story h2{font-size:16px;line-height:24px}.story .actions .primary,.story .actions .secondary{height:32px;padding:0 12px;font-size:13px}}
.carousel{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0;padding:0}
.carousel::-webkit-scrollbar{display:none}
.tile{all:unset;box-sizing:border-box;position:relative;flex:none;width:200px;scroll-snap-align:start;display:flex;flex-direction:column;cursor:pointer}
.tile-art{width:200px;height:200px;border-radius:16px;object-fit:cover;box-shadow:0 0 0 1px var(--ring),0 2px 6px rgba(0,0,0,.06)}
.badge{position:absolute;top:8px;left:8px;min-width:24px;height:24px;padding:0 6px;box-sizing:border-box;border-radius:9999px;background:var(--accent);color:var(--on-accent);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center}
.tile-title{margin:12px 0 0;font-size:16px;line-height:24px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.tile-date{font-size:12px;line-height:18px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile-actions{display:flex;gap:6px;margin:12px 0 0}
.tile-actions .secondary{height:28px;padding:0 12px;font-size:13px}
.carousel:has(> .tile:only-child){overflow:visible}
.carousel > .tile:only-child{width:100%;display:grid;grid-template-columns:112px 1fr;column-gap:16px;align-content:start}
.carousel > .tile:only-child .tile-art{width:112px;height:112px;border-radius:12px;grid-row:span 4}
.carousel > .tile:only-child .tile-title{margin-top:0;white-space:normal;font-size:18px;line-height:26px;font-weight:600}
.carousel > .tile:only-child .badge{display:none}
.briefing > .meta{margin-bottom:4px}
.briefing .list{display:flex;flex-direction:column;gap:0}
.row-wrap{position:relative;display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--divider)}
.row-wrap:first-child{border-top:0}
.row{display:flex;align-items:center;gap:12px;min-width:0;flex:1;min-height:0;padding:0;background:transparent;border-radius:0}
.num{width:24px;height:24px;flex:none;border-radius:9999px;background:var(--accent);color:var(--on-accent);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center}
.what{min-width:0;display:flex;flex-direction:column}
.what b{font-size:14px;line-height:20px;font-weight:500}
.what small{font-size:14px;line-height:20px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.briefing .row-wrap > button{position:absolute;inset:0;width:100%;height:100%;min-height:0;min-width:0;padding:0;border-radius:8px;background:transparent;color:transparent;font-size:0}
.briefing .row-wrap > button:hover{background:var(--divider)}
.briefing .row-wrap::after{content:"\\203A";color:var(--text-2);font-size:20px;line-height:20px;flex:none}
.secondary.say{white-space:normal;height:auto;min-height:36px;padding:8px 14px;border-radius:14px;font-size:13px;line-height:18px;text-align:left}
.tile-actions .calendar{font-size:0;width:28px;padding:0;justify-content:center;gap:0}
.tile-actions .calendar svg{width:16px;height:16px}
.onair-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px 0;min-height:0;background:transparent;border-top:1px solid var(--divider);border-radius:0}
.onair-row:first-child{border-top:0}
.onair-row .thumb{width:40px;height:40px;border-radius:10px;box-shadow:0 0 0 1px var(--ring)}
.onair-row .what{flex:1 1 0;min-width:0}
.onair-row .what b{font-size:14px;line-height:20px;font-weight:500}
.onair-row .what small{font-size:12px;line-height:18px}
.onair-row .primary,.onair-row .secondary{min-height:0;height:32px;padding:0 12px;font-size:13px}
.cap-grid .tile{width:auto;min-width:0}
.cap-grid .tile-title{white-space:normal;margin-top:0}
@media (max-width:480px){.onair-row .what{flex-basis:calc(100% - 52px)}.onair-row .primary{margin-left:52px}.cap-grid{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.side{top:auto;left:10px;right:10px;bottom:10px;width:auto;max-height:42%}}
.tile:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
`;
