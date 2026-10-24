import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest, NextResponse } from "next/server";
import { appOrigin, clientIpHeader, isLocalOrigin, secureCookies, trustProxy } from "./env";
import { HttpError } from "./http";
import { sessionSecret } from "./signing";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function pilgrimCookieName() { return secureCookies() ? "__Secure-absolvo_pilgrim" : "absolvo_pilgrim"; }

export interface Pilgrim { token: string; hash: string; fresh: boolean }

/** The anonymous pilgrim session that owns sins. Lax so it survives the return from Stripe Checkout. */
export function pilgrim(request: NextRequest): Pilgrim {
  const existing = request.cookies.get(pilgrimCookieName())?.value;
  if (existing && TOKEN.test(existing)) return { token: existing, hash: hashToken(existing), fresh: false };
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), fresh: true };
}
export function ownerHash(request: NextRequest) {
  const value = request.cookies.get(pilgrimCookieName())?.value;
  return value && TOKEN.test(value) ? hashToken(value) : null;
}
export function requireOwner(request: NextRequest) {
  const hash = ownerHash(request);
  if (!hash) throw new HttpError(404, "No such sin.");
  return hash;
}
export function keepPilgrim(response: NextResponse, who: Pilgrim) {
  if (who.fresh) response.cookies.set(pilgrimCookieName(), who.token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

/** Same-origin check for cookie-authenticated mutations (Next only does this for Server Actions). */
export function assertSameOrigin(request: NextRequest, { json = true } = {}) {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site && site !== "same-origin") throw new HttpError(403, "Cross-site requests are refused.");
  if (!origin || ![appOrigin(), request.nextUrl.origin].includes(origin)) throw new HttpError(403, "Cross-site requests are refused.");
  if (json && !(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "Send JSON.");
}

function expandIPv6(address: string) {
  const [head, tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const middle = address.includes("::") ? Array(8 - left.length - right.length).fill("0") : [];
  return [...left, ...middle, ...right].map(part => part.padStart(4, "0").toLowerCase());
}

/** Client address from the trusted proxy header; locally, from Next's forwarded header. Unknown in untrusted production. */
export function clientIp(request: NextRequest) {
  const raw = trustProxy() ? request.headers.get(clientIpHeader()) : isLocalOrigin() ? request.headers.get("x-forwarded-for") || "127.0.0.1" : null;
  const value = raw?.split(",")[0].trim().replace(/^::ffff:(?=\d+\.)/, "") || null;
  return value && isIP(value) ? value : null;
}
/** Rate-limit bucket: IPv4 as-is, IPv6 by /64 so a single host cannot rotate addresses. */
export function ipBucket(ip: string) {
  return isIP(ip) === 6 ? `${expandIPv6(ip).slice(0, 4).join(":")}::/64` : ip;
}

const mac = (purpose: string, body: string) => createHmac("sha256", sessionSecret()).update(`${purpose}:${body}`).digest("base64url");
export function keyedMac(purpose: string, body: string) { return mac(purpose, body); }

/** Short-lived link that lets another device (scanning the QR) fetch a certificate's pass and card. */
export function handoffToken(serial: string, ttlMs = 60 * 60 * 1000) {
  const expires = (Date.now() + ttlMs).toString(36);
  return `${expires}.${mac("handoff", `${serial}.${expires}`)}`;
}
export function verifyHandoff(serial: string, token: string | null) {
  const [expires, signature] = (token || "").split(".");
  if (!expires || !signature || parseInt(expires, 36) < Date.now()) return false;
  const expected = Buffer.from(mac("handoff", `${serial}.${expires}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
