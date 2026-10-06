export const metadata = { title: "Terms of use | Radio Milwaukee Finds" };

// Read at request time so the contact address can change without a rebuild.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const contactEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const contact = contactEmail ? <>email <a href={`mailto:${contactEmail}`}>{contactEmail}</a></> : <>contact Radio Milwaukee</>;
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>Terms of use</h1>
      <p>Radio Milwaukee Finds is a free service from Radio Milwaukee that you use by voice, through Alexa. By using it you agree to these terms.</p>

      <h2>What it is</h2>
      <p>Finds answers questions about Radio Milwaukee&rsquo;s stations, songs, stories, shows and events. Its answers come from the station&rsquo;s own published record: our playlists, podcast stories, schedules and event listings. It can be wrong or out of date, so check the details that matter to you, such as a concert&rsquo;s date, with the venue.</p>

      <h2>Your account</h2>
      <p>You can use most of Finds without an account. Saving songs and following artists need a free Radio Milwaukee account. Connecting Apple Music is optional; if you connect it, songs you save are also added to your Apple Music library, and Apple&rsquo;s own terms apply to that service.</p>

      <h2>Supporting Radio Milwaukee (demo)</h2>
      <p>&ldquo;Support Radio Milwaukee&rdquo; is a demo that runs in Amazon Pay&rsquo;s test environment. No real money is charged, and no real gift is shipped.</p>

      <h2>No warranty</h2>
      <p>Finds is provided as it is, without any warranty. We may change it, pause it or stop offering it at any time. To the extent the law allows, Radio Milwaukee is not liable for any loss that comes from using it.</p>

      <h2>Your data</h2>
      <p>The <a href="/privacy">privacy page</a> explains what we store and how to delete it.</p>

      <h2>Contact</h2>
      <p>Questions? {contact}.</p>
    </main>
  );
}
