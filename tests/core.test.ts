import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { useTempData } from "./helpers";
import { destroy, inVault, lock, newKey, newSinId, sealOf, unlock } from "../src/lib/vault";
import { canonicalize, signPayload, verifyPayload } from "../src/lib/signing";
import { CARDINALS, ORDERS, className, gravity, latinDate, remission, roman, taxonomyTable } from "../src/lib/taxonomy";
import { bypassRefusal, inquisitorMode, wallDelayRange } from "../src/lib/env";
import { assertSameOrigin, handoffToken, ipBucket, verifyHandoff } from "../src/lib/session";
import { placeFromTimezone, soulPhrase } from "../src/lib/places";
import { newSerial, SERIAL } from "../src/lib/certificates";

const data = useTempData("core");
after(data.cleanup);

test("the vault opens only with the sin's own key and forgets on destroy", () => {
  const id = newSinId(), key = newKey(), secret = Buffer.from("a $55 burrito at 2:13 AM");
  lock(id, key, secret);
  const stored = fs.readFileSync(path.join(data.dir, "vault", `${id}.sin`));
  assert.equal(stored.includes(secret), false, "ciphertext must not contain the plaintext");
  assert.deepEqual(unlock(id, key), secret);
  assert.throws(() => unlock(id, newKey()));
  const other = newSinId();
  fs.copyFileSync(path.join(data.dir, "vault", `${id}.sin`), path.join(data.dir, "vault", `${other}.sin`));
  assert.throws(() => unlock(other, key), "the sin id is bound as associated data");
  assert.equal(destroy(id), true);
  assert.equal(inVault(id), false);
  assert.throws(() => unlock(id, key), /ENOENT/);
  assert.equal(destroy(id), false);
  assert.throws(() => unlock("../../etc/passwd", key), /Invalid sin/);
});

test("the seal is keyed, so identical bytes under another key cannot be matched", () => {
  const bytes = Buffer.from("same screenshot");
  assert.notEqual(sealOf(newKey(), bytes), sealOf(newKey(), bytes));
  const key = newKey();
  assert.equal(sealOf(key, bytes), sealOf(key, bytes));
});

test("certificates sign canonical JSON and detect tampering", () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: "é" }, z: undefined }), '{"a":{"c":"é","d":[3,{"x":2,"y":1}]},"b":1}');
  assert.throws(() => canonicalize({ n: Number.NaN }));
  const payload = { serial: "ABS-MMXXVI-AAAA-BBBB-CCCC-DDDD", remission: "Remission of XL days" };
  const signature = signPayload(payload);
  assert.equal(verifyPayload(payload, signature), true);
  assert.equal(verifyPayload({ ...payload, remission: "A Plenary Indulgence" }, signature), false);
  assert.equal(verifyPayload(payload, signature, generateKeyPairSync("ed25519").publicKey), false);
  assert.equal(fs.statSync(path.join(data.dir, "signing-key.pem")).mode & 0o777, 0o600);
});

test("serials carry 80 random bits in Crockford base32", () => {
  const serials = new Set(Array.from({ length: 200 }, () => newSerial(Date.UTC(2026, 9, 23))));
  assert.equal(serials.size, 200);
  for (const serial of serials) assert.match(serial, SERIAL);
  assert.ok([...serials][0].startsWith("ABS-MMXXVI-"));
});

test("the taxonomy, classes and remissions read like a fifteenth-century indulgence", () => {
  assert.equal(roman(2026), "MMXXVI");
  assert.equal(roman(4), "IV");
  assert.equal(className(4), "Class IV");
  assert.equal(className(99), "Class VII");
  assert.deepEqual([1, 2, 3, 5, 6, 7].map(gravity), ["venial", "venial", "grievous", "grievous", "mortal", "mortal"]);
  assert.equal(remission(1, "00000000").text, "Remission of XL days");
  assert.equal(remission(6, "ffffffff").text, "Remission of VII years & VII quarantines");
  assert.equal(remission(7, "00").text, "A Plenary Indulgence");
  assert.match(remission(4, "0000000a").text, /^Remission of [IVX]+ years? (& [IVX]+ quarantines?)?/);
  assert.equal(latinDate(Date.UTC(2026, 9, 23)), "die XXIII mensis Octobris, anno Domini MMXXVI");
  for (const entry of ORDERS) assert.ok(entry.cardinal === null || CARDINALS.includes(entry.cardinal));
  const table = taxonomyTable({ reserved: true });
  for (const entry of ORDERS) assert.ok(table.includes(`"${entry.id}"`), entry.id);
  assert.ok(!taxonomyTable().includes(`"casus_reservatus"`), "only Malphas hears of the Reserved Sin");
});

