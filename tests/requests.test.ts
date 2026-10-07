import { describe, expect, it, vi } from "vitest";
import { cleanRequest, milwaukeeDay, openRequest, requestEmail, resendSender, sealRequest } from "@/lib/requests";

const SECRET = "test-secret";

describe("cleanRequest", () => {
  it("trims a song request and keeps an optional note", () => {
    expect(cleanRequest({ kind: "song_request", song: "  No ID ", artist: " Tank and the Bangas ", note: " For my sister " }))
      .toEqual({ kind: "song_request", song: "No ID", artist: "Tank and the Bangas", note: "For my sister" });
  });

  it("flattens newlines and control characters so nothing can reshape the email", () => {
    const r = cleanRequest({ kind: "song_request", song: "No\r\nID\u0007", artist: "Tank" });
    expect(r).toEqual({ kind: "song_request", song: "No ID", artist: "Tank" });
  });

  it("needs a song and an artist", () => {
    expect(cleanRequest({ kind: "song_request", song: " ", artist: "Tank" })).toEqual({ error: "missing_song" });
    expect(cleanRequest({ kind: "song_request", song: "No ID", artist: "" })).toEqual({ error: "missing_artist" });
  });

  it("a 5 O'Clock Shadow suggestion needs the cover artist", () => {
    expect(cleanRequest({ kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails" })).toEqual({ error: "missing_cover_artist" });
    expect(cleanRequest({ kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails", coverArtist: "Johnny Cash" }))
      .toEqual({ kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails", coverArtist: "Johnny Cash" });
  });

  it("caps lengths: 120 for names, 300 for the note", () => {
    const r = cleanRequest({ kind: "song_request", song: "s".repeat(200), artist: "a", note: "n".repeat(400) }) as { song: string; note: string };
    expect(r.song).toHaveLength(120);
    expect(r.note).toHaveLength(300);
  });
});

describe("requestEmail", () => {
  const at = new Date("2026-10-07T22:00:00Z");

  it("a song request", () => {
    const { subject, text } = requestEmail({ kind: "song_request", song: "No ID", artist: "Tank and the Bangas", note: "For my sister" }, at);
    expect(subject).toBe("Song request: No ID — Tank and the Bangas");
    expect(text).toContain("Song: No ID");
    expect(text).toContain("Artist: Tank and the Bangas");
    expect(text).toContain("Note from the listener: For my sister");
    expect(text).toContain("Sent by a listener using Radio Milwaukee in ChatGPT");
  });

  it("a 5 O'Clock Shadow suggestion names the cover and the original", () => {
    const { subject, text } = requestEmail({ kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails", coverArtist: "Johnny Cash" }, at);
    expect(subject).toBe("5 O'Clock Shadow suggestion: Hurt by Johnny Cash (originally Nine Inch Nails)");
    expect(text).toContain("Cover by: Johnny Cash");
    expect(text).toContain("Original artist: Nine Inch Nails");
  });
});

describe("the Send token", () => {
  const request = { kind: "song_request" as const, song: "No ID", artist: "Tank" };
  const now = Date.parse("2026-10-07T18:00:00Z");

  it("opens for the same listener and gives back the exact request", () => {
    expect(openRequest(sealRequest("user_1", request, SECRET, now), "user_1", SECRET, now + 60_000)).toEqual(request);
  });
  it("is refused for another listener", () => {
    expect(openRequest(sealRequest("user_1", request, SECRET, now), "user_2", SECRET, now)).toBeNull();
  });
  it("is refused after 30 minutes", () => {
    expect(openRequest(sealRequest("user_1", request, SECRET, now), "user_1", SECRET, now + 31 * 60_000)).toBeNull();
  });
  it("is refused when altered or sealed with another secret", () => {
    const token = sealRequest("user_1", request, SECRET, now);
    expect(openRequest(token.slice(0, -2) + "xx", "user_1", SECRET, now)).toBeNull();
    expect(openRequest(sealRequest("user_1", request, "other", now), "user_1", SECRET, now)).toBeNull();
  });
  it("is separate from the /give link key (same env secret, different purpose)", () => {
    expect(openRequest(sealRequest("user_1", request, SECRET, now), "user_1", SECRET, now)).not.toBeNull();
  });
});

describe("milwaukeeDay", () => {
  it("counts days in Milwaukee time", () => {
    expect(milwaukeeDay(Date.parse("2026-10-08T03:00:00Z"))).toBe("2026-10-07");
    expect(milwaukeeDay(Date.parse("2026-10-08T06:00:00Z"))).toBe("2026-10-08");
  });
});

describe("resendSender", () => {
  it("posts one plain-text email to the inbox with the API key", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await resendSender({ apiKey: "re_x", from: "Radio Milwaukee requests <requests@rmke.org>", to: "digital@radiomilwaukee.org", fetch: fetch as unknown as typeof globalThis.fetch })({ subject: "S", text: "T" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_x");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Radio Milwaukee requests <requests@rmke.org>", to: ["digital@radiomilwaukee.org"], subject: "S", text: "T" });
  });

  it("throws when Resend refuses, so the request isn't counted as sent", async () => {
    const fetch = vi.fn(async () => new Response("bad", { status: 422 }));
    await expect(resendSender({ apiKey: "k", from: "f", to: "t", fetch: fetch as unknown as typeof globalThis.fetch })({ subject: "S", text: "T" })).rejects.toThrow("Resend 422");
  });
});
