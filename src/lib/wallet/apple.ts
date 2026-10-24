import fs from "node:fs";
import { PKPass } from "passkit-generator";
import { PALETTES } from "../art/card";
import { passImages } from "../art/pass-images";
import type { CertificatePayload, Receipt } from "../certificates";
import { appUrl } from "../env";
import type { Verdict } from "../judgment";
import { remission } from "../taxonomy";
import { developmentCertificates, type PassCertificates } from "./dev-certs";

const rgb = (colour: readonly number[]) => `rgb(${colour.join(", ")})`;

export function appleConfig() {
  const passTypeId = process.env.APPLE_PASS_TYPE_ID || "pass.dev.absolvo";
  const teamId = process.env.APPLE_TEAM_ID || "ABSOLVODEV";
  const real = ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_PASS_CERT", "APPLE_PASS_KEY", "APPLE_WWDR_CERT"].every(name => process.env[name]);
  return { passTypeId, teamId, real };
}

function certificates(): PassCertificates {
  const config = appleConfig();
  if (!config.real) return developmentCertificates(config.passTypeId);
  const read = (name: string) => fs.readFileSync(process.env[name]!, "utf8");
  return { wwdr: read("APPLE_WWDR_CERT"), signerCert: read("APPLE_PASS_CERT"), signerKey: read("APPLE_PASS_KEY"), signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined, development: false };
}

/** Wallet truncates long primary values; cut at a word instead of mid-word. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function passJson(payload: CertificatePayload, verdict: Verdict | null, receipt: Receipt | null) {
  const config = appleConfig();
  const verifyUrl = `${appUrl()}/v/${payload.serial}`;
  const abyssal = payload.tier === "abyssal";
  const palette = PALETTES[payload.tier ?? "parish"];
  const back = [
    verdict?.roast && { key: "roast", label: abyssal ? "THE SERMON OF MALPHAS" : "THE INQUISITOR'S SERMON", value: verdict.roast },
    verdict?.penance && { key: "penance", label: "PENANCE", value: verdict.penance },
    payload.epitaph && { key: "epitaph", label: "EPITAPH", value: payload.epitaph },
    { key: "remission_full", label: "REMISSION", value: payload.remission },
    { key: "seal", label: "THE SEAL OF THY SIN (ITS LIKENESS DESTROYED)", value: payload.seal },
    receipt && { key: "purge", label: "PURGE RECEIPT", value: receipt.steps.map(step => `• ${step.label}`).join("\n") },
    { key: "verify", label: "VERIFY", value: verifyUrl },
    { key: "serial", label: "SERIAL", value: payload.serial },
    payload.payment === "dispensation" && { key: "dispensation", label: "NOTE", value: "Issued by dispensation in development. No payment was taken." }
  ].filter(Boolean);
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: payload.serial,
    organizationName: "Absolvo",
    description: abyssal ? "Black Seal of Absolution" : "Certificate of Absolution",
    foregroundColor: rgb(palette.ink),
    backgroundColor: rgb(palette.ground),
    labelColor: rgb(palette.rubric),
    barcodes: [{ format: "PKBarcodeFormatQR", message: verifyUrl, messageEncoding: "iso-8859-1", altText: payload.serial }],
    eventTicket: {
      headerFields: [{ key: "remission", label: "REMISSION", value: remission(payload.sin.severity, payload.seal).short }],
      primaryFields: [{ key: "sin", label: "ABSOLVED OF", value: clip(payload.title, 32) }],
      secondaryFields: [
        { key: "order", label: `${payload.sin.english.toUpperCase()} · ${payload.sin.className.toUpperCase()}`, value: payload.sin.latin },
        { key: "issued", label: "ISSUED", value: payload.issuedAt, dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleNone" }
      ],
      auxiliaryFields: [
        { key: "from", label: "FROM", value: "Purgatory" },
        { key: "to", label: "TO", value: "Paradise" },
        { key: "gate", label: "GATE", value: "Pearly" }
      ],
      backFields: back
    }
  };
}

/** Builds and signs the .pkpass. Development signing produces a valid file that iPhones refuse. */
export async function buildPass(payload: CertificatePayload, verdict: Verdict | null, receipt: Receipt | null) {
  const certs = certificates();
  const images = await passImages(payload.tier);
  const pass = new PKPass({ ...images, "pass.json": Buffer.from(JSON.stringify(passJson(payload, verdict, receipt))) }, {
    wwdr: certs.wwdr, signerCert: certs.signerCert, signerKey: certs.signerKey, signerKeyPassphrase: certs.signerKeyPassphrase
  });
  return { buffer: pass.getAsBuffer(), development: certs.development };
}
