import type { Story, StoryCardMatch } from "@/lib/backstory";
import { streetAddress } from "@/lib/maps";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
export const NOT_FOUND_SPEECH = "I couldn't find that Radio Milwaukee story.";
const NO_MATCH = "I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood.";
const PODTRAC = /^https?:\/\/dts\.podtrac\.com\/redirect\.mp3\//;

export function monthYear(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" }).format(ms);
}

/** Podtrac is a download-counting hop that ad blockers block; Dovetail behind it serves the same file. */
export function directAudioUrl(url: string): string {
  return PODTRAC.test(url) ? url.replace(PODTRAC, "https://") : url;
}

const source = (item: { show: string; publishedAt: number }) => `${item.show}, ${monthYear(item.publishedAt)}`;

export function spokenMatches(matches: StoryCardMatch[]): string {
  if (matches.length === 0) return NO_MATCH;
  if (matches.length === 1) return `I found one Radio Milwaukee story: ${matches[0].title}, from ${source(matches[0])}.`;
  const list = matches.map((m, i) => `${i + 1}, ${m.title}, from ${source(m)}`).join("; ");
  return `I found ${matches.length} Radio Milwaukee stories: ${list}. Which one?`;
}

/** Summary labeled as the station's, its source, and one next step: directions to a pinned place, else the episode. */
export function spokenStory(story: Story): string {
  const place = story.places.find((p) => p.lat !== null && p.lng !== null);
  const street = streetAddress(place?.address, place?.name);
  const offer = place
    ? `Would you like directions to ${place.name}${street ? ` at ${street}` : ""}, or to hear the episode?`
    : "Would you like to hear the episode?";
  return `From ${source(story)}: Radio Milwaukee's summary says, ${story.summary} ${offer}`;
}
