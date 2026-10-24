import { performance } from "node:perf_hooks";
import { buildPayload, certificateForSin, insertCertificate, newSerial, type Receipt } from "./certificates";
import { db, tx, utcDay } from "./db";
import { formatPrice, paidGraceMs, unpaidTtlMs, type Tier } from "./env";
import { HttpError } from "./http";
import type { Confession, Outcome } from "./inquisitor";
import { withoutEvidence, type Verdict } from "./judgment";
import { slicesFor } from "./slices";
import { SIN_ID, destroy, inVault, lock, newKey, newSinId, sealOf, unlock } from "./vault";

/** `refused`: the Abyss rejected the sacrifice. `damned`: Malphas damned the penitent. Both are free, and both burn at once. */
export type SinStatus = "uploaded" | "judging" | "judged" | "abyssal_required" | "refused" | "damned" | "paid" | "consumed" | "expired";

export interface SinRow {
  id: string; owner_hash: string; kind: "image" | "text"; media_type: string; bytes: number; width: number | null; height: number | null;
  seal: string; vault_file: string | null; status: SinStatus; verdict: string | null; local_time: string | null; tz: string | null;
  created_at: number; judged_at: number | null; expires_at: number; stripe_session: string | null; checkout_url: string | null;
  checkout_expires_at: number | null; stripe_payment_intent: string | null; paid_at: number | null; payment_mode: "paid" | "dispensation" | null;
  consumed_at: number | null; purged_at: number | null; receipt: string | null; tier: Tier; summoned_at: number | null;
}

export function findSin(id: string) {
  if (!SIN_ID.test(id)) return null;
  return (db().prepare("SELECT * FROM sins WHERE id = ?").get(id) as SinRow | undefined) ?? null;
}
export function ownedSin(id: string, owner: string) {
  const sin = findSin(id);
  if (!sin || sin.owner_hash !== owner) throw new HttpError(404, "No such sin.");
  return sin;
}
export const verdictOf = (sin: SinRow) => (sin.verdict ? (JSON.parse(sin.verdict) as Verdict) : null);
/** A parish verdict is open to buy at once; an abyssal one once Malphas has been summoned. */
const payable = (sin: SinRow) => sin.status === "judged" || (sin.status === "abyssal_required" && sin.summoned_at !== null);

export interface NewSin { owner: string; kind: "image" | "text"; mediaType: string; plaintext: Buffer; width?: number | null; height?: number | null; localTime?: string | null; tz?: string | null }

export function createSin(input: NewSin, now = Date.now()) {
  const id = newSinId();
  const key = newKey();
  const seal = sealOf(key, input.plaintext);
  const vaultFile = lock(id, key, input.plaintext);
  db().prepare(`INSERT INTO sins (id, owner_hash, kind, media_type, bytes, width, height, seal, vault_file, status, local_time, tz, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?)`)
    .run(id, input.owner, input.kind, input.mediaType, input.plaintext.length, input.width ?? null, input.height ?? null, seal, vaultFile, input.localTime ?? null, input.tz ?? null, now, now + unpaidTtlMs());
  return { id, key };
}

/** A judgment, the parish refusal and Malphas included, must end inside this claim on the sin. */
export const JUDGE_LEASE_MS = 300_000;

/** Decrypts in memory, asks the Inquisitor (and Malphas, if he recoils), stores the verdict. A rejected sacrifice is burned at once. */
export async function judgeSin(id: string, owner: string, key: Buffer, judge: (confession: Confession, seal: string) => Promise<Outcome>, now = Date.now()) {
  const sin = ownedSin(id, owner);
  if (sin.status !== "uploaded" && sin.status !== "judging") return sin;
  const claimed = db().prepare("UPDATE sins SET status = 'judging', judged_at = ? WHERE id = ? AND (status = 'uploaded' OR (status = 'judging' AND judged_at < ?))")
    .run(now, id, now - JUDGE_LEASE_MS).changes === 1;
  if (!claimed) throw new HttpError(409, "The Inquisitor is already reading this confession.");
  let plaintext: Buffer | undefined;
  try {
    try { plaintext = unlock(id, key); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(410, "This confession is no longer in the vault.");
      throw new HttpError(403, "Thy key doth not fit this reliquary.");
    }
    const confession: Confession = sin.kind === "text"
      ? { kind: "text", mediaType: sin.media_type, slices: [], text: plaintext.toString("utf8"), localTime: sin.local_time, tz: sin.tz }
      : { kind: "image", mediaType: sin.media_type, slices: await slicesFor(plaintext, sin.media_type), localTime: sin.local_time, tz: sin.tz };
    const outcome = await judge(confession, sin.seal);
    const status: SinStatus = outcome.kind === "refused" ? (outcome.category === "damned" ? "damned" : "refused") : outcome.tier === "abyssal" ? "abyssal_required" : "judged";
    const landed = db().prepare("UPDATE sins SET status = ?, tier = ?, verdict = ?, judged_at = ? WHERE id = ? AND status = 'judging' AND judged_at = ?")
      .run(status, outcome.kind === "verdict" ? outcome.tier : "abyssal", outcome.kind === "verdict" ? JSON.stringify(outcome.verdict) : null, Date.now(), id, now).changes === 1;
    if (landed && (status === "refused" || status === "damned")) burnUnpayable(id);
    return findSin(id)!;
  } catch (error) {
    db().prepare("UPDATE sins SET status = 'uploaded', judged_at = NULL WHERE id = ? AND status = 'judging' AND judged_at = ?").run(id, now);
    throw error;
  } finally {
    plaintext?.fill(0);
  }
}

