import type { NextRequest } from "next/server";
import { adminAuthorized } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { hide } from "@/lib/wall";

/** Moderation: `curl -X POST -H "Authorization: Bearer $ABSOLVO_ADMIN_TOKEN" /api/wall/42/hide`. */
export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  if (!adminAuthorized(request)) throw new HttpError(401, "Unauthorized.");
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) throw new HttpError(404, "No such inscription.");
  return Response.json({ hidden: hide(Number(id)) });
});