test("the dispensation is refused anywhere but a developer's machine", () => {
  process.env.ABSOLVO_DEV_BYPASS = "true";
  process.env.APP_URL = "http://localhost:3020";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  assert.equal(bypassRefusal("localhost:3020", "127.0.0.1"), null);
  assert.equal(bypassRefusal("127.0.0.1:3020", null), null);
  assert.match(bypassRefusal("absolvo.example:3020", "127.0.0.1")!, /this machine/);
  assert.match(bypassRefusal("localhost:3020", "203.0.113.9")!, /this machine/);
  process.env.STRIPE_SECRET_KEY = "sk_live_real";
  assert.match(bypassRefusal("localhost:3020", "127.0.0.1")!, /live Stripe/);
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.APP_URL = "https://absolvo.example";
  assert.match(bypassRefusal("localhost:3020", "127.0.0.1")!, /public/);
  process.env.APP_URL = "http://localhost:3020";
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "production";
  assert.match(bypassRefusal("localhost:3020", "127.0.0.1")!, /production builds/);
  env.ABSOLVO_DEV_BYPASS_IN_PRODUCTION = "true";
  assert.equal(bypassRefusal("localhost:3020", "127.0.0.1"), null);
  delete env.ABSOLVO_DEV_BYPASS_IN_PRODUCTION;
  env.NODE_ENV = "test";
  process.env.ABSOLVO_DEV_BYPASS = "false";
  assert.match(bypassRefusal("localhost:3020", "127.0.0.1")!, /disabled/);
});

test("configuration parses the wall delay and picks the mock Inquisitor without credentials", () => {
  process.env.ABSOLVO_WALL_DELAY_SECONDS = "30-180";
  assert.deepEqual(wallDelayRange(), [30_000, 180_000]);
  process.env.ABSOLVO_WALL_DELAY_SECONDS = "0";
  assert.deepEqual(wallDelayRange(), [0, 0]);
  process.env.ABSOLVO_WALL_DELAY_SECONDS = "9-3";
  assert.throws(() => wallDelayRange());
  delete process.env.ABSOLVO_WALL_DELAY_SECONDS;
  const saved = process.env.ABSOLVO_INQUISITOR;
  process.env.ABSOLVO_INQUISITOR = "auto";
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(inquisitorMode(), "mock");
  process.env.ANTHROPIC_API_KEY = "sk-ant-placeholder";
  assert.equal(inquisitorMode(), "live");
  delete process.env.ANTHROPIC_API_KEY;
  process.env.ABSOLVO_INQUISITOR = saved;
});

test("sessions refuse cross-site mutations and bucket IPv6 by /64", () => {
  process.env.APP_URL = "http://localhost:3020";
  const post = (headers: Record<string, string>) => new NextRequest("http://localhost:3020/api/sins/x/checkout", { method: "POST", headers });
  assert.doesNotThrow(() => assertSameOrigin(post({ origin: "http://localhost:3020", "sec-fetch-site": "same-origin", "content-type": "application/json" })));
  assert.throws(() => assertSameOrigin(post({ origin: "https://evil.example", "content-type": "application/json" })), /Cross-site/);
  assert.throws(() => assertSameOrigin(post({ origin: "http://localhost:3020", "sec-fetch-site": "cross-site", "content-type": "application/json" })), /Cross-site/);
  assert.throws(() => assertSameOrigin(post({ "content-type": "application/json" })), /Cross-site/);
  assert.throws(() => assertSameOrigin(post({ origin: "http://localhost:3020", "content-type": "text/plain" })), /JSON/);
  assert.doesNotThrow(() => assertSameOrigin(post({ origin: "http://localhost:3020", "content-type": "multipart/form-data; boundary=x" }), { json: false }));
  assert.equal(ipBucket("2001:db8:85a3::8a2e:370:7334"), "2001:0db8:85a3:0000::/64");
  assert.equal(ipBucket("2001:db8:85a3:0:ffff::1"), "2001:0db8:85a3:0000::/64");
  assert.equal(ipBucket("203.0.113.9"), "203.0.113.9");
});

test("handoff links work for their certificate only and expire", () => {
  const serial = "ABS-MMXXVI-AAAA-BBBB-CCCC-DDDD";
  const token = handoffToken(serial);
  assert.equal(verifyHandoff(serial, token), true);
  assert.equal(verifyHandoff("ABS-MMXXVI-AAAA-BBBB-CCCC-EEEE", token), false);
  assert.equal(verifyHandoff(serial, handoffToken(serial, -1000)), false);
  assert.equal(verifyHandoff(serial, null), false);
  assert.equal(verifyHandoff(serial, `${token}x`), false);
});

test("the Graveyard place is only the coarse city that names the timezone", () => {
  assert.equal(placeFromTimezone("America/Vancouver"), "Vancouver");
  assert.equal(placeFromTimezone("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(placeFromTimezone("Asia/Calcutta"), "Kolkata");
  assert.equal(placeFromTimezone("Etc/UTC"), null);
  assert.equal(placeFromTimezone("UTC"), null);
  assert.equal(placeFromTimezone("../../etc"), null);
  assert.equal(placeFromTimezone(null), null);
  assert.equal(soulPhrase("Vancouver"), "A soul in Vancouver");
  assert.equal(soulPhrase(null), "A soul somewhere in Christendom");
});
