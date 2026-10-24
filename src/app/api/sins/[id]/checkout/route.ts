import type { NextRequest } from "next/server";
import { json, refreshKeyCookie, sinId } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { startCheckout } from "@/lib/payments";
import { consumeLimit } from "@/lib/rate-limit";
import { assertSameOrigin, clientIp, ipBucket, requireOwner } from "@/lib/session";

export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  const owner = requireOwner(request);
  const ip = clientIp(request);
  if (!consumeLimit(`checkout:pilgrim:${owner}`, 12, 3_600_000) || (ip && !consumeLimit(`checkout:ip:${ipBucket(ip)}`, 20, 3_600_000))) {
    throw new HttpError(429, "Too many attempts at the collection plate. Wait a while.");
  }
  const response = json({ url: await startCheckout(id, owner) });
  refreshKeyCookie(request, response, id);
  return response;
});
