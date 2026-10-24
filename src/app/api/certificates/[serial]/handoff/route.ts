import type { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { findCertificate } from "@/lib/certificates";
import { appUrl } from "@/lib/env";
import { HttpError, route } from "@/lib/http";
import { handoffToken, requireOwner } from "@/lib/session";

/** A one-hour link for the QR code, so the pass can be carried from desktop to phone. */
export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ serial: string }> }) => {
  const { serial } = await params;
  const row = findCertificate(serial);
  if (!row || row.owner_hash !== requireOwner(request)) throw new HttpError(404, "No such certificate.");
  return json({ url: `${appUrl()}/c/${serial}?t=${handoffToken(serial)}` });
});
