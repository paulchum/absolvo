import type { NextRequest } from "next/server";
import { certificateAccess } from "@/lib/api";
import { readPayload } from "@/lib/certificates";
import { HttpError, route } from "@/lib/http";
import { googleSaveUrl } from "@/lib/wallet/google";

export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ serial: string }> }) => {
  const { serial } = await params;
  const row = certificateAccess(request, serial);
  if (row.status === "revoked") throw new HttpError(410, "This absolution was revoked.");
  return Response.redirect(await googleSaveUrl(readPayload(row)), 302);
});
