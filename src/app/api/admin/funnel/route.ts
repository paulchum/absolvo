import type { NextRequest } from "next/server";
import { adminAuthorized } from "@/lib/api";
import { HttpError, noStore, route } from "@/lib/http";
import { formatFunnel, funnel } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** `curl -H "Authorization: Bearer $ABSOLVO_ADMIN_TOKEN" "https://<host>/api/admin/funnel?days=30&format=text"`; JSON without `format`. */
export const GET = route(async (request: NextRequest) => {
  if (!adminAuthorized(request)) throw new HttpError(401, "Unauthorized.");
  const days = Number(request.nextUrl.searchParams.get("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new HttpError(400, "days must be a whole number from 1 to 366.");
  const report = funnel(days);
  if (request.nextUrl.searchParams.get("format") === "text") {
    return new Response(`${formatFunnel(report)}\n`, noStore({ headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  }
  return Response.json(report, noStore());
});
