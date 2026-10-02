import { speakDepsFromEnv } from "@/lib/sim/deps";
import { handleSpeak } from "@/lib/sim/speak";

export const preferredRegion = "iad1";

/** GET /api/sim/speak?t=<signed token>: the spoken reply, streamed as Polly makes it. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  let deps;
  try {
    deps = speakDepsFromEnv();
  } catch {
    return new Response("Voice isn't configured.", { status: 503 });
  }
  return handleSpeak(token, deps);
}
