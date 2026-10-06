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
