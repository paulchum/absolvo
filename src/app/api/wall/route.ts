import type { NextRequest } from "next/server";
import { route } from "@/lib/http";
import { startScheduler } from "@/lib/scheduler";
import { recent } from "@/lib/wall";

const integer = (value: string | null) => (value && /^\d{1,15}$/.test(value) ? Number(value) : undefined);

export const GET = route(async (request: NextRequest) => {
  startScheduler();
  const search = request.nextUrl.searchParams;
  const entries = recent({ before: integer(search.get("before")), after: integer(search.get("after")), limit: integer(search.get("limit")) });
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
});
