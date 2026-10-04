export const metadata = { title: "Privacy | Radio Milwaukee Finds" };

const CONTACT_EMAIL = "tarik@radiomilwaukee.org";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>Privacy</h1>
      <p>Finds lets you save songs you hear on Radio Milwaukee by voice, through Alexa, and optionally copy them to Apple Music.</p>

      <h2>What we store</h2>
      <ul>
        <li>An account ID that identifies you to us (it is not your name).</li>
        <li>The songs you saved, and when.</li>
        <li>If you connect Apple Music, an Apple Music token, stored encrypted.</li>
      </ul>

      <h2>Why</h2>
      <p>The account ID and saved songs are how we remember your list between visits. The Apple Music token is only used to add songs you saved to your library.</p>

      <h2>How to delete it</h2>
      <p>Say &ldquo;Alexa, delete my Finds&rdquo; to erase your saved songs and Apple Music link, or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will do it for you.</p>

      <h2>What we do not store</h2>
      <p>Your voice recordings, your email address and your name are not kept in the song database.</p>

      <h2>Contact</h2>
      <p>Radio Milwaukee, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </main>
  );
}
