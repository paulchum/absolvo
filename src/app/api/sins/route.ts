import type { NextRequest } from "next/server";
import { headerSize, json, readCapped, setKeyCookie, sniffImage } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { consumeLimit } from "@/lib/rate-limit";
import { maybeSweep } from "@/lib/scheduler";
import { assertSameOrigin, clientIp, ipBucket, keepPilgrim, pilgrim } from "@/lib/session";
import { createSin } from "@/lib/sins";
import { probe } from "@/lib/slices";

const MAX_BYTES = 8 * 1024 * 1024;
/** Tall stitched screenshots fit; decompression bombs do not. */
const MAX_PIXELS = 30_000_000;
const field = (value: FormDataEntryValue | null, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export const POST = route(async (request: NextRequest) => {
  assertSameOrigin(request, { json: false });
  maybeSweep();
  const who = pilgrim(request);
  const ip = clientIp(request);
  if (!consumeLimit(`upload:pilgrim:${who.hash}`, 20, 3_600_000) || (ip && !consumeLimit(`upload:ip:${ipBucket(ip)}`, 40, 3_600_000))) {
    throw new HttpError(429, "Thou confessest too eagerly. Rest awhile.");
  }
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) throw new HttpError(415, "Send the confession as a form.");
  const form = await new Response(new Uint8Array(await readCapped(request, MAX_BYTES + 65_536)), { headers: { "content-type": contentType } }).formData();
  const localTime = field(form.get("localTime"), 40);
  const tz = field(form.get("tz"), 64);
  const file = form.get("file");
  const text = form.get("text");
  let created: { id: string; key: Buffer };
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new HttpError(413, "That confession is too large (8 MB at most).");
    const mediaType = sniffImage(bytes);
    if (!mediaType) throw new HttpError(415, "The Gargoyle eats only PNG, JPEG, WebP or GIF. HEIC must be converted first.");
    const declared = headerSize(bytes, mediaType);
    if (!declared || declared.width < 32 || declared.height < 32 || declared.width > 12_000 || declared.height > 24_000 || declared.width * declared.height > MAX_PIXELS) {
      throw new HttpError(415, "That image is an unreasonable shape.");
    }
    const size = await probe(bytes).catch(() => { throw new HttpError(415, "That image is too mangled to read."); });
    if (size.width !== declared.width || size.height !== declared.height) throw new HttpError(415, "That image is too mangled to read.");
    created = createSin({ owner: who.hash, kind: "image", mediaType, plaintext: bytes, width: size.width, height: size.height, localTime, tz });
    bytes.fill(0);
  } else if (typeof text === "string" && text.trim().length >= 3) {
    if (text.length > 2000) throw new HttpError(413, "Brevity, penitent: two thousand characters at most.");
    created = createSin({ owner: who.hash, kind: "text", mediaType: "text/plain", plaintext: Buffer.from(text.trim(), "utf8"), localTime, tz });
  } else {
    throw new HttpError(400, "Confess something: an image, or at least a few words.");
  }
  const response = json({ id: created.id }, { status: 201 });
  setKeyCookie(response, created.id, created.key);
  created.key.fill(0);
  return keepPilgrim(response, who);
});
