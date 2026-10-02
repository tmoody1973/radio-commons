// Name hints so Deepgram spells the station's people and shows right (the same idea Backstory uses for episodes).
const KEYTERMS = ["Radio Milwaukee", "This Bites", "Uniquely Milwaukee", "Ann Christenson", "Tarik Moody", "Kim Shine", "88Nine", "HYFIN"];

/** Deepgram Nova-3, pre-recorded: one short clip in, the transcript out. */
export function deepgramTranscribe(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (bytes: Uint8Array, contentType: string): Promise<string> => {
    const params = new URLSearchParams([["model", "nova-3"], ["smart_format", "true"], ...KEYTERMS.map((t) => ["keyterm", t])]);
    const response = await fetchImpl(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": contentType },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) throw new Error(`Deepgram HTTP ${response.status}`);
    const json = (await response.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
    return json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  };
}
