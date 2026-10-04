import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Sealed (AES-256-GCM) cookie values: base64url of iv(12) ‖ tag(16) ‖ ciphertext of JSON. */

function keyFrom(secretB64: string): Buffer {
  const key = Buffer.from(secretB64, "base64");
  if (key.length !== 32) throw new Error("SIM_SESSION_SECRET must be 32 bytes, base64");
  return key;
}

export function sealSession(data: unknown, secretB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secretB64), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** Null for anything that isn't a cookie we sealed with this secret (tampered, garbage, old secret). */
export function openSession<T = unknown>(sealed: string, secretB64: string): T | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secretB64), raw.subarray(0, 12), { authTagLength: 16 }); // no truncated tags
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const LINK_COOKIE = "sim_link";
export const SESSION_COOKIE = "sim_session";
export const LINK_COOKIE_PATH = "/api/sim/link";

export const cookieOptions = (path: string, maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path,
  maxAge,
});

/** SIM_SESSION_SECRET if it is a usable 32-byte key; null means linking is off (fail closed). */
export function sessionSecret(): string | null {
  const secret = process.env.SIM_SESSION_SECRET;
  if (!secret) return null;
  try {
    keyFrom(secret);
    return secret;
  } catch {
    return null;
  }
}
