import type { NextRequest } from "next/server";
import { bypassRefusal } from "./env";
import { viewOf, type SinRow, type SinView } from "./sins";
import { appleConfig } from "./wallet/apple";
import { googleConfig } from "./wallet/google";

export interface ClientView extends SinView { canDispense: boolean; passSigning: "apple" | "development"; googleWallet: boolean }

/** What the ritual page needs, including per-request facts the client cannot know. */
export function clientView(request: NextRequest, sin: SinRow): ClientView {
  return {
    ...viewOf(sin),
    canDispense: bypassRefusal(request.headers.get("host") || "", request.headers.get("x-forwarded-for")) === null,
    passSigning: appleConfig().real ? "apple" : "development",
    googleWallet: googleConfig().enabled
  };
}
