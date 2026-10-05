// The judges page's words (/how-it-works). Facts come from the listener-memory spec and decision 009
// (rm-playlist-v2), docs/HACKATHON.md, and the reply templates in src/lib/speech.ts. Keep them in step.
// Bracketed words in example replies are filled in live; we don't invent shows or play counts for real artists.

export const HOW_IT_WORKS = {
  eyebrow: "For hackathon judges",
  headline: "One sentence, five services, and a station that remembers you.",
  lead: "Alexa+ keeps the current conversation. Amazon leaves memory across sessions to each add-on, so Radio Commons keeps it: the artists you follow, the list you were just shown, and what changed since you last asked.",
  sections: {
    demo: "The two-session demo",
    flow: "One sentence, five services",
    memory: "What we remember, and how to erase it",
    alexa: "Built on Alexa+",
    status: "Status",
  },
  sessions: [
    {
      label: "Session 1 · Tuesday",
      title: "“Save this.”",
      setup: "A listener hears a song on 88Nine and asks Alexa+ to save it. One reply covers the save, Apple Music, the follow, the next local show and the station’s own story.",
      says: "Alexa, save this.",
      reply: "Saved “[song]” by Tank & The Bangas to your 88Nine Finds, and I’m adding it to Apple Music. I’ll keep an eye out for Tank & The Bangas — they play [venue] in Milwaukee on [day], and we have their Studio Milwaukee story.",
      note: "That story is real: “Studio Milwaukee Session: Tank & The Bangas.” The song, venue and day are filled in live from the playlist and the concert listings. “Save number 3” works too: we remember the numbered list on screen for 30 minutes, on any device.",
    },
    {
      label: "Session 2 · days later",
      title: "“What’s new for me?”",
      setup: "A new conversation. Alexa+ has forgotten the first one; Radio Commons hasn’t. The digest is built from what the station’s DJs actually played, who is playing in town, and the station’s own stories.",
      says: "Alexa, what’s new for me?",
      reply: "Since your last visit: Tank & The Bangas plays [venue] in Milwaukee on [day]. [Station] played Tank & The Bangas [n] times.",
      note: "A show in the next week comes first, then the artists the station played most, then new station stories, then Apple Music news. Alexa speaks the top three items; an Echo Show also shows a card with a tile per artist. A brand-new listener with nothing followed hears the station’s current picks instead.",
    },
  ],
  services: [
    { name: "Playlist", does: "Identifies the play: “number 3” from the list on screen, or the song and artist." },
    { name: "Finds", does: "Saves it to the listener’s 88Nine Finds, in the station’s playlist database." },
    { name: "Apple Music", does: "Adds it to the listener’s library. A background job, so the reply never waits." },
    { name: "Concerts", does: "Follows the artist and finds their next show from AXS and Ticketmaster listings, Milwaukee first." },
    { name: "Backstory", does: "Finds the station’s stories about the artist. A background job, refreshed daily." },
  ],
  flowNote: "The slow parts run off the listener’s path: background jobs store their results, and the next reply reads what is stored. The reply only mentions what is ready.",
  remembered: [
    { what: "Your saved songs", detail: "Artist, title, station and when you saved them. Your 88Nine Finds." },
    { what: "The artists you follow", detail: "Including ones you follow by saving their song, and ones you told us to stop following, so a later save doesn’t follow them again." },
    { what: "The last list you were shown", detail: "Used for 30 minutes so “save number 3” means the song you saw, then replaced by the next list." },
    { what: "When you last asked what’s new", detail: "So the digest tells you only what changed since then." },
  ],
  erase: "Say “Alexa, delete my Finds” and all of it is erased, along with the Apple Music connection. It lives in one database, next to the songs it points to, so there is one place to erase it.",
  notStored: "We remember exact facts, not things said in passing. No voice recordings, no email address and no name are stored with them.",
  memoryWhy: "Why our own tables and not an AI memory service: the things worth remembering are exact song and artist ids, and the playlist database already holds the songs, artists and concerts they point to.",
  alexa: [
    { title: "Add-on manifest", text: "alexa/addon-package/addon.json: Amazon’s add-on manifest, with an MCP integration pointing Alexa+ at our endpoint and example phrases such as “Save that song” and “What’s new for me”. Deployed with npm run alexa:deploy (Amazon’s alexa-ai CLI)." },
    { title: "MCP 2025-11-25, Streamable HTTP", text: "16 tools at /api/mcp: stories, events, songs, Finds and listener memory. Six need a linked account." },
    { title: "Account linking, per Amazon’s spec", text: "Clerk as the sign-in server: OAuth 2.1 with PKCE (S256), refresh tokens, the RFC 8707 resource parameter, and RFC 9728 protected-resource metadata at /.well-known/oauth-protected-resource." },
    { title: "MCP Apps cards", text: "Every answer works by voice alone, and on an Echo Show it also returns a card built to Amazon’s MCP design guide: song lists with artwork and 30-second previews, and the digest." },
  ],
  limits: [
    "Station stories appear only for artists Radio Milwaukee has covered, such as its premieres and Studio Milwaukee sessions.",
    "No proactive notifications: Amazon doesn’t document them for add-ons, so the digest waits for the listener to ask.",
    "Amazon isn’t giving hackathon participants the Alexa+ developer tools, so judges can try every tool in our simulator, which calls the same MCP server.",
  ],
  status: [
    { feature: "Save a song to Finds and Apple Music", state: "Live", detail: "Verified end to end" },
    { feature: "Song recall and recent songs (artwork, 30-second previews)", state: "Live", detail: "88Nine, HYFIN, Rhythm Lab, 414 Music" },
    { feature: "Artist and title search", state: "Live", detail: "About two weeks of plays" },
    { feature: "Credits and the story behind a song", state: "Live", detail: "" },
    { feature: "Alexa+ account linking and the add-on manifest", state: "Live", detail: "Per Amazon’s spec" },
    { feature: "Listener memory in the playlist database", state: "Live", detail: "Follows, last list, digest data, Backstory stories, daily refresh" },
    { feature: "“Save number 3” on any device", state: "In this release", detail: "" },
    { feature: "The one-sentence save reply", state: "In this release", detail: "Save, Apple Music, follow, next show, station story" },
    { feature: "Follow and stop following", state: "In this release", detail: "" },
    { feature: "“What’s new for me?” and its card", state: "In this release", detail: "" },
  ],
  statusDate: "October 4, 2026",
} as const;
