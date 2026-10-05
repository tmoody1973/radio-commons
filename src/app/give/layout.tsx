import { TOKENS } from "@/lib/card/tokens";

export const metadata = { title: "Support Radio Milwaukee (demo)", robots: { index: false } };

const THEME_CSS = `
.give-page{--screen:${TOKENS.light.screen};--card:${TOKENS.light.card};--text:${TOKENS.light.text};--muted:${TOKENS.light.muted};--secondary:${TOKENS.light.secondary}}
@media (prefers-color-scheme: dark){.give-page{--screen:${TOKENS.dark.screen};--card:${TOKENS.dark.card};--text:${TOKENS.dark.text};--muted:${TOKENS.dark.muted};--secondary:${TOKENS.dark.secondary}}}
.give-page{min-height:100vh;background:var(--screen);color:var(--text);font:17px/1.5 system-ui,sans-serif}
.give-page .demo-banner{margin:0;padding:12px 16px;background:var(--text);color:var(--card);font-weight:700;text-align:center}
.give-page main{max-width:560px;margin:0 auto;padding:32px 16px 64px}
.give-page h1{font-size:28px;line-height:1.2;margin:0 0 12px}
.give-page .muted{color:var(--muted)}
.give-page a{color:inherit}
.give-page .levels{list-style:none;padding:0;display:grid;gap:8px}
.give-page .levels a{display:block;padding:12px 16px;border-radius:12px;background:var(--secondary);text-decoration:none;font-weight:600}
.give-page .receipt{padding:16px;border-radius:12px;background:var(--secondary);font-variant-numeric:tabular-nums}
.give-page button{font:inherit;font-weight:700;min-height:48px;padding:0 24px;border:0;border-radius:9999px;background:${TOKENS.accent};color:${TOKENS.onAccent};cursor:pointer}
.give-page button:disabled{opacity:.6;cursor:default}`;

/** Every give page: the DEMO banner first, then the page. */
export default function GiveLayout({ children }: LayoutProps<"/give">) {
  return (
    <div className="give-page">
      <style>{THEME_CSS}</style>
      <p className="demo-banner" role="note">DEMO · Amazon Pay sandbox · no real money is charged</p>
      <main>{children}</main>
    </div>
  );
}
