import { verifySpeech } from "@/lib/sim/speakToken";

export interface SpeakDeps {
  secret: string;
  synthesize(text: string): Promise<ReadableStream<Uint8Array>>;
}

/** Streams the spoken reply as Polly produces it, so the listener hears the start before the end is made. */
export async function handleSpeak(token: string, deps: SpeakDeps): Promise<Response> {
  const text = verifySpeech(token, deps.secret);
  if (!text) return new Response("This speech link is invalid or expired.", { status: 403 });
  try {
    return new Response(await deps.synthesize(text), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ route: "sim/speak", error: String(error) }));
    return new Response("Voice unavailable.", { status: 502 });
  }
}
