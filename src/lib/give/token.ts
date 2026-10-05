import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
// Any length of secret works; the cipher needs exactly 32 bytes.
const keyFrom = (secret: string) => createHash("sha256").update(secret).digest();

/** Any small JSON value, sealed (AES-256-GCM: encrypted, and any change is detected) with an expiry. */
export function seal(value: unknown, secret: string, ttlMs: number, now = Date.now()): string {
  if (!secret) throw new Error("GIVE_TOKEN_SECRET is not set");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ v: value, e: now + ttlMs }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The sealed value, or undefined for an expired, altered, foreign or malformed token. Callers still check its shape. */
export function open(token: string | undefined | null, secret: string, now = Date.now()): unknown {
  if (!token || !secret) return undefined;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    const { v, e } = JSON.parse(plain) as { v?: unknown; e?: unknown };
    return typeof e === "number" && now <= e ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The listener id, sealed for a /give link. The URL carries only ciphertext, never a readable id; like speakToken.ts,
 * but encrypted because the id must not leak.
 */
export const sealListener = (listenerId: string, secret: string, ttlMs: number, now = Date.now()) => seal(listenerId, secret, ttlMs, now);

/** The listener id, or null for an expired, altered, foreign or malformed token. */
export function openListener(token: string | undefined | null, secret: string, now = Date.now()): string | null {
  const value = open(token, secret, now);
  return typeof value === "string" && value ? value : null;
}
