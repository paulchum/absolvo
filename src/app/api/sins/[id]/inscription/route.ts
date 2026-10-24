import type { NextRequest } from "next/server";
import { json, readJson, sinId } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { assertSameOrigin, requireOwner } from "@/lib/session";
import { inscribe, preview, type Choice } from "@/lib/wall";

type Context = { params: Promise<{ id: string }> };
const CHOICES: Choice[] = ["carve", "class", "secret"];

export const GET = route(async (request: NextRequest, { params }: Context) => json(preview(await sinId(params), requireOwner(request))));

export const POST = route(async (request: NextRequest, { params }: Context) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  const owner = requireOwner(request);
  const body = await readJson<{ choice?: unknown }>(request);
  if (!CHOICES.includes(body?.choice as Choice)) throw new HttpError(400, "Choose: carve, class or secret.");
  const line = inscribe(id, owner, body!.choice as Choice);
  return json({ line, preview: preview(id, owner) });
});
