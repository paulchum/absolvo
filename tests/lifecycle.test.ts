import { after, test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { samplePng, useTempData } from "./helpers";
import { db } from "../src/lib/db";
import { checkoutGate, companions, consumeSin, createSin, findSin, judgeSin, markPaid, summonSin, sweep, viewOf } from "../src/lib/sins";
import { judge, judgeMock } from "../src/lib/inquisitor";
import { inVault, newKey } from "../src/lib/vault";
import { certificateForSin, findCertificate, verifyCertificate } from "../src/lib/certificates";
import { applySession, checkoutParams, confirmCheckout, handleStripeEvent, startCheckout, stripeProvider, type PaymentProvider } from "../src/lib/payments";
import { HttpError } from "../src/lib/http";

const data = useTempData("lifecycle");
after(data.cleanup);
process.env.APP_URL = "http://localhost:3020";
delete process.env.DEEPSEEK_API_KEY;

const owner = "a".repeat(64);
async function judgedSin(text?: string) {
  const plaintext = text ? Buffer.from(text) : await samplePng();
  const created = createSin({ owner, kind: text ? "text" : "image", mediaType: text ? "text/plain" : "image/png", plaintext, localTime: "2:13 AM", tz: "America/Vancouver" });
  await judgeSin(created.id, owner, created.key, judgeMock);
  return created;
}

test("a sin is judged, paid by dispensation, consumed once and certified", async () => {
  const { id, key } = await judgedSin();
  const judged = findSin(id)!;
  assert.equal(judged.status, "judged");
  assert.equal(viewOf(judged).payable, true);
  await assert.rejects(judgeSin(id, "b".repeat(64), key, judgeMock), (error: unknown) => error instanceof HttpError && error.status === 404);
  assert.equal(markPaid(id, { mode: "dispensation" }), "paid");
  assert.equal(markPaid(id, { mode: "dispensation" }), "already");
  const first = consumeSin(id, owner);
  assert.equal(first.first, true);
  assert.equal(inVault(id), false);
  const again = consumeSin(id, owner);
  assert.equal(again.first, false);
  assert.equal(again.serial, first.serial);
  assert.deepEqual(again.receipt, first.receipt);
  const certificate = findCertificate(first.serial)!;
  const checked = verifyCertificate(certificate);
  assert.equal(checked.authentic, true);
  assert.equal(checked.payload.payment, "dispensation");
  assert.equal(checked.payload.sin.className.startsWith("Class "), true);
  const consumed = findSin(id)!;
  assert.equal(consumed.status, "consumed");
  assert.deepEqual(JSON.parse(consumed.verdict!).evidence, [], "raw quotations burn with the confession");
  assert.ok(first.receipt.steps.some(step => step.label === "Ciphertext unlinked from the vault"));
  assert.ok(companions(JSON.parse(consumed.verdict!).sin.order) >= 1);
});

test("a wrong key cannot judge, and nothing unpaid can be consumed", async () => {
  const plaintext = await samplePng();
  const { id } = createSin({ owner, kind: "image", mediaType: "image/png", plaintext });
  await assert.rejects(judgeSin(id, owner, newKey(), judgeMock), (error: unknown) => error instanceof HttpError && error.status === 403);
  assert.equal(findSin(id)!.status, "uploaded");
  assert.throws(() => consumeSin(id, owner), (error: unknown) => error instanceof HttpError && error.status === 402);
});

async function recoiled(text: string) {
  const created = createSin({ owner, kind: "text", mediaType: "text/plain", plaintext: Buffer.from(text) });
  await judgeSin(created.id, owner, created.key, judge);
  return created.id;
}

test("a parish refusal is sealed for Malphas, summoned free, sold at the abyssal price and certified as a Black Seal", async () => {
  const id = await recoiled("[[refuse]] the parish will not touch this");
  const sealed = findSin(id)!;
  assert.equal(sealed.status, "abyssal_required");
  assert.equal(sealed.tier, "abyssal");
  assert.equal(inVault(id), true, "the confession waits for Malphas");
  const view = viewOf(sealed);
  assert.equal(view.sealed, true);
  assert.equal(view.verdict, null, "his verdict is withheld until he is summoned");
  assert.equal(view.payable, false);
  assert.equal(view.price, "$4.99");
  assert.throws(() => checkoutGate(id, owner), /Summon the Arch-Prelate first/);
  assert.equal(markPaid(id, { mode: "dispensation" }), "unpayable");
  assert.throws(() => summonSin(id, "b".repeat(64)), (error: unknown) => error instanceof HttpError && error.status === 404);
  summonSin(id, owner);
  summonSin(id, owner);
  const summoned = viewOf(findSin(id)!);
  assert.equal(summoned.sealed, false);
  assert.equal(summoned.verdict?.sin.order, "casus_reservatus");
  assert.equal(summoned.payable, true);
  assert.equal(checkoutGate(id, owner).sin.tier, "abyssal");
  const params = checkoutParams(id, Date.now() + 1_800_000, "abyssal");
  assert.equal(params.line_items![0].price_data!.unit_amount, 499);
  assert.equal(params.line_items![0].price_data!.product_data!.name, "Abyssal Dispensation: one reserved sin");
  assert.equal(markPaid(id, { mode: "dispensation" }), "paid");
  const { serial } = consumeSin(id, owner);
  const row = findCertificate(serial)!;
  assert.equal(row.tier, "abyssal");
  assert.equal(verifyCertificate(row).payload.tier, "abyssal");
  assert.ok(viewOf(findSin(id)!).receipt!.steps.some(step => step.label === "Black Seal signed with Ed25519"));
});

test("when Malphas rejects the sacrifice the confession burns and nothing can be bought", async () => {
  const id = await recoiled("[[malphas-refuses]]");
  assert.equal(findSin(id)!.status, "refused");
  assert.equal(inVault(id), false);
  assert.throws(() => checkoutGate(id, owner), /Only a judged sin/);
  assert.equal(markPaid(id, { mode: "dispensation" }), "unpayable");
});

test("a damned confession gets no absolution, no charge, and burns at once", async () => {
  const id = await recoiled("[[damned]]");
  assert.equal(findSin(id)!.status, "damned");
  assert.equal(inVault(id), false);
  assert.equal(viewOf(findSin(id)!).verdict, null);
  assert.throws(() => checkoutGate(id, owner), /Only a judged sin/);
  assert.equal(markPaid(id, { mode: "dispensation" }), "unpayable");
});

test("parish verdicts stay parish: $1.99, seen before paying, nothing to summon", async () => {
  const { id } = await judgedSin("I ordered a $55 burrito");
  assert.equal(findSin(id)!.tier, "parish");
  const view = viewOf(findSin(id)!);
  assert.equal(view.price, "$1.99");
  assert.equal(view.sealed, false);
  assert.ok(view.verdict);
  assert.throws(() => summonSin(id, owner), /no Reserved Sin/);
});

test("the sweeper expires unpaid sins, spares open checkouts and eats overdue paid ones", async () => {
  const unpaid = await judgedSin("a quiet burrito");
  const open = await judgedSin("another burrito");
  const paid = await judgedSin("one more burrito");
  const later = Date.now() + 25 * 3_600_000;
  db().prepare("UPDATE sins SET checkout_expires_at = ? WHERE id = ?").run(later + 600_000, open.id);
  markPaid(paid.id, { mode: "dispensation" });
  const report = sweep(later);
  assert.equal(findSin(unpaid.id)!.status, "expired");
  assert.equal(inVault(unpaid.id), false);
  assert.equal(findSin(unpaid.id)!.verdict, null);
  assert.equal(findSin(open.id)!.status, "judged");
  assert.equal(findSin(paid.id)!.status, "consumed");
  assert.ok(report.consumed.includes(paid.id));
  assert.equal(viewOf(findSin(paid.id)!).standIn !== null, true);
});

let providers = 0;
function fakeProvider() {
  const prefix = `p${++providers}`;
  const created: { params: Stripe.Checkout.SessionCreateParams; key: string }[] = [];
  const refunds: string[] = [];
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const provider: PaymentProvider = {
    async createCheckout(params, key) {
      created.push({ params, key });
      const id = `cs_test_${prefix}_${created.length}`;
      const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, expires_at: params.expires_at!, client_reference_id: params.client_reference_id!, metadata: params.metadata, payment_status: "unpaid", payment_intent: `pi_${prefix}_${created.length}` } as unknown as Stripe.Checkout.Session;
      sessions.set(session.id, session);
      return session;
    },
    async retrieveCheckout(id) { return sessions.get(id)!; },
    async refund(intent) { refunds.push(intent); return { id: `re_${intent}` } as Stripe.Refund; },
    constructEvent: () => { throw new Error("unused"); }
  };
  const pay = (id: string) => { const session = sessions.get(id)!; (session as { payment_status: string }).payment_status = "paid"; return session; };
  return { provider, created, refunds, pay, sessionId: (n: number) => `cs_test_${prefix}_${n}`, intent: (n: number) => `pi_${prefix}_${n}` };
}

