import type { NextRequest } from "next/server";
import { json, sinId } from "@/lib/api";
import { bypassRefusal } from "@/lib/env";
import { HttpError, route } from "@/lib/http";
import { assertSameOrigin, requireOwner } from "@/lib/session";
import { findSin, markPaid, ownedSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

/** Development only: every condition in bypassRefusal is checked on each request. */
export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  if (bypassRefusal(request.headers.get("host") || "", request.headers.get("x-forwarded-for"))) throw new HttpError(404, "Not found.");
  const id = await sinId(params);
  ownedSin(id, requireOwner(request));
  if (markPaid(id, { mode: "dispensation" }) === "unpayable") throw new HttpError(409, "This sin cannot be absolved.");
  return json(clientView(request, findSin(id)!));
});
