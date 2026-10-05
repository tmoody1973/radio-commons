export const metadata = { title: "Privacy | Radio Milwaukee Finds" };

// Read at request time so the contact address can change without a rebuild.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const contactEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const contact = contactEmail ? <>email <a href={`mailto:${contactEmail}`}>{contactEmail}</a></> : <>contact Radio Milwaukee</>;
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>Privacy</h1>
      <p>Finds lets you save songs you hear on Radio Milwaukee by voice, through Alexa, and optionally copy them to Apple Music.</p>

      <h2>What we store</h2>
      <p>Radio Milwaukee&rsquo;s song database stores only:</p>
      <ul>
        <li>An account ID that identifies you to us (it is not your name).</li>
        <li>The artist, title and station of each song you saved, and when you saved it.</li>
        <li>If you connect Apple Music, that connection, stored encrypted.</li>
        <li>The artists you follow, including ones you follow automatically by saving one of their songs, and ones you&rsquo;ve told us to stop following, so a later save doesn&rsquo;t follow them again.</li>
        <li>The last list of songs we showed you, used for 30 minutes so you can say &ldquo;save number 3&rdquo;, and replaced by the next list.</li>
        <li>When you last asked what&rsquo;s new, so we can tell you what changed since then.</li>
        <li>Deleting your data erases all of these.</li>
      </ul>

      <h2>Sign-in</h2>
      <p>Signing in is handled by Clerk, our sign-in provider. Clerk holds your email address so you can sign in; it is not copied into our song database.</p>

      <h2>Why</h2>
      <p>The account ID and saved songs are how we remember your list between visits. The Apple Music connection is only used to add songs you saved to your library. We also remember which song you meant, which artists to watch for you, and what&rsquo;s new since your last visit.</p>

      <h2>How to delete it</h2>
      <p>Say &ldquo;Alexa, delete my Finds&rdquo; to erase your saved songs, followed artists and Apple Music link, or {contact} and we will do it for you.</p>

      <h2>What we do not store</h2>
      <p>Your voice recordings, your email address and your name are not kept in the song database.</p>

      <h2>Contact</h2>
      <p>Questions? {contact}.</p>
    </main>
  );
}