test("checkout uses instant methods, reuses an open session and never trusts the return URL", async () => {
  const { id } = await judgedSin("burrito for checkout");
  const fake = fakeProvider();
  const url = await startCheckout(id, owner, fake.provider);
  assert.equal(await startCheckout(id, owner, fake.provider), url);
  assert.equal(fake.created.length, 1);
  const params = fake.created[0].params;
  assert.equal("payment_method_types" in params, false);
  assert.deepEqual(params.allowed_payment_method_types, ["card", "link"]);
  assert.equal(params.client_reference_id, id);
  assert.equal(params.line_items![0].price_data!.unit_amount, 199);
  assert.equal(params.payment_intent_data!.statement_descriptor_suffix, "ABSOLVO");
  assert.ok(params.success_url!.endsWith(`/sin/${id}?paid={CHECKOUT_SESSION_ID}`));
  assert.equal(await confirmCheckout(id, owner, fake.sessionId(1), fake.provider), "unknown", "an unpaid session grants nothing");
  assert.equal(findSin(id)!.paid_at, null);
  fake.pay(fake.sessionId(1));
  assert.equal(await confirmCheckout(id, owner, fake.sessionId(1), fake.provider), "paid");
  assert.equal(await confirmCheckout(id, owner, fake.sessionId(1), fake.provider), "already");
  await assert.rejects(startCheckout(id, owner, fake.provider), /already paid/);
});

