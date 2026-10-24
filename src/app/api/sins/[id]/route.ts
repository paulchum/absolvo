import type { NextRequest } from "next/server";
import { json, sinId } from "@/lib/api";
import { route } from "@/lib/http";
import { maybeSweep } from "@/lib/scheduler";
import { requireOwner } from "@/lib/session";
import { ownedSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

export const GET = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  maybeSweep();
  return json(clientView(request, ownedSin(await sinId(params), requireOwner(request))));
});
