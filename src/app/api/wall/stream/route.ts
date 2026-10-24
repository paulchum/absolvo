import type { NextRequest } from "next/server";
import { startScheduler } from "@/lib/scheduler";
import { clientIp, ipBucket } from "@/lib/session";
import { recent, subscribe, type Inscription } from "@/lib/wall";

export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" };
/** Clients reconnect on their own; a bounded lifetime means no stream can be held forever. */
const LIFETIME_MS = 15 * 60_000;

/** Without this, Next would answer HEAD by running GET and never reading the body, leaking a slot. */
export async function HEAD() {
  return new Response(null, { headers: HEADERS });
}

/** Server-Sent Events: each soul is pushed as it is carved. Resumes from Last-Event-ID after a reconnect. */
export async function GET(request: NextRequest) {
  if (request.signal.aborted) return new Response(null, { status: 204 });
  startScheduler();
  const encoder = new TextEncoder();
  const frame = (entry: Inscription) => encoder.encode(`id: ${entry.id}\nevent: inscription\ndata: ${JSON.stringify(entry)}\n\n`);
  const ip = clientIp(request);
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (bytes: Uint8Array) => { try { controller.enqueue(bytes); } catch { close(); } };
      const unsubscribe = request.signal.aborted ? null : subscribe(entry => send(frame(entry)), ip ? ipBucket(ip) : null);
      if (!unsubscribe) {
        send(encoder.encode("retry: 30000\nevent: full\ndata: {}\n\n"));
        controller.close();
        return;
      }
      const heartbeat = setInterval(() => send(encoder.encode(": still burning\n\n")), 20_000);
      const expiry = setTimeout(() => close(), LIFETIME_MS);
      close = () => {
        clearInterval(heartbeat);
        clearTimeout(expiry);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
      send(encoder.encode("retry: 15000\n\n"));
      const lastId = Number(request.headers.get("last-event-id"));
      if (Number.isSafeInteger(lastId) && lastId > 0) for (const entry of recent({ after: lastId, limit: 50 }).reverse()) send(frame(entry));
    },
    cancel() { close(); }
  });
  return new Response(stream, { headers: HEADERS });
}
