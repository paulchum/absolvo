import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { findCertificate } from "./certificates";
import { adminToken, secureCookies } from "./env";
import { HttpError } from "./http";
import type { ImageType } from "./slices";
import { ownerHash, verifyHandoff } from "./session";
import { decodeKey, encodeKey, keyCookieName, keyCookiePath, SIN_ID } from "./vault";

/** `Authorization: Bearer $ABSOLVO_ADMIN_TOKEN`, compared in constant time; refused outright when the token is short or unset. */
export function adminAuthorized(request: NextRequest) {
  const expected = adminToken();
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (expected.length < 16 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function sinId(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!SIN_ID.test(id)) throw new HttpError(404, "No such sin.");
  return id;
}

const keyCookie = (id: string, maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: secureCookies(), path: keyCookiePath(id), maxAge });
export function setKeyCookie(response: NextResponse, id: string, key: Buffer) {
  response.cookies.set(keyCookieName(), encodeKey(key), keyCookie(id, 24 * 3600));
}
/** Keeps the key alive through a Checkout that may outlast the original cookie. */
export function refreshKeyCookie(request: NextRequest, response: NextResponse, id: string) {
  const value = request.cookies.get(keyCookieName())?.value;
  if (value && decodeKey(value)) response.cookies.set(keyCookieName(), value, keyCookie(id, 24 * 3600));
}
/** Deleting needs the same path the cookie was set with; cookies().delete(name) would only clear Path=/. */
export function clearKeyCookie(response: NextResponse, id: string) {
  response.cookies.set(keyCookieName(), "", keyCookie(id, 0));
}
export function keyFrom(request: NextRequest) {
  const key = decodeKey(request.cookies.get(keyCookieName())?.value);
  if (!key) throw new HttpError(403, "Thy key is lost — confess again from this browser.", "key_missing");
  return key;
}

/** Owners see their certificates; anyone holding a fresh handoff link may fetch that one. */
export function certificateAccess(request: NextRequest, serial: string) {
  const row = findCertificate(serial);
  if (!row) throw new HttpError(404, "No such certificate.");
  if (row.owner_hash === ownerHash(request) || verifyHandoff(serial, request.nextUrl.searchParams.get("t"))) return row;
  throw new HttpError(404, "No such certificate.");
}

/** Reads a request body with a hard cap, whatever Content-Length claims. */
export async function readCapped(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max) throw new HttpError(413, "That confession is too large (8 MB at most).");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Nothing was confessed.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new HttpError(413, "That confession is too large (8 MB at most)."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Small JSON bodies only; anything malformed or oversized reads as null. */
export async function readJson<T>(request: Request, max = 4096): Promise<T | null> {
  try { return JSON.parse((await readCapped(request, max)).toString("utf8")) as T; }
  catch (error) { if (error instanceof HttpError && error.status === 413) throw error; return null; }
}

/** Width and height from the file header, without decoding, so a decompression bomb is refused unopened. */
export function headerSize(bytes: Buffer, type: ImageType): { width: number; height: number } | null {
  try {
    if (type === "image/png") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (type === "image/gif") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
    if (type === "image/webp") {
      const chunk = bytes.toString("latin1", 12, 16);
      if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
      return null;
    }
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += marker === 0xff ? 1 : 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
  } catch { return null; }
}

export function sniffImage(bytes: Buffer): ImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

export function json(data: unknown, init: ResponseInit = {}) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
