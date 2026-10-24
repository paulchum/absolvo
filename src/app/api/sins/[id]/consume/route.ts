import type { NextRequest } from "next/server";
import { clearKeyCookie, json, sinId } from "@/lib/api";
import { prerender } from "@/lib/artifacts";
import { appUrl } from "@/lib/env";
import { route } from "@/lib/http";
import { assertSameOrigin, requireOwner } from "@/lib/session";
import { consumeSin, findSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  const result = consumeSin(id, requireOwner(request));
  if (result.first) prerender(result.serial, appUrl());
  const response = json({ serial: result.serial, receipt: result.receipt, view: clientView(request, findSin(id)!) });
  clearKeyCookie(response, id);
  return response;
});
