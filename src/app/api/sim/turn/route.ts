import { z } from "zod";
import { turnDepsFromEnv } from "@/lib/sim/deps";
import { handleTurn } from "@/lib/sim/turn";

export const preferredRegion = "iad1";
export const maxDuration = 30;

const historySchema = z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(100);

/** One simulated Alexa+ turn. Multipart form: `audio` (file) or `text`, plus `history` (JSON). */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send a multipart form." }, { status: 400 });
  }
  let rawHistory: unknown;
  try {
    rawHistory = JSON.parse(String(form.get("history") ?? "[]"));
  } catch {
    rawHistory = null;
  }
  const history = historySchema.safeParse(rawHistory);
  if (!history.success) return Response.json({ error: "Bad conversation history." }, { status: 400 });
  const audio = form.get("audio");
  const text = form.get("text");
  let deps;
  try {
    deps = turnDepsFromEnv();
  } catch (error) {
    console.error(JSON.stringify({ route: "sim/turn", error: String(error) }));
    return Response.json({ error: "The simulator isn't configured." }, { status: 503 });
  }
  const { status, body } = await handleTurn(
    {
      passcode: request.headers.get("x-sim-passcode"),
      history: history.data,
      audio: audio instanceof File ? { bytes: new Uint8Array(await audio.arrayBuffer()), contentType: audio.type || "audio/webm" } : undefined,
      text: typeof text === "string" && text.trim() ? text : undefined,
    },
    deps,
  );
  return Response.json(body, { status });
}
