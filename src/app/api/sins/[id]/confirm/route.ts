import type { NextRequest } from "next/server";
import { json, readJson, sinId } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { confirmCheckout } from "@/lib/payments";
import { consumeLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requireOwner } from "@/lib/session";
import { findSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  const owner = requireOwner(request);
  if (!consumeLimit(`confirm:${owner}`, 30, 3_600_000)) throw new HttpError(429, "Patience, penitent. The ledger is being checked.");
  const body = await readJson<{ session?: unknown }>(request);
  if (typeof body?.session !== "string") throw new HttpError(400, "Which payment?");
  await confirmCheckout(id, owner, body.session);
  return json(clientView(request, findSin(id)!));
});