function burnUnpayable(id: string, now = Date.now()) {
  destroy(id);
  db().prepare("UPDATE sins SET vault_file = NULL, purged_at = ? WHERE id = ?").run(now, id);
}

/** Unseals Malphas's verdict and sets the abyssal price; free, and idempotent. */
export function summonSin(id: string, owner: string, now = Date.now()) {
  const sin = ownedSin(id, owner);
  if (sin.tier === "abyssal" && sin.summoned_at) return sin;
  if (sin.status !== "abyssal_required") throw new HttpError(409, "There is no Reserved Sin here to summon the Arch-Prelate for.");
  db().prepare("UPDATE sins SET summoned_at = ? WHERE id = ? AND summoned_at IS NULL").run(now, id);
  return findSin(id)!;
}

/** Checks a sin can be bought; returns a still-open Checkout URL to reuse rather than mint another. */
export function checkoutGate(id: string, owner: string, now = Date.now()) {
  const sin = ownedSin(id, owner);
  if (sin.status === "paid" || sin.status === "consumed") throw new HttpError(409, "This sin is already paid for.");
  if (sin.status === "abyssal_required" && !sin.summoned_at) throw new HttpError(409, "Summon the Arch-Prelate first.");
  if (!payable(sin)) throw new HttpError(409, "Only a judged sin can be absolved.");
  if (!inVault(id)) throw new HttpError(410, "This confession has crumbled to dust. Confess it again.");
  if (sin.checkout_url && sin.checkout_expires_at && sin.checkout_expires_at > now + 120_000) return { sin, reuse: sin.checkout_url };
  return { sin, reuse: null };
}

export function recordCheckout(id: string, session: { id: string; url: string; expiresAt: number }, now = Date.now()) {
  tx(() => {
    db().prepare("INSERT INTO checkouts (session_id, sin_id, created_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO NOTHING").run(session.id, id, now);
    db().prepare("UPDATE sins SET stripe_session = ?, checkout_url = ?, checkout_expires_at = ?, expires_at = MAX(expires_at, ?) WHERE id = ?")
      .run(session.id, session.url, session.expiresAt, session.expiresAt + 3_600_000, id);
  });
}
export function isOurCheckout(id: string, sessionId: string) {
  return Boolean(db().prepare("SELECT 1 FROM checkouts WHERE session_id = ? AND sin_id = ?").get(sessionId, id));
}

export type PaidOutcome = "paid" | "already" | "duplicate" | "unknown" | "unpayable";

/** Idempotent; shared by the return page and the webhook. A second paid session for the same sin is a duplicate to refund. */
export function markPaid(id: string, payment: { mode: "paid" | "dispensation"; session?: string; paymentIntent?: string | null }, now = Date.now()): PaidOutcome {
  return tx(() => {
    const sin = findSin(id);
    if (!sin) return "unknown";
    if (sin.paid_at) return payment.mode === "dispensation" || !payment.session || sin.stripe_session === payment.session ? "already" : "duplicate";
    if (!payable(sin) || !sin.verdict) return "unpayable";
    db().prepare("UPDATE sins SET status = 'paid', paid_at = ?, payment_mode = ?, stripe_session = COALESCE(?, stripe_session), stripe_payment_intent = ?, checkout_url = NULL WHERE id = ?")
      .run(now, payment.mode, payment.session ?? null, payment.paymentIntent ?? null, id);
    return "paid";
  });
}

const STAND_IN = "The Gargoyle grew impatient and ate it while thou wert away.";

/**
 * Burns the confession and issues the certificate, atomically and idempotently: repeated calls
 * (React StrictMode, double taps, the sweeper) all receive the first receipt.
 */
