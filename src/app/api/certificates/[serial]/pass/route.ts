import type { NextRequest } from "next/server";
import { certificateAccess } from "@/lib/api";
import { passFor } from "@/lib/artifacts";
import { route } from "@/lib/http";

/** Fetched by a plain top-level link so iOS Safari can hand it to Wallet. */
export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ serial: string }> }) => {
  const { serial } = await params;
  certificateAccess(request, serial);
  const { buffer, development } = await passFor(serial);
  const headers = new Headers({
    "Content-Type": "application/vnd.apple.pkpass",
    "Content-Disposition": `attachment; filename="absolution-${serial}.pkpass"`,
    "Cache-Control": "no-store"
  });
  if (development) headers.set("X-Absolvo-Pass-Signing", "development");
  return new Response(new Uint8Array(buffer), { headers });
});