test("webhooks are deduplicated, duplicate payments refunded and refunds revoke the certificate", async () => {
  const { id } = await judgedSin("burrito for webhooks");
  const fake = fakeProvider();
  await startCheckout(id, owner, fake.provider);
  db().prepare("UPDATE sins SET checkout_expires_at = 0 WHERE id = ?").run(id);
  await startCheckout(id, owner, fake.provider, Date.now() + 31 * 60_000);
  assert.equal(fake.created.length, 2);
  const event = (session: Stripe.Checkout.Session, eventId: string) => ({ id: eventId, type: "checkout.session.completed", data: { object: session } }) as unknown as Stripe.Event;
  assert.equal(await handleStripeEvent(event(fake.pay(fake.sessionId(1)), "evt_1"), fake.provider), "paid", "an older open session may still pay");
  assert.equal(await handleStripeEvent(event(fake.pay(fake.sessionId(1)), "evt_1"), fake.provider), "duplicate");
  assert.equal(await handleStripeEvent(event(fake.pay(fake.sessionId(2)), "evt_2"), fake.provider), "duplicate");
  assert.deepEqual(fake.refunds, [fake.intent(2)]);
  const { serial } = consumeSin(id, owner);
  const refund = { id: "evt_3", type: "charge.refunded", data: { object: { payment_intent: fake.intent(1), refunded: true } } } as unknown as Stripe.Event;
  assert.equal(await handleStripeEvent(refund, fake.provider), "revoked");
  assert.equal(certificateForSin(id)!.status, "revoked");
  assert.equal(findCertificate(serial)!.revoked_at !== null, true);
  assert.equal(await applySession({ client_reference_id: id, metadata: { sinId: "other" }, payment_status: "paid" } as unknown as Stripe.Checkout.Session, fake.provider), "unknown");
});

