export const metadata = { title: "Support | Radio Milwaukee" };

// Read at request time so the address can change without a rebuild.
export const dynamic = "force-dynamic";

// The site's global styles strip link styling; listeners need to see what's clickable.
const LINKS = ".doc a{color:#0b63c5;text-decoration:underline;text-underline-offset:2px}@media (prefers-color-scheme:dark){.doc a{color:#6aa9ff}}";

export default function SupportPage() {
  const email = process.env.STATION_REQUEST_INBOX || "digital@radiomilwaukee.org";
  const mail = <a href={`mailto:${email}`}>{email}</a>;
  return (
    <main className="doc" style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <style>{LINKS}</style>
      <h1>Support</h1>
      <p>Radio Milwaukee in ChatGPT is in <strong>beta</strong>: it&rsquo;s new, and we&rsquo;re still improving it. Tell us what&rsquo;s broken, what&rsquo;s confusing, or what you&rsquo;d like it to do.</p>

      <h2>Send us feedback</h2>
      <p>In ChatGPT, say &ldquo;send feedback to Radio Milwaukee&rdquo;, or tap <strong>Send feedback</strong> on the Radio Milwaukee home. ChatGPT drafts it on a card, and nothing is sent until you tap Send. Or email {mail}.</p>
      <p>It helps to include:</p>
      <ul>
        <li>what you asked,</li>
        <li>what happened, and what you expected,</li>
        <li>whether you were on a phone or a computer,</li>
        <li>a screenshot, if you can (email only).</li>
      </ul>

      <h2>Signing in</h2>
      <p>Saving songs, sending requests and feedback need a Radio Milwaukee sign-in; ChatGPT shows a sign-in screen the first time. If ChatGPT keeps asking you to reconnect, open Radio Milwaukee in ChatGPT&rsquo;s app settings and connect it again. If that doesn&rsquo;t help, email {mail}.</p>

      <h2>Song requests</h2>
      <p>To request a song or suggest a 5 O&rsquo;Clock Shadow cover, say &ldquo;request a song&rdquo; in ChatGPT. Requests go to our DJs, not to support.</p>

      <h2>Your data</h2>
      <p>Say &ldquo;delete my Finds&rdquo; to erase your saved songs, or email {mail} and we will do it for you. See our <a href="/privacy">privacy policy</a> and <a href="/terms">terms</a>.</p>
    </main>
  );
}
