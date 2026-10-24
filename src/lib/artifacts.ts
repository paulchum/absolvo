import fs from "node:fs";
import path from "node:path";
import { renderCard, type CardInput } from "./art/card";
import { findCertificate, readPayload, type CertificateRow, type Receipt } from "./certificates";
import { dataDir } from "./env";
import { HttpError } from "./http";
import { findSin, verdictOf } from "./sins";
import { CLASSES, CARDINAL, latinDate, type Cardinal } from "./taxonomy";
import { buildPass } from "./wallet/apple";

export function cardInput(row: CertificateRow, verifyBase: string): CardInput {
  const payload = readPayload(row);
  return {
    serial: payload.serial,
    title: payload.title,
    epitaph: payload.epitaph,
    latinOrder: payload.sin.latin,
    cardinalLatin: CARDINAL[payload.sin.cardinal as Cardinal]?.latin ?? payload.sin.cardinal,
    cardinalEnglish: payload.sin.english,
    className: payload.sin.className,
    classTitle: CLASSES[payload.sin.severity - 1],
    remission: payload.remission,
    latinDate: latinDate(Date.parse(payload.issuedAt)),
    seal: payload.seal,
    verifyUrl: `${verifyBase}/v/${payload.serial}`,
    dispensation: payload.payment === "dispensation",
    revoked: row.status === "revoked",
    tier: payload.tier ?? "parish"
  };
}

const inflight = new Map<string, Promise<Buffer>>();

/** Renders a card once per certificate state and caches it in the data directory. */
export async function cardFor(serial: string, verifyBase: string) {
  const row = findCertificate(serial);
  if (!row) throw new HttpError(404, "No such certificate.");
  const file = path.join(dataDir(), "cards", `${serial}-${row.status}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const pending = inflight.get(file) ?? (async () => {
    try {
      const png = await renderCard(cardInput(row, verifyBase));
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, png, { mode: 0o600 });
      return png;
    } finally { inflight.delete(file); }
  })();
  inflight.set(file, pending);
  return pending;
}

export async function passFor(serial: string) {
  const row = findCertificate(serial);
  if (!row) throw new HttpError(404, "No such certificate.");
  if (row.status === "revoked") throw new HttpError(410, "This absolution was revoked.");
  const sin = findSin(row.sin_id);
  const receipt = sin?.receipt ? (JSON.parse(sin.receipt) as Receipt) : null;
  return buildPass(readPayload(row), sin ? verdictOf(sin) : null, receipt);
}

/** Started after consumption so the reveal finds the card already pressed. */
export function prerender(serial: string, verifyBase: string) {
  cardFor(serial, verifyBase).catch(error => console.error("Card render failed", error instanceof Error ? error.message : "unknown"));
}
