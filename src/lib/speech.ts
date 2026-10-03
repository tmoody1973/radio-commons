import type { Passage, Story, StoryCardMatch } from "@/lib/backstory";
import { streetAddress } from "@/lib/maps";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
export const NOT_FOUND_SPEECH = "I couldn't find that Radio Milwaukee story.";
export const NOT_ALLOWED_SPEECH = "Detailed answers aren't available for this episode.";
export const NO_PASSAGE_SPEECH = "I couldn't find that in the episode.";
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

/** When in the episode: "18:42", or "1:02:05" past an hour. */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The first passage in the episode's own words, with its moment and (only if an editor confirmed it) who said it.
 * One quote keeps the spoken answer short enough to say word for word; the card shows every passage.
 */
export function spokenPassages(passages: Passage[]): string {
  if (passages.length === 0) return NO_PASSAGE_SPEECH;
  const [first] = passages;
  const more = passages.length - 1;
  const onScreen = more === 0 ? "" : more === 1 ? " One more moment is on the screen." : ` ${more} more moments are on the screen.`;
  return `At ${clock(first.startMs)}, ${first.speaker ?? "the episode"} says: '${first.text}'${onScreen} Want to hear that part?`;
}
