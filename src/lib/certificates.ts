import { randomBytes } from "node:crypto";
import { db } from "./db";
import type { Tier } from "./env";
import type { Verdict } from "./judgment";
import { signPayload, verifyPayload } from "./signing";
import { CARDINAL, className, order, remission, roman } from "./taxonomy";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SERIAL = /^ABS-[MDCLXVI]+-[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

function base32(bytes: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += CROCKFORD[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/** ABS-MMXXVI-XXXX-XXXX-XXXX-XXXX: 80 random bits, Crockford base32. */
export function newSerial(now = Date.now()) {
  const code = base32(randomBytes(10));
  return `ABS-${roman(new Date(now).getUTCFullYear())}-${code.match(/.{4}/g)!.join("-")}`;
}

export interface Receipt { purgedAt: string; steps: { label: string; ms: number }[]; method: string; auto: boolean }

export interface CertificatePayload {
  v: 1;
  serial: string;
  issuedAt: string;
  title: string;
  epitaph: string;
  sin: { cardinal: string; order: string; latin: string; english: string; severity: number; className: string };
  remission: string;
  seal: string;
  payment: "paid" | "dispensation";
  purgedAt: string;
  /** Absent on certificates issued before the Abyss opened; those are parish. */
  tier?: Tier;
}

export interface CertificateRow { serial: string; sin_id: string; owner_hash: string; payload: string; signature: string; status: "valid" | "revoked"; issued_at: number; revoked_at: number | null; tier: Tier }

export function buildPayload(input: { serial: string; verdict: Verdict; tier: Tier; seal: string; payment: "paid" | "dispensation"; purgedAt: number; issuedAt: number }): CertificatePayload {
  const { verdict } = input;
  const chosen = order(verdict.sin.order);
  return {
    v: 1,
    serial: input.serial,
    issuedAt: new Date(input.issuedAt).toISOString(),
    title: verdict.title,
    epitaph: verdict.epitaph,
    sin: { cardinal: verdict.sin.cardinal, order: chosen.id, latin: chosen.latin, english: CARDINAL[verdict.sin.cardinal].english, severity: verdict.sin.severity, className: className(verdict.sin.severity) },
    remission: remission(verdict.sin.severity, input.seal).text,
    seal: input.seal,
    payment: input.payment,
    purgedAt: new Date(input.purgedAt).toISOString(),
    tier: input.tier
  };
}

/** Must run inside the consuming transaction so a sin never gets two certificates. */
export function insertCertificate(sinId: string, owner: string, payload: CertificatePayload) {
  const signature = signPayload(payload);
  db().prepare("INSERT INTO certificates (serial, sin_id, owner_hash, payload, signature, status, issued_at, tier) VALUES (?, ?, ?, ?, ?, 'valid', ?, ?)")
    .run(payload.serial, sinId, owner, JSON.stringify(payload), signature, Date.parse(payload.issuedAt), payload.tier ?? "parish");
  return { payload, signature };
}

export function findCertificate(serial: string) {
  if (!SERIAL.test(serial)) return null;
  return (db().prepare("SELECT * FROM certificates WHERE serial = ?").get(serial) as CertificateRow | undefined) ?? null;
}
export function certificateForSin(sinId: string) {
  return (db().prepare("SELECT * FROM certificates WHERE sin_id = ?").get(sinId) as CertificateRow | undefined) ?? null;
}
export function readPayload(row: CertificateRow) { return JSON.parse(row.payload) as CertificatePayload; }
export function verifyCertificate(row: CertificateRow) {
  const payload = readPayload(row);
  return { payload, authentic: verifyPayload(payload, row.signature) && payload.serial === row.serial, status: row.status };
}

export function revokeForSin(sinId: string, now = Date.now()) {
  return db().prepare("UPDATE certificates SET status = 'revoked', revoked_at = ? WHERE sin_id = ? AND status = 'valid'").run(now, sinId).changes > 0;
}
