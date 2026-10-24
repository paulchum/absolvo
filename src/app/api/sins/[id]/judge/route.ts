import type { NextRequest } from "next/server";
import { json, keyFrom, sinId } from "@/lib/api";
import { globalJudgmentsPerHour, inquisitorMode, judgmentsPerHour } from "@/lib/env";
import { HttpError, route } from "@/lib/http";
import { judge } from "@/lib/inquisitor";
import { acquireLock, consumeLimit, releaseLock } from "@/lib/rate-limit";
import { assertSameOrigin, clientIp, ipBucket, requireOwner } from "@/lib/session";
import { findSin, JUDGE_LEASE_MS, judgeSin, ownedSin } from "@/lib/sins";
import { clientView } from "@/lib/views";

export const maxDuration = 300;

export const POST = route(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const id = await sinId(params);
  const owner = requireOwner(request);
  const sin = ownedSin(id, owner);
  if (sin.status === "uploaded" || sin.status === "judging") {
    const key = keyFrom(request);
    const ip = clientIp(request);
    if (!consumeLimit(`judge:pilgrim:${owner}`, 10, 3_600_000) || (ip && !consumeLimit(`judge:ip:${ipBucket(ip)}`, judgmentsPerHour(), 3_600_000))) {
      throw new HttpError(429, "The Inquisitor will hear no more from thee this hour.");
    }
    if (inquisitorMode() === "live" && !consumeLimit("judge:global", globalJudgmentsPerHour(), 3_600_000)) {
      throw new HttpError(503, "The Inquisitor is overwhelmed with penitents. Try again within the hour.");
    }
    const lock = `judge:${ip ? ipBucket(ip) : owner}`;
    const token = acquireLock(lock, JUDGE_LEASE_MS);
    if (!token) throw new HttpError(429, "One confession at a time, penitent.");
    try { await judgeSin(id, owner, key, judge); }
    finally { releaseLock(lock, token); key.fill(0); }
  }
  return json(clientView(request, findSin(id)!));
});
