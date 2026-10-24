import type { NextRequest } from "next/server";
import { keyFrom, sinId } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { requireOwner } from "@/lib/session";
import { ownedSin } from "@/lib/sins";
import { unlock } from "@/lib/vault";

/** The fallback path for the burn when the browser lost its own copy: decrypted once more, never cached. */
export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = await sinId(params);
  const sin = ownedSin(id, requireOwner(request));
  if (sin.status !== "paid") throw new HttpError(410, "The relic is gone.");
  const key = keyFrom(request);
  let bytes: Buffer;
  try { bytes = unlock(id, key); }
  catch (error) { throw new HttpError((error as NodeJS.ErrnoException).code === "ENOENT" ? 410 : 403, "The relic cannot be opened."); }
  finally { key.fill(0); }
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": sin.kind === "text" ? "text/plain; charset=utf-8" : sin.media_type, "Cache-Control": "no-store", "Content-Disposition": "inline" } });
});
