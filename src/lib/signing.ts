import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, isProduction } from "./env";

/** Deterministic JSON: sorted keys, no undefined, no non-finite numbers. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot canonicalize a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  throw new Error(`Cannot canonicalize ${typeof value}.`);
}

/** Reads a secret from the environment or creates one in the data directory (mode 0600) on first use. */
export function persistedSecret(fileName: string, create: () => string, envValue?: string) {
  if (envValue) return envValue;
  const target = path.join(dataDir(), fileName);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
      fs.writeFileSync(target, create(), { mode: 0o600, flag: "wx" });
      if (isProduction()) console.warn(`Generated ${fileName} in the data directory. Back it up with the volume.`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  return fs.readFileSync(target, "utf8").trim();
}

let cached: { privateKey: KeyObject; publicKey: KeyObject; dir: string } | undefined;
function keys() {
  if (cached && cached.dir === dataDir()) return cached;
  const configured = process.env.ABSOLVO_SIGNING_KEY?.trim();
  const pem = persistedSecret("signing-key.pem", () => generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    configured ? (configured.includes("BEGIN") ? configured : Buffer.from(configured, "base64").toString("utf8")) : undefined);
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("ABSOLVO_SIGNING_KEY must be an Ed25519 private key.");
  cached = { privateKey, publicKey: createPublicKey(privateKey), dir: dataDir() };
  return cached;
}

export function signPayload(payload: object) {
  return sign(null, Buffer.from(canonicalize(payload)), keys().privateKey).toString("base64url");
}
export function verifyPayload(payload: object, signature: string, publicKey: KeyObject = keys().publicKey) {
  try { return verify(null, Buffer.from(canonicalize(payload)), publicKey, Buffer.from(signature, "base64url")); }
  catch { return false; }
}
export function publicKeyJwk() { return { ...keys().publicKey.export({ format: "jwk" }), alg: "EdDSA", use: "sig" }; }
export function publicKeyPem() { return keys().publicKey.export({ type: "spki", format: "pem" }).toString(); }

export function sessionSecret() {
  const value = persistedSecret("session-secret", () => randomBytes(32).toString("hex"), process.env.ABSOLVO_SESSION_SECRET?.trim());
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error("ABSOLVO_SESSION_SECRET must be a random 32-byte hex value.");
  return Buffer.from(value, "hex");
}
