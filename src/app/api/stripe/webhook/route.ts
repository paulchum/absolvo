import type { NextRequest } from "next/server";
import { json, readCapped } from "@/lib/api";
import { HttpError, route } from "@/lib/http";
import { handleStripeEvent, stripeProvider } from "@/lib/payments";

/** Signature-verified against the raw body; exempt from the same-origin check by design. */
export const POST = route(async (request: NextRequest) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "Missing signature.");
  const provider = stripeProvider();
  const event = provider.constructEvent((await readCapped(request, 256 * 1024)).toString("utf8"), signature);
  return json({ received: true, outcome: await handleStripeEvent(event, provider) });
});
