import { CHAT_RESOURCE_PATH } from "@/lib/mcp";
import { CopyButton } from "./CopyButton";

// An invitation page, not something to find by search.
export const metadata = { title: "Try Radio Milwaukee in ChatGPT (beta)", robots: { index: false, follow: false } };

// Read at request time: the address follows CHATGPT_DOOR_HOST, the same setting the server routes by.
export const dynamic = "force-dynamic";

// The site's global styles strip link styling; listeners need to see what's clickable.
const LINKS = ".doc a{color:#0b63c5;text-decoration:underline;text-underline-offset:2px}@media (prefers-color-scheme:dark){.doc a{color:#6aa9ff}}";

const code = { fontFamily: "ui-monospace, monospace", fontSize: 14, padding: "2px 6px", borderRadius: 6, background: "rgba(127,127,127,.15)", wordBreak: "break-all" as const };

// Five things that show the app at its best; also the positive test cases OpenAI's directory review asks for.
const TRY: [string, string][] = [
  ["Open Radio Milwaukee", "The station at a glance: what's on now, the newest episodes, this week's highlights."],
  ["What's playing on HYFIN right now?", "Tap ▶ Listen live; it plays in the chat."],
  ["What played on 88Nine between 7 and 8 this morning?", "Tap Save on a song you like (this is where you sign in)."],
  ["What's the latest This Bites episode?", "Tap ▶ Play, then Places to see the restaurants on a map."],
  ["What's happening in Milwaukee this weekend?", "Tap Add to calendar on something you'd go to."],
];

export default function BetaPage() {
  const host = process.env.CHATGPT_DOOR_HOST;
  const address = host ? `https://${host}${CHAT_RESOURCE_PATH}` : null;
  return (
    <main className="doc" style={{ maxWidth: 680, margin: "56px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <style>{LINKS}</style>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.7 }}>Beta · invitation</p>
      <h1 style={{ marginTop: 4 }}>Try Radio Milwaukee in ChatGPT</h1>
      <p>Thanks for helping us test it. Radio Milwaukee in ChatGPT lets you listen live, find the song you just heard, save it, hear our stories and podcasts, and see what&rsquo;s happening in Milwaukee, all inside a ChatGPT chat. Setup takes about five minutes.</p>

      <h2>Before you start</h2>
      <ul>
        <li>Use a <strong>computer</strong> and go to <a href="https://chatgpt.com">chatgpt.com</a>, signed in to your ChatGPT account.</li>
        <li>You&rsquo;ll create a free Radio Milwaukee listener account along the way (or use the one you have for Alexa).</li>
      </ul>

      <h2>Set it up</h2>
      <ol>
        <li>Open <a href="https://chatgpt.com/plugins">chatgpt.com/plugins</a>. Click <strong>Add</strong> (top right), then <strong>Add custom MCP server</strong>.</li>
        <li>For <strong>Name</strong>, type <strong>Radio Milwaukee</strong>. Description is optional. For the icon, you can <a href="/brand/chatgpt/icon-256x256.png" download="radio-milwaukee-icon.png">download ours</a> and upload it.</li>
        <li>
          In <strong>Server URL</strong>, paste this address:
          <div style={{ margin: "8px 0" }}>
            {address ? <><code style={code}>{address}</code><CopyButton value={address} /></> : <em>the address in your invitation email</em>}
          </div>
        </li>
        <li>Leave <strong>Authentication</strong> set to <strong>OAuth</strong>.</li>
        <li>ChatGPT shows a warning that custom servers can be risky. It shows that for every plugin that isn&rsquo;t in ChatGPT&rsquo;s directory yet; this one comes from Radio Milwaukee. Tick <strong>I understand and want to continue</strong>.</li>
        <li>Click <strong>Create as a plugin</strong>. Sign in to Radio Milwaukee (or create your account), then choose <strong>Allow</strong>.</li>
        <li>Start a new chat and type: <strong>@Radio Milwaukee open the station home</strong>.</li>
      </ol>

      <h2>5 things to try this week</h2>
      <p>Start each with <strong>@Radio Milwaukee</strong>, or just ask once the app is part of your chat.</p>
      <ol>
        {TRY.map(([ask, then]) => <li key={ask}><strong>&ldquo;{ask}&rdquo;</strong> {then}</li>)}
      </ol>

      <h2>Tell us what you think</h2>
      <p>Say <strong>&ldquo;send feedback to Radio Milwaukee&rdquo;</strong> in ChatGPT, or tap <strong>Send feedback</strong> on the Radio Milwaukee home. ChatGPT puts your words on a card, and nothing is sent until you tap Send. You can also email <a href="mailto:digital@radiomilwaukee.org">digital@radiomilwaukee.org</a>; a screenshot helps.</p>
      <p>The most useful notes: what you asked, what happened, and what you expected.</p>

      <h2>If something goes wrong</h2>
      <ul>
        <li><strong>ChatGPT answers without Radio Milwaukee:</strong> start your message with <strong>@Radio Milwaukee</strong>, or start a new chat.</li>
        <li><strong>&ldquo;Reconnect Radio Milwaukee&rdquo; or &ldquo;connection expired&rdquo;:</strong> choose Reconnect and sign in again. If it keeps happening, tell us.</li>
        <li><strong>On your phone:</strong> set it up on a computer first. We&rsquo;re still learning how it behaves in the ChatGPT phone app, so tell us what you see.</li>
      </ul>
      <p>More help: <a href="/support">support</a>. What we keep and why: <a href="/privacy">privacy</a>.</p>
    </main>
  );
}
