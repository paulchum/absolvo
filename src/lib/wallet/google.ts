import { createSign } from "node:crypto";
import fs from "node:fs";
import type { CertificatePayload } from "../certificates";
import { appUrl, isLocalOrigin } from "../env";
import { HttpError } from "../http";
import { PALETTES } from "../art/card";

interface ServiceAccount { client_email: string; private_key: string }
const API = "https://walletobjects.googleapis.com/walletobjects/v1";

/** Read at request time: Google Wallet only works with an issuer account and a public HTTPS APP_URL. */
export function googleConfig() {
  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID || "";
  const file = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT || "";
  return { issuer, file, enabled: Boolean(issuer && file && appUrl().startsWith("https://") && !isLocalOrigin()) };
}

function account(): ServiceAccount {
  const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ googleConfig().file, "utf8")) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) throw new Error("GOOGLE_WALLET_SERVICE_ACCOUNT is not a service account key.");
  return parsed as ServiceAccount;
}

export function signJwt(claims: Record<string, unknown>, privateKey: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url")}`;
}

let token: { value: string; expires: number } | undefined;
async function accessToken(service = account()) {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: service.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, service.private_key);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new HttpError(502, "Google Wallet refused our credentials.");
  const json = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

export const classId = (issuer: string) => `${issuer}.absolvo_certificate_v1`;
export const objectId = (issuer: string, serial: string) => `${issuer}.${serial.replace(/[^A-Za-z0-9]/g, "_")}`;
const text = (value: string) => ({ defaultValue: { language: "en", value } });

export function genericObject(payload: CertificatePayload, issuer: string) {
  const abyssal = payload.tier === "abyssal";
  return {
    id: objectId(issuer, payload.serial),
    classId: classId(issuer),
    state: "ACTIVE",
    cardTitle: text("Absolvo"),
    header: text(payload.title),
    subheader: text(abyssal ? "Black Seal of Absolution" : "Certificate of Absolution"),
    hexBackgroundColor: `#${PALETTES[payload.tier ?? "parish"].ground.map(channel => channel.toString(16).padStart(2, "0")).join("")}`,
    logo: { sourceUri: { uri: `${appUrl()}/wallet/google-logo.png` }, contentDescription: text("Absolvo seal") },
    heroImage: { sourceUri: { uri: `${appUrl()}/wallet/${abyssal ? "google-hero-abyssal" : "google-hero"}.png` }, contentDescription: text("The Gargoyle devouring a burning scroll") },
    textModulesData: [
      { id: "order", header: `${payload.sin.english} · ${payload.sin.className}`, body: payload.sin.latin },
      { id: "remission", header: "Remission", body: payload.remission }
    ],
    barcode: { type: "QR_CODE", value: `${appUrl()}/v/${payload.serial}`, alternateText: payload.serial }
  };
}

async function upsert(kind: "genericClass" | "genericObject", id: string, body: unknown, bearer: string) {
  const existing = await fetch(`${API}/${kind}/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${bearer}` } });
  if (existing.ok) return;
  if (existing.status !== 404) throw new HttpError(502, "Google Wallet is unavailable.");
  const created = await fetch(`${API}/${kind}`, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!created.ok && created.status !== 409) throw new HttpError(502, "Google Wallet refused the pass.");
}

/** Creates the class and object first, so the save link carries only their ids and stays short. */
export async function googleSaveUrl(payload: CertificatePayload) {
  const config = googleConfig();
  if (!config.enabled) throw new HttpError(404, "Google Wallet is not configured.");
  const service = account();
  const bearer = await accessToken(service);
  await upsert("genericClass", classId(config.issuer), { id: classId(config.issuer) }, bearer);
  await upsert("genericObject", objectId(config.issuer, payload.serial), genericObject(payload, config.issuer), bearer);
  return saveUrl(payload.serial, config.issuer, service);
}

export function saveUrl(serial: string, issuer: string, service: ServiceAccount) {
  const jwt = signJwt({ iss: service.client_email, aud: "google", typ: "savetowallet", origins: [new URL(appUrl()).origin], payload: { genericObjects: [{ id: objectId(issuer, serial), classId: classId(issuer) }] } }, service.private_key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
