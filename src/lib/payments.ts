import Stripe from "stripe";
import { revokeForSin } from "./certificates";
import { db } from "./db";
import { appUrl, CHECKOUT_MINUTES, price, stripeSecretKey, type Tier } from "./env";
import { HttpError } from "./http";
import { checkoutGate, findSin, isOurCheckout, markPaid, recordCheckout, type PaidOutcome } from "./sins";

export interface PaymentProvider {
  createCheckout(params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string): Promise<Stripe.Checkout.Session>;
  retrieveCheckout(id: string): Promise<Stripe.Checkout.Session>;
  refund(paymentIntent: string, idempotencyKey: string): Promise<Stripe.Refund>;
  constructEvent(body: string, signature: string): Stripe.Event;
}

let stripe: Stripe | undefined;
function stripeClient() {
  if (!stripeSecretKey()) throw new HttpError(503, "Absolution is not open for payment yet.");
  return (stripe ??= new Stripe(stripeSecretKey(), { timeout: 10_000, maxNetworkRetries: 1 }));
}

export function stripeProvider(): PaymentProvider {
  return {
    createCheckout: (params, key) => stripeClient().checkout.sessions.create(params, { idempotencyKey: key }),
    retrieveCheckout: id => stripeClient().checkout.sessions.retrieve(id),
    refund: (paymentIntent, key) => stripeClient().refunds.create({ payment_intent: paymentIntent, reason: "duplicate" }, { idempotencyKey: key }),
    constructEvent: (body, signature) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new HttpError(503, "Webhooks are not configured.");
      try { return stripeClient().webhooks.constructEvent(body, signature, secret); }
      catch { throw new HttpError(400, "Invalid webhook signature."); }
    }
  };
}

const PRODUCTS: Record<Tier, { name: string; description: string }> = {
  parish: { name: "Absolution: one sin", description: "A gargoyle eats your confession and issues a Certificate of Absolution." },
  abyssal: { name: "Abyssal Dispensation: one reserved sin", description: "The Arch-Prelate of the Abyss eats your confession and issues a Black Seal of Absolution." }
};

export function checkoutParams(sinId: string, expiresAt: number, tier: Tier = "parish"): Stripe.Checkout.SessionCreateParams {
  const { cents, currency, priceId } = price(tier);
  return {
    mode: "payment",
    client_reference_id: sinId,
    metadata: { sinId, tier },
    line_items: [priceId ? { price: priceId, quantity: 1 } : { quantity: 1, price_data: { currency, unit_amount: cents, product_data: PRODUCTS[tier] } }],
    // Instant methods only; wallets such as Apple Pay ride on card.
    allowed_payment_method_types: ["card", "link"],
    payment_intent_data: { statement_descriptor_suffix: "ABSOLVO", metadata: { sinId } },
    expires_at: Math.floor(expiresAt / 1000),
    success_url: `${appUrl()}/sin/${sinId}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/sin/${sinId}`
  };
}

export async function startCheckout(sinId: string, owner: string, provider = stripeProvider(), now = Date.now()) {
  const { sin, reuse } = checkoutGate(sinId, owner, now);
  if (reuse) return reuse;
  const expiresAt = now + CHECKOUT_MINUTES * 60_000;
  // One key per attempt: the SDK's own retry reuses it, and a later attempt never collides with different parameters.
  const session = await provider.createCheckout(checkoutParams(sinId, expiresAt, sin.tier), `absolvo-checkout-${sinId}-${Math.floor(expiresAt / 1000)}`);
  if (!session.url) throw new HttpError(502, "Checkout is unavailable. Try again.");
  recordCheckout(sinId, { id: session.id, url: session.url, expiresAt: session.expires_at * 1000 });
  return session.url;
}

const intentOf = (session: Stripe.Checkout.Session) => typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

/** Applies a paid Checkout Session from either path; refunds a duplicate payment for an already-paid sin. */
export async function applySession(session: Stripe.Checkout.Session, provider: PaymentProvider): Promise<PaidOutcome> {
  const sinId = session.client_reference_id;
  if (!sinId || session.metadata?.sinId !== sinId || session.payment_status !== "paid") return "unknown";
  const paymentIntent = intentOf(session);
  const outcome = markPaid(sinId, { mode: "paid", session: session.id, paymentIntent });
  if ((outcome === "duplicate" || outcome === "unpayable") && paymentIntent) await provider.refund(paymentIntent, `absolvo-refund-${session.id}`);
  return outcome;
}

/** The return page: never trusts the URL, only what Stripe says about the sin's own session. */
export async function confirmCheckout(sinId: string, owner: string, sessionId: string, provider = stripeProvider()) {
  const sin = findSin(sinId);
  if (!sin || sin.owner_hash !== owner) throw new HttpError(404, "No such sin.");
  if (sin.paid_at) return "already";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !isOurCheckout(sinId, sessionId)) throw new HttpError(400, "Unknown checkout.");
  const session = await provider.retrieveCheckout(sessionId);
  if (session.client_reference_id !== sinId) throw new HttpError(400, "That payment was for another sin.");
  return applySession(session, provider);
}

export async function handleStripeEvent(event: Stripe.Event, provider = stripeProvider()) {
  if (db().prepare("SELECT 1 FROM stripe_events WHERE id = ?").get(event.id)) return "duplicate";
  const outcome = await processEvent(event, provider);
  db().prepare("INSERT INTO stripe_events (id, type, received_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").run(event.id, event.type, Date.now());
  return outcome;
}

async function processEvent(event: Stripe.Event, provider: PaymentProvider) {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    return applySession(event.data.object, provider);
  }
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const object = event.data.object as { payment_intent?: string | { id: string } | null; refunded?: boolean };
    const intent = typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id;
    if (!intent || (event.type === "charge.refunded" && object.refunded === false)) return "ignored";
    const sin = db().prepare("SELECT id FROM sins WHERE stripe_payment_intent = ?").get(intent) as { id: string } | undefined;
    if (sin) revokeForSin(sin.id);
    return sin ? "revoked" : "ignored";
  }
  return "ignored";
}
