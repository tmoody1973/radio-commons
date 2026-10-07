import { open, seal } from "@/lib/give/token";

/**
 * Song requests and 5 O'Clock Shadow suggestions (88Nine's daily 5 pm cover song), sent from the ChatGPT door to the
 * station's inbox. Nothing sends without the listener tapping Send on the preview card: the card carries a sealed token
 * the model never sees (plan: docs/superpowers/plans/2026-10-07-chatgpt-requests.md).
 */
export type RequestKind = "song_request" | "five_oclock_shadow";
/** fromName: whatever name the listener chose to give the DJ ("Tarik from Bay View"), shown on the card before Send. */
export interface StationRequest { kind: RequestKind; song: string; artist: string; coverArtist?: string; note?: string; fromName?: string }
export type RequestError = "missing_song" | "missing_artist" | "missing_cover_artist";

export const REQUESTS_PER_DAY = 3;
const NAME_MAX = 120;
const NOTE_MAX = 300;
const FROM_MAX = 60;
const TOKEN_TTL_MS = 30 * 60_000;
const TOKEN_PURPOSE = ":station-request"; // keeps request tokens and /give links apart under one env secret

// One line of plain text: no newlines or control characters can reshape the email.
const tidy = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export function cleanRequest(input: { kind: RequestKind; song?: unknown; artist?: unknown; coverArtist?: unknown; note?: unknown; fromName?: unknown }): StationRequest | { error: RequestError } {
  const song = tidy(input.song, NAME_MAX);
  const artist = tidy(input.artist, NAME_MAX);
  const coverArtist = tidy(input.coverArtist, NAME_MAX);
  const note = tidy(input.note, NOTE_MAX);
  const fromName = tidy(input.fromName, FROM_MAX);
  if (!song) return { error: "missing_song" };
  if (!artist) return { error: "missing_artist" };
  if (input.kind === "five_oclock_shadow" && !coverArtist) return { error: "missing_cover_artist" };
  return { kind: input.kind, song, artist, ...(input.kind === "five_oclock_shadow" ? { coverArtist } : {}), ...(note ? { note } : {}), ...(fromName ? { fromName } : {}) };
}

export function requestEmail(r: StationRequest, sentAt: Date): { subject: string; text: string } {
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/Chicago" }).format(sentAt);
  const shadow = r.kind === "five_oclock_shadow";
  const subject = shadow ? `5 O'Clock Shadow suggestion: ${r.song} by ${r.coverArtist} (originally ${r.artist})` : `Song request: ${r.song} — ${r.artist}`;
  const lines = shadow
    ? ["5 O'Clock Shadow suggestion (88Nine's daily 5 pm cover)", "", `Song: ${r.song}`, `Cover by: ${r.coverArtist}`, `Original artist: ${r.artist}`]
    : ["Song request", "", `Song: ${r.song}`, `Artist: ${r.artist}`];
  return { subject, text: [...lines, `From: ${r.fromName ?? "name not given"}`, ...(r.note ? ["", `Note from the listener: ${r.note}`] : []), "", `Sent by a listener using Radio Milwaukee in ChatGPT, ${when} (Milwaukee time).`].join("\n") };
}

export const sealRequest = (listenerId: string, r: StationRequest, secret: string, now = Date.now()) =>
  seal({ l: listenerId, r }, secret + TOKEN_PURPOSE, TOKEN_TTL_MS, now);

/** The request a Send token carries, only for the listener it was made for; null for expired, altered or foreign tokens. */
export function openRequest(token: string | undefined, listenerId: string, secret: string, now = Date.now()): StationRequest | null {
  const value = open(token, secret + TOKEN_PURPOSE, now) as { l?: unknown; r?: StationRequest } | undefined;
  if (!value || value.l !== listenerId || !value.r) return null;
  const again = cleanRequest(value.r);
  return "error" in again ? null : again;
}

/** "2026-10-07": the Milwaukee calendar day, so the daily limit resets at local midnight. */
export const milwaukeeDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(ms);

export interface RequestCounter {
  countToday(listenerId: string, day: string): Promise<number>;
  record(listenerId: string, day: string): Promise<void>;
}

/** The daily count in the listener's Clerk private metadata, beside their membership; null without CLERK_SECRET_KEY. */
export function clerkRequestCounter(secretKey = process.env.CLERK_SECRET_KEY): RequestCounter | null {
  if (!secretKey) return null;
  const client = import("@clerk/nextjs/server").then(({ createClerkClient }) => createClerkClient({ secretKey }));
  const read = async (listenerId: string) => {
    const stored = ((await (await client).users.getUser(listenerId)).privateMetadata as { requests?: { day?: unknown; count?: unknown } }).requests;
    return { day: typeof stored?.day === "string" ? stored.day : "", count: typeof stored?.count === "number" ? stored.count : 0 };
  };
  return {
    async countToday(listenerId, day) {
      const stored = await read(listenerId);
      return stored.day === day ? stored.count : 0;
    },
    // ponytail: read-then-write, so two taps in the same instant could both count as one; fine at 3 a day.
    async record(listenerId, day) {
      const stored = await read(listenerId);
      const count = (stored.day === day ? stored.count : 0) + 1;
      await (await client).users.updateUserMetadata(listenerId, { privateMetadata: { requests: { day, count } } });
    },
  };
}

export type SendEmail = (message: { subject: string; text: string }) => Promise<void>;

/** Resend's REST API (no SDK): one plain-text email. Throws on any refusal so the request isn't counted. */
export function resendSender(opts: { apiKey: string; from: string; to: string; fetch?: typeof fetch; timeoutMs?: number }): SendEmail {
  const fetchImpl = opts.fetch ?? fetch;
  return async ({ subject, text }) => {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opts.from, to: [opts.to], subject, text }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}`);
  };
}

export interface Requests { counter: RequestCounter; send: SendEmail; secret: string }

const DEFAULT_FROM = "Radio Milwaukee requests <requests@rmke.org>";

/** Everything sending needs, or null (requests unavailable) when any piece is missing: fail closed. */
export function requestsFromEnv(): Requests | null {
  const { RESEND_API_KEY: apiKey, STATION_REQUEST_INBOX: to, STATION_REQUEST_FROM: from, GIVE_TOKEN_SECRET: secret } = process.env;
  const counter = clerkRequestCounter();
  if (!apiKey || !to || !secret || !counter) return null;
  return { counter, secret, send: resendSender({ apiKey, to, from: from || DEFAULT_FROM }) };
}
