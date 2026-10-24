import type { NextRequest } from "next/server";
import { json, sinId } from "@/lib/api";
import { route } from "@/lib/http";
import { assertSameOrigin, requireOwner } from "@/lib/session";
import { summonSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

/** Breaks the Papal Bull: Malphas's sealed verdict is shown and the abyssal price applies. */
export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  return json(clientView(request, summonSin(id, requireOwner(request))));
});