test("a payment that lands after the sin expired is refunded, and the sweeper keeps going", async () => {
  const late = await judgedSin("a burrito never paid for in time");
  const fine = await judgedSin("a burrito paid properly");
  const fake = fakeProvider();
  await startCheckout(late.id, owner, fake.provider);
  markPaid(fine.id, { mode: "dispensation" });
  db().prepare("UPDATE sins SET checkout_expires_at = 0, expires_at = 0 WHERE id = ?").run(late.id);
  sweep(Date.now() + 3 * 3_600_000);
  assert.equal(findSin(late.id)!.status, "expired");
  assert.equal(await applySession(fake.pay(fake.sessionId(1)), fake.provider), "unpayable");
  assert.deepEqual(fake.refunds, [fake.intent(1)]);
  assert.equal(findSin(late.id)!.status, "expired");
  assert.equal(findSin(fine.id)!.status, "consumed", "the grace-period sweep still ate the paid sin");
});

test("a judgment that lost its claim never overwrites newer state", async () => {
  const created = createSin({ owner, kind: "text", mediaType: "text/plain", plaintext: Buffer.from("a slow burrito") });
  await judgeSin(created.id, owner, created.key, async (confession, seal) => {
    db().prepare("UPDATE sins SET judged_at = judged_at + 1 WHERE id = ?").run(created.id);
    return judgeMock(confession, seal);
  });
  const sin = findSin(created.id)!;
  assert.equal(sin.status, "judging");
  assert.equal(sin.verdict, null);
});

test("the return page only confirms checkouts this app created for that sin", async () => {
  const { id } = await judgedSin("burrito for a forged return");
  const fake = fakeProvider();
  await assert.rejects(confirmCheckout(id, owner, "cs_test_forged_123", fake.provider), /Unknown checkout/);
});

test("a webhook is recorded only after it is handled, so Stripe's retry finishes the job", async () => {
  const { id } = await judgedSin("burrito paid twice");
  const fake = fakeProvider();
  await startCheckout(id, owner, fake.provider);
  db().prepare("UPDATE sins SET checkout_expires_at = 0 WHERE id = ?").run(id);
  await startCheckout(id, owner, fake.provider, Date.now() + 31 * 60_000);
  await applySession(fake.pay(fake.sessionId(1)), fake.provider);
  let failures = 1;
  const flaky: PaymentProvider = { ...fake.provider, async refund(intent, key) { if (failures-- > 0) throw new Error("Stripe hiccup"); return fake.provider.refund(intent, key); } };
  const event = { id: "evt_flaky", type: "checkout.session.completed", data: { object: fake.pay(fake.sessionId(2)) } } as unknown as Stripe.Event;
  await assert.rejects(handleStripeEvent(event, flaky), /Stripe hiccup/);
  assert.equal(db().prepare("SELECT 1 FROM stripe_events WHERE id = 'evt_flaky'").get(), undefined);
  assert.equal(await handleStripeEvent(event, flaky), "duplicate");
  assert.deepEqual(fake.refunds, [fake.intent(2)]);
  assert.notEqual(db().prepare("SELECT 1 FROM stripe_events WHERE id = 'evt_flaky'").get(), undefined);
});

test("webhook signatures are verified against the raw body", () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only";
  const body = JSON.stringify({ id: "evt_signed", object: "event", type: "checkout.session.completed", data: { object: {} } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test_only" });
  assert.equal(stripeProvider().constructEvent(body, header).id, "evt_signed");
  assert.throws(() => stripeProvider().constructEvent(`${body} `, header), /Invalid webhook signature/);
});
