import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function keyMaterial(): string {
  const k = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!k || k.length < 16) throw new Error("ENCRYPTION_KEY or AUTH_SECRET must be set (16+ chars)");
  return k;
}

function aesKey(): Buffer {
  return createHash("sha256").update(keyMaterial()).digest();
}

/** AES-256-GCM encrypt; output "v1.<iv>.<tag>.<ciphertext>" in base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, dataB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Invalid secret payload");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(data: string, secret?: string): string {
  return createHmac("sha256", secret ?? keyMaterial()).update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Short human-friendly code like TW-X7K92P (no ambiguous chars). */
export function shortCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[b[i] % alphabet.length];
  return out;
}

/**
 * Signed opaque reference for callback payloads (Telegram callback_data ≤ 64 bytes).
 * Format: <prefix>:<id>:<sig12>
 */
export function signRef(prefix: string, id: string): string {
  const sig = hmacHex(`${prefix}:${id}`).slice(0, 12);
  return `${prefix}:${id}:${sig}`;
}

export function verifyRef(data: string): { prefix: string; id: string } | null {
  const parts = data.split(":");
  if (parts.length !== 3) return null;
  const [prefix, id, sig] = parts;
  const expected = hmacHex(`${prefix}:${id}`).slice(0, 12);
  if (!safeEqual(sig, expected)) return null;
  return { prefix, id };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltB, hashB] = stored.split("$");
  if (algo !== "scrypt" || !saltB || !hashB) return false;
  const hash = scryptSync(password, Buffer.from(saltB, "base64url"), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(hash, Buffer.from(hashB, "base64url"));
}