export function consumeSin(id: string, owner: string | null, now = Date.now()) {
  return tx(() => {
    const sin = owner ? ownedSin(id, owner) : findSin(id);
    if (!sin) throw new HttpError(404, "No such sin.");
    if (sin.status === "consumed") return { receipt: JSON.parse(sin.receipt!) as Receipt, serial: certificateForSin(id)!.serial, first: false };
    if (sin.status !== "paid") throw new HttpError(402, "Absolution must be paid for first.");
    const verdict = verdictOf(sin);
    if (!verdict) throw new HttpError(409, "This sin has no verdict to absolve.");
    const started = performance.now();
    const steps: Receipt["steps"] = [];
    const mark = (label: string) => steps.push({ label, ms: Math.round((performance.now() - started) * 10) / 10 });
    const present = inVault(id);
    mark(present ? `Reliquary found: ${sin.bytes.toLocaleString("en")} bytes of AES-256-GCM ciphertext` : "Reliquary already emptied");
    mark(destroy(id) ? "Ciphertext unlinked from the vault" : "Nothing left to unlink");
    mark("Key revoked: the server never stored it, and thy browser is bidden to forget it");
    mark(`Raw quotations struck from the record (${verdict.evidence.length})`);
    const serial = newSerial(now);
    const payload = buildPayload({ serial, verdict, tier: sin.tier, seal: sin.seal, payment: sin.payment_mode === "dispensation" ? "dispensation" : "paid", purgedAt: now, issuedAt: now });
    insertCertificate(id, sin.owner_hash, payload);
    mark(`Seal of thy sin inscribed: ${sin.seal.slice(0, 16)}…`);
    mark(sin.tier === "abyssal" ? "Black Seal signed with Ed25519" : "Certificate signed with Ed25519");
    const receipt: Receipt = { purgedAt: new Date(now).toISOString(), steps, method: "Per-sin AES-256-GCM; key never persisted; ciphertext unlinked", auto: owner === null };
    db().prepare("UPDATE sins SET status = 'consumed', consumed_at = ?, purged_at = ?, vault_file = NULL, verdict = ?, receipt = ? WHERE id = ?")
      .run(now, now, JSON.stringify(withoutEvidence(verdict)), JSON.stringify(receipt), id);
    db().prepare("INSERT INTO absolutions (day, sin_order, cardinal, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, sin_order) DO UPDATE SET count = count + 1")
      .run(utcDay(now), verdict.sin.order, verdict.sin.cardinal);
    return { receipt, serial, first: true };
  });
}

/** Aggregate comfort: how many others were absolved of this order in the last seven days. */
export function companions(orderId: string, now = Date.now()) {
  const since = utcDay(now - 6 * 86_400_000);
  return (db().prepare("SELECT COALESCE(SUM(count), 0) AS total FROM absolutions WHERE sin_order = ? AND day >= ?").get(orderId, since) as { total: number }).total;
}

export interface SweepReport { expired: number; burned: number; consumed: string[] }

/** Unpaid sins expire; unpayable leftovers burn; paid sins never fed to the Gargoyle are eaten after the grace period. */
export function sweep(now = Date.now()): SweepReport {
  const database = db();
  const stale = database.prepare(`SELECT id FROM sins WHERE status IN ('uploaded', 'judging', 'judged', 'abyssal_required') AND expires_at < ?
    AND (checkout_expires_at IS NULL OR checkout_expires_at < ?)`).all(now, now) as { id: string }[];
  for (const { id } of stale) {
    destroy(id);
    database.prepare("UPDATE sins SET status = 'expired', vault_file = NULL, purged_at = ?, verdict = NULL WHERE id = ? AND status IN ('uploaded', 'judging', 'judged', 'abyssal_required')").run(now, id);
  }
  const leftovers = database.prepare("SELECT id FROM sins WHERE status IN ('refused', 'damned', 'expired') AND vault_file IS NOT NULL").all() as { id: string }[];
  for (const { id } of leftovers) burnUnpayable(id, now);
  const overdue = database.prepare("SELECT id FROM sins WHERE status = 'paid' AND paid_at < ?").all(now - paidGraceMs()) as { id: string }[];
  const consumed: string[] = [];
  for (const { id } of overdue) {
    try { consumeSin(id, null, now); consumed.push(id); }
    catch (error) { console.error("Sweep could not consume a paid sin", error instanceof Error ? error.message : "unknown"); }
  }
  database.prepare("DELETE FROM rate_limits WHERE expires < ?").run(now);
  database.prepare("DELETE FROM locks WHERE expires < ?").run(now);
  return { expired: stale.length, burned: leftovers.length, consumed };
}

export interface SinView {
  id: string;
  kind: "image" | "text";
  status: SinStatus;
  tier: Tier;
  /** True while Malphas's verdict waits behind the Papal Bull; the verdict is withheld until he is summoned. */
  sealed: boolean;
  verdict: Verdict | null;
  price: string;
  payable: boolean;
  paid: boolean;
  dispensation: boolean;
  certificate: string | null;
  receipt: Receipt | null;
  companions: number;
  standIn: string | null;
}

export function viewOf(sin: SinRow): SinView {
  const sealed = sin.status === "abyssal_required" && !sin.summoned_at;
  const verdict = sealed ? null : verdictOf(sin);
  const certificate = sin.status === "consumed" ? certificateForSin(sin.id)?.serial ?? null : null;
  const receipt = sin.receipt ? (JSON.parse(sin.receipt) as Receipt) : null;
  return {
    id: sin.id,
    kind: sin.kind,
    status: sin.status,
    tier: sin.tier,
    sealed,
    verdict,
    price: formatPrice(sin.tier),
    payable: payable(sin) && verdict !== null,
    paid: Boolean(sin.paid_at),
    dispensation: sin.payment_mode === "dispensation",
    certificate,
    receipt,
    companions: verdict ? companions(verdict.sin.order) : 0,
    standIn: receipt?.auto ? STAND_IN : null
  };
}
