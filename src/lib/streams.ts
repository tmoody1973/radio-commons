import type { Station } from "@/lib/playlist";

export const STREAM_HOST = "https://wyms.streamguys1.com";

/** Each station's live stream, as radiomilwaukee.org and hyfin.org play it (AAC, open CORS; checked 2026-10-05). */
export const LIVE_STREAMS: Record<Station, string> = {
  "88nine": `${STREAM_HOST}/live`,
  hyfin: `${STREAM_HOST}/hyfin`,
  "414music": `${STREAM_HOST}/414music_aac`,
  rhythmlab: `${STREAM_HOST}/rhythmLabRadio`,
};
