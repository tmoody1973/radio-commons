// The landing page's words, in one place (approved mockup: canvas "Radio Commons Echo Show cards", Landing boards).
// Facts here come from docs/research/2026-10-04-landscape.md; keep them in step.

const GITHUB = "https://github.com/tmoody1973/radio-commons";

export const LANDING = {
  eyebrow: "Radio Milwaukee on Alexa+",
  headline: "Your local station, inside Alexa+.",
  lead: "Ask Alexa about a story you half-remember, the local song you just heard, or what’s on tonight — answered by Radio Milwaukee’s own reporters, hosts and editors.",
  note: "Built for the Alexa+ hackathon, October 2026 · Pilot station: 88Nine Radio Milwaukee",
  // ponytail: null until the demo video exists; the hero button and the video section appear when it's set
  demoVideoUrl: null as string | null,
  pillars: [
    {
      label: "Stories", image: "/landing/story.jpg",
      alt: "Echo Show card: This Bites, September 2026, Frugal dining and new restaurants in Milwaukee, with Play episode and Places",
      ask: "“What was that This Bites episode about frugal dining?”",
      does: "Plays the moment the host said it, maps the places, and answers detail questions in the episode’s own words.",
    },
    {
      label: "Music", image: "/landing/music.jpg",
      alt: "Echo Show card: Milwaukee Music Premiere, Glitzy, Effort, from Say Sorry / You're Right, out October 23, with Play song",
      ask: "“Play the new Glitzy song.”",
      does: "Milwaukee Music Premieres play on demand with credits and the release show; Studio Milwaukee Sessions show the set list.",
    },
    {
      label: "Events", image: "/landing/events.jpg",
      alt: "Echo Show card: a map of live music near El Tsunami with three numbered shows at MKE Ultra, each with Add to calendar",
      ask: "“Any live music near El Tsunami?”",
      does: "Shows near a story’s places from Radio Milwaukee’s event guide, plus the station’s weekly Concert Picks. Add to calendar in one tap.",
    },
  ],
  also: [
    { title: "Weekly briefing", say: "“What’s new at Radio Milwaukee this week?”", does: "The station’s newsletter, read aloud. Each item opens the real story, Concert Picks or the page." },
    { title: "Become a member", say: "“I want to support Radio Milwaukee.”", does: "Monthly membership by voice, paid with Amazon Pay. Sandbox demo: no real money moves." },
    { title: "On air now", say: "“Who’s on 88Nine?”", does: "What’s playing on all four streams, Listen live, and 88Nine’s schedule." },
    { title: "Save that song", say: "“Save that song.”", does: "To your 88Nine Finds and Apple Music. Days later: “What’s new for me?”" },
  ],
  journeyHeadline: "From a play button to a conversation.",
  journeySub: "One listener, one evening. Every sentence reaches into the station’s own systems.",
  journeyToday: "What a smart speaker does with your station today. That’s the whole experience.",
  // Each tool must be a real tool on the server (tests/landingTools.test.ts).
  journey: [
    { say: "“What’s on right now?”", tool: "on_air_now", systems: "Playlist · four live streams" },
    { say: "“Save that song.”", tool: "save_find", systems: "Playlist → Finds → Apple Music → Concerts → Backstory" },
    { say: "“Who’s on tonight?”", tool: "station_schedule", systems: "88Nine’s schedule" },
    { say: "“What’s new at Radio Milwaukee this week?”", tool: "station_briefing", systems: "Weekly newsletter → Backstory" },
    { say: "“Play the first one.”", tool: "get_station_story", systems: "Backstory · the interview’s audio" },
    { say: "“What did he say about Vogelbach?”", tool: "ask_station_story", systems: "Backstory transcript, at the exact second" },
    { say: "“Any shows near there?”", tool: "find_events", systems: "Event guide · map" },
    { say: "“I want to support the station.”", tool: "support_radio_milwaukee", systems: "Amazon Pay (sandbox demo)" },
  ],
  // Every tool the server offers, each in exactly one group (tests/landingTools.test.ts fails when one is missing).
  toolGroups: [
    { name: "Find a story", tools: ["find_station_story", "latest_station_stories", "get_station_story", "ask_station_story", "station_briefing"] },
    { name: "Hear the music", tools: ["on_air_now", "station_schedule", "recent_songs", "search_playlist", "find_song_played", "get_track_story"] },
    { name: "Go out", tools: ["find_events", "station_picks", "station_artist_shows"] },
    { name: "Remember me", tools: ["save_find", "list_finds", "delete_my_finds", "follow_artist", "unfollow_artist", "whats_new_for_me"] },
    { name: "Give", tools: ["support_radio_milwaukee", "cancel_membership"] },
    { name: "Help", tools: ["what_can_you_do"] },
  ],
  howSub: "We built Radio Commons from the systems 88Nine already had, plus one it didn’t.",
  arch: {
    cds: { title: "NPR’s content system", text: "Podcasts, articles, audio" },
    backstorySteps: ["Transcribe every episode", "Check every fact against the episode’s own words", "An editor approves"],
    sources: ["The playlist · 4 streams", "The event guide", "The weekly newsletter", "Amazon Pay"],
    mcpText: "An Alexa+ add-on. Tools for stories, the briefing, songs, events, the schedule and membership, plus Echo Show cards.",
    caption: "Backstory reads NPR’s content system, which every NPR member station already publishes to, so it could power any station’s Alexa+ add-on.",
    label: "Architecture: NPR’s content system feeds Backstory, which transcribes, checks every fact and waits for an editor. Backstory, the playlist, the event guide, the weekly newsletter and Amazon Pay all feed the Radio Commons MCP server, which Alexa+ calls.",
  },
  whyHeadline: "The most loyal listeners are already on smart speakers. All they can do is press play.",
  stats: [
    { value: "40%", text: "of Radio Milwaukee’s stream listening hours are on smart speakers — more than phones (29%) or computers (27%). Triton, August 2026." },
    { value: "9×", text: "as long: a smart-speaker listener stays about nine times longer than a mobile listener." },
  ],
  claim: "As far as we can find, Radio Commons is the first time a public radio station has brought itself into Alexa+, built by the station and open source.",
  claimDetail: "Others wrap broadcasters’ public data, sell news to businesses, or open a commercial station’s live data to chat apps. None brings a public station’s own editor-approved stories, music, events and membership into Alexa+.",
  steps: [
    { title: "The station publishes", text: "Podcasts, music premieres and session write-ups, as it already does, in NPR’s content system." },
    { title: "Backstory reads it", text: "Transcribes every episode and pulls out people, places and songs, each checked against the exact words." },
    { title: "An editor approves", text: "Nothing reaches Alexa until a Radio Milwaukee editor has checked it. Events come from the station’s event guide." },
    { title: "Alexa+ answers", text: "Through the Radio Commons MCP server: tools for stories, songs, events and membership, with Echo Show cards built to Amazon’s design guide." },
  ],
  rules: [
    "Every answer names its show and month.",
    "The station’s real voices, at the exact moment.",
    "Names an editor keeps off Alexa are never said.",
    "Never song lyrics.",
  ],
  stations: [
    { title: "Uses what you already publish", text: "Reads your station’s stories and podcasts from NPR’s content system. No new publishing workflow." },
    { title: "One profile per show", text: "Adding a show means adding a short profile: what to look for, who reviews it." },
    { title: "Open source", text: "The MCP server, the story engine and the review tools are on GitHub." },
  ],
  footer: "Built by Tarik Moody, Director of Strategy and Innovation at Radio Milwaukee, where he’s worked for nearly 20 years · Alexa+ hackathon 2026",
  links: {
    simulator: "/simulator",
    judges: "/how-it-works",
    github: GITHUB,
    research: `${GITHUB}/blob/main/docs/research/2026-10-04-landscape.md`,
  },
} as const;
