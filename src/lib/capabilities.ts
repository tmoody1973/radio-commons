/**
 * What the add-on can do, for "what can you do?" and the simulator's start screen. Each example is word for word one of
 * the add-on's examplePhrases in alexa/addon-package/addon.json (a test holds them together), so a tap asks exactly what
 * Amazon tells listeners to say.
 */
export interface Capability {
  title: string;
  description: string;
  example: string;
}

export const CAPABILITIES: readonly Capability[] = [
  { title: "Songs", description: "What our stations just played, and when.", example: "What were the last five songs on 88Nine" },
  { title: "Save", description: "Keep a song in your Finds and Apple Music.", example: "Save that song" },
  { title: "Concerts & events", description: "Shows and things to do around Milwaukee.", example: "What concerts are coming up in Milwaukee this weekend" },
  { title: "Stories", description: "Our podcast stories, even half-remembered.", example: "What was that This Bites episode about frugal dining" },
  { title: "Your artists", description: "New plays, shows and stories from artists you follow.", example: "What's new for me" },
  { title: "Station artists", description: "Concerts by artists our stations play.", example: "Do any 88Nine artists have concerts coming up" },
];

// Amazon: keep first-time guidance brief and offer "tell me more" rather than explaining everything up front.
export const CAPABILITIES_SPEECH =
  "I'm Radio Milwaukee. I can tell you what our stations played, save songs to your Finds and Apple Music, find concerts, dig up our stories, and track artists you follow. Tap a tile, or say tell me more.";
