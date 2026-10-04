export type ShowSlug = "this-bites" | "uniquely-milwaukee" | "ladies-first" | "milwaukee-music-premiere" | "studio-milwaukee";

export interface Station {
  stationId: "radiomilwaukee";
  name: string;
  shows: { slug: ShowSlug; name: string }[];
}

export const STATIONS: Record<Station["stationId"], Station> = {
  radiomilwaukee: {
    stationId: "radiomilwaukee",
    name: "Radio Milwaukee",
    shows: [
      { slug: "this-bites", name: "This Bites" },
      { slug: "uniquely-milwaukee", name: "Uniquely Milwaukee" },
      { slug: "ladies-first", name: "Ladies First" },
      { slug: "milwaukee-music-premiere", name: "Milwaukee Music Premiere" },
      { slug: "studio-milwaukee", name: "Studio Milwaukee Sessions" },
    ],
  },
};

// ponytail: one station until the multi-station slice; callers already pass stationId through.
export function getStation(stationId: string = "radiomilwaukee"): Station {
  const station = STATIONS[stationId as Station["stationId"]];
  if (!station) throw new Error(`Unknown station: ${stationId}`);
  return station;
}
