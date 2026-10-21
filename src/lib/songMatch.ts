import type { RecentSong } from "@/lib/playlist";

/** "Sick of the Times (feat. The Linda Lindas)" → "sick of the times", "Zhané" → "zhane", "&" → "and": what a listener would say. */
const spoken = (text: string) =>
  text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[([].*?(feat\.?|ft\.?|with)\b.*?[)\]]/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const mentions = (haystack: string, needle?: string) => !!needle && spoken(haystack).includes(spoken(needle));

/** The play the listener most likely means: title and artist beat either alone; newest wins a tie. */
export function bestRecentMatch(songs: RecentSong[], { title, artist }: { title?: string; artist?: string }): string | null {
  if (!title && !artist) return null;
  const score = (song: RecentSong) =>
    (mentions(song.title, title) ? 2 : 0) + (mentions(song.artist, artist) ? 1 : 0);
  const ranked = songs
    .map((song) => ({ song, points: score(song) }))
    .filter(({ points }) => points >= (title ? 2 : 0) + (artist ? 1 : 0)) // whatever the listener named must match
    .sort((a, b) => b.points - a.points || b.song.playedAt - a.song.playedAt);
  return ranked[0]?.song.playId ?? null;
}
