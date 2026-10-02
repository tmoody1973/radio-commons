import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 60_000;
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

/**
 * A short-lived link to speak one reply. An <audio> element can't send the passcode header, so the turn hands back
 * a signed token instead: only text this server produced, only for a minute.
 */
export function signSpeech(text: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ t: text, e: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySpeech(token: string, secret: string, now = Date.now()): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !secret) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { t, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { t: string; e: number };
    return typeof t === "string" && now <= e ? t : null;
  } catch {
    return null;
  }
}
