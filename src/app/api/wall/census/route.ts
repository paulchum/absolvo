import { census } from "@/lib/wall";

export async function GET() {
  return Response.json(census(), { headers: { "Cache-Control": "no-store" } });
}
