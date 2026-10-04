import type { RecallMatch, RecentSong, Station, TrackFacts } from "@/lib/playlist";
import { localClock } from "@/lib/stationTime";

/** What the song card shows; built from a recall match or from a track's facts. */
export interface SongCard {
  title: string;
  artist: string;
  meta: string;
  artworkUrl: string | null;
  previewUrl: string | null;
  lines: string[];
}

export const STATION_NAMES: Record<Station, string> = { "88nine": "88Nine", hyfin: "HYFIN", "414music": "414 Music", rhythmlab: "Rhythm Lab" };
const ARTWORK_PX = 600;
const MAX_NAMES_PER_CREDIT = 3;
const CREDIT_LABELS = [["producer", "Produced by"], ["writer", "Written by"]] as const;

const showDate = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }).format(ms);

interface Show { venue: string; city: string; startsAtMs: number }
interface Person { value: string }

/** Apple artwork links carry a {w}x{h} size template; the card asks for one real size. */
export const sizedArtwork = (url: string | null) =>
  url ? url.replace(/(\{w\}|%7Bw%7D)x(\{h\}|%7Bh%7D)/i, `${ARTWORK_PX}x${ARTWORK_PX}`) : null;

const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

/** "Produced by A and B", "Written by C": each person once, producers first. */
export function creditLines(facts: TrackFacts): string[] {
  const groups = ((facts as { facts?: Record<string, Person[]> }).facts) ?? {};
  return CREDIT_LABELS.flatMap(([group, label]) => {
    const names = [...new Set((groups[group] ?? []).map((person) => person.value))].slice(0, MAX_NAMES_PER_CREDIT);
    return names.length ? [`${label} ${joinNames(names)}`] : [];
  });
}

const showLine = (shows: Show[] | undefined) =>
  shows && shows[0] ? [`Live at ${shows[0].venue}, ${shows[0].city} · ${showDate(shows[0].startsAtMs)}`] : [];

export const songCardFromMatch = (match: RecallMatch, station: Station): SongCard => ({
  title: match.title,
  artist: match.artist,
  meta: `Played ${localClock(match.playedAt)} on ${STATION_NAMES[station]}`,
  artworkUrl: sizedArtwork(match.artworkUrl),
  previewUrl: match.previewUrl,
  lines: showLine(match.upcomingShows),
});

/** A row in the "last few songs" list: just the time, since the station is in the spoken answer. */
export const songCardFromRecent = (song: RecentSong): SongCard => ({
  title: song.title,
  artist: song.artist,
  meta: localClock(song.playedAt),
  artworkUrl: sizedArtwork(song.artworkUrl),
  previewUrl: song.previewUrl,
  lines: [],
});

export function songCardFromFacts(facts: TrackFacts): SongCard {
  const f = facts as TrackFacts & { title: string; artist: string; album?: string | null; year?: number | null; artworkUrl?: string | null; previewUrl?: string | null; upcomingShows?: Show[] };
  return {
    title: f.title,
    artist: f.artist,
    meta: [f.album, f.year].filter(Boolean).join(" · "),
    artworkUrl: sizedArtwork(f.artworkUrl ?? null),
    previewUrl: f.previewUrl ?? null,
    lines: [...creditLines(facts), ...showLine(f.upcomingShows)],
  };
}
