import type { NextRequest } from "next/server";
import { certificateAccess } from "@/lib/api";
import { cardFor } from "@/lib/artifacts";
import { appUrl } from "@/lib/env";
import { route } from "@/lib/http";

export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ serial: string }> }) => {
  const { serial } = await params;
  certificateAccess(request, serial);
  const png = await cardFor(serial, appUrl());
  const disposition = request.nextUrl.searchParams.has("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(png), { headers: {
    "Content-Type": "image/png",
    "Cache-Control": "private, max-age=600",
    "Content-Disposition": `${disposition}; filename="absolution-${serial}.png"`
  } });
});
