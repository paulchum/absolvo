import type { NextRequest } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Wraps a route handler so expected failures become JSON and unexpected ones are logged without content. */
export function route<C>(handler: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C) => {
    try { return await handler(request, context); }
    catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
      console.error("Unhandled route error", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
      return Response.json({ error: "The altar faltered. Try again in a moment." }, { status: 500 });
    }
  };
}

export function noStore(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return { ...init, headers };
}
