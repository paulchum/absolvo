import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, secureCookies } from "./env";

/**
 * Each sin is sealed with its own AES-256-GCM key. The server keeps the confession only as ciphertext;
 * the key travels in an httpOnly cookie scoped to the sin's API path and is never persisted.
 */
export const SIN_ID = /^[A-Za-z0-9_-]{22}$/;

export function newSinId() { return randomBytes(16).toString("base64url"); }
export function newKey() { return randomBytes(32); }
export function encodeKey(key: Buffer) { return key.toString("base64url"); }
export function decodeKey(value: string | undefined | null) {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const key = Buffer.from(value, "base64url");
  return key.length === 32 ? key : null;
}
export function keyCookieName() { return secureCookies() ? "__Secure-absolvo_key" : "absolvo_key"; }
export function keyCookiePath(id: string) { return `/api/sins/${id}`; }

function file(id: string) {
  if (!SIN_ID.test(id)) throw new Error("Invalid sin.");
  return path.join(dataDir(), "vault", `${id}.sin`);
}
const aad = (id: string) => Buffer.from(`sin:${id}`);

/** A keyed seal: once the key is burned, nobody (including us) can link it back to the confession. */
export function sealOf(key: Buffer, bytes: Buffer) { return createHmac("sha256", key).update(bytes).digest("hex"); }

export function lock(id: string, key: Buffer, plaintext: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(id));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const target = file(id);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600, flag: "wx" });
  return path.basename(target);
}

export function unlock(id: string, key: Buffer) {
  const data = fs.readFileSync(file(id));
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(aad(id));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

export function inVault(id: string) { return fs.existsSync(file(id)); }

/** Removes the ciphertext. Overwriting first would be theatre on copy-on-write and SSD storage; the burned key is the guarantee. */
export function destroy(id: string) {
  try { fs.unlinkSync(file(id)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
