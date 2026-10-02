export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1>Radio Commons</h1>
      <p>
        A listener memory for public radio on Alexa+. Ask for the Radio Milwaukee story you half-remember and hear it back, with its
        source, from the station&rsquo;s own published record.
      </p>
      <p>
        MCP endpoint: <code>/api/mcp</code> (Streamable HTTP). Source:{" "}
        <a href="https://github.com/tmoody1973/radio-commons">github.com/tmoody1973/radio-commons</a>
      </p>
    </main>
  );
}
