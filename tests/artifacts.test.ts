import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { useTempData } from "./helpers";
import { atkinson, bayer, floydSteinberg } from "../src/lib/art/dither";
import { CARD, PALETTES, renderCard } from "../src/lib/art/card";
import { buildPass, passJson } from "../src/lib/wallet/apple";
import { developmentCaPath } from "../src/lib/wallet/dev-certs";
import { genericObject, objectId, saveUrl, signJwt } from "../src/lib/wallet/google";
import { buildPayload } from "../src/lib/certificates";
import { MOCK_JUDGMENTS } from "../src/lib/mock-judgments";
import { finalizeJudgment } from "../src/lib/judgment";
import { generateKeyPairSync, verify } from "node:crypto";
import { headerSize, sniffImage } from "../src/lib/api";

const data = useTempData("artifacts");
after(data.cleanup);
process.env.APP_URL = "http://localhost:3020";

const verdict = finalizeJudgment(MOCK_JUDGMENTS[0], "mock");
const seal = "7f3a9c1e5b2d8f40a1c3e5f7092b4d6e8fa1c3e5b7d9f1a3c5e7092b4d6e8fa1";
const payload = buildPayload({ serial: "ABS-MMXXVI-7F3K-Q9ZD-2M8P-XR4T", verdict, tier: "parish", seal, payment: "paid", purgedAt: Date.UTC(2026, 9, 23), issuedAt: Date.UTC(2026, 9, 23) });

test("image dimensions are read from the header before anything is decoded", async () => {
  const canvas = createCanvas(37, 53);
  canvas.getContext("2d").fillRect(0, 0, 10, 10);
  for (const format of ["png", "jpeg", "webp", "gif"] as const) {
    const bytes = format === "png" ? await canvas.encode("png") : format === "gif" ? await canvas.encode("gif") : await canvas.encode(format, 90);
    const type = sniffImage(bytes);
    assert.ok(type, format);
    assert.deepEqual(headerSize(bytes, type!), { width: 37, height: 53 }, format);
  }
  assert.equal(headerSize(Buffer.from("not an image at all"), "image/jpeg"), null);
});

test("dithering produces pure ink and keeps the overall tone", () => {
  const width = 64, height = 64;
  const gray = new Float32Array(width * height).map((_, index) => ((index % width) / (width - 1)) * 255);
  for (const ink of [atkinson(gray, width, height), floydSteinberg(gray, width, height), bayer(gray, width, height)]) {
    assert.ok(ink.every(value => value === 0 || value === 1));
    const coverage = ink.reduce((sum, value) => sum + value, 0) / ink.length;
    assert.ok(coverage > 0.35 && coverage < 0.65, `coverage ${coverage}`);
  }
});

test("the woodcut card is 1500×2100 and printed in exactly three colours, parchment for the parish and soot for the Abyss", async () => {
  for (const tier of ["parish", "abyssal"] as const) {
    const png = await renderCard({
      serial: payload.serial, title: verdict.title, epitaph: verdict.epitaph, latinOrder: payload.sin.latin, cardinalLatin: "Gula", cardinalEnglish: "Gluttony",
      className: payload.sin.className, classTitle: "Wanton Excess", remission: payload.remission, latinDate: "die XXIII mensis Octobris, anno Domini MMXXVI",
      seal, verifyUrl: "http://localhost:3020/v/x", dispensation: true, tier
    });
    const image = await loadImage(png);
    assert.equal(image.width, CARD.width);
    assert.equal(image.height, CARD.height);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const allowed = new Set(Object.values(PALETTES[tier]).map(colour => colour.join(",")));
    const seen = new Map<string, number>();
    for (let index = 0; index < pixels.length; index += 4) {
      const colour = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`;
      seen.set(colour, (seen.get(colour) ?? 0) + 1);
    }
    assert.deepEqual([...seen.keys()].filter(colour => !allowed.has(colour)), [], tier);
    assert.equal(seen.size, 3, tier);
    const ground = PALETTES[tier].ground.join(",");
    assert.equal([...seen.entries()].sort((a, b) => b[1] - a[1])[0][0], ground, `${tier} is mostly ${ground}`);
  }
});

test("the Black Seal pass prints bone on soot with Malphas's sermon on the back", () => {
  const abyssal = { ...payload, tier: "abyssal" as const };
  const pass = passJson(abyssal, verdict, null);
  assert.equal(pass.backgroundColor, "rgb(15, 13, 11)");
  assert.equal(pass.foregroundColor, "rgb(236, 224, 196)");
  assert.equal(pass.labelColor, "rgb(163, 36, 26)");
  assert.equal(pass.description, "Black Seal of Absolution");
  assert.ok(pass.eventTicket.backFields.some(field => field && field.label === "THE SERMON OF MALPHAS"));
  const object = genericObject(abyssal, "3388000000012345678");
  assert.equal(object.hexBackgroundColor, "#0f0d0b");
  assert.ok(object.heroImage.sourceUri.uri.endsWith("/wallet/google-hero-abyssal.png"));
});

test("the pass is a signed, complete .pkpass whose manifest matches every file", async () => {
  const { buffer, development } = await buildPass(payload, verdict, { purgedAt: payload.purgedAt, steps: [{ label: "Ciphertext unlinked from the vault", ms: 0.4 }], method: "test", auto: false });
  assert.equal(development, true);
  const files = unzipSync(new Uint8Array(buffer));
  for (const name of ["pass.json", "manifest.json", "signature", "icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "strip.png", "strip@2x.png", "strip@3x.png"]) assert.ok(files[name], `missing ${name}`);
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as Record<string, string>;
  for (const [name, digest] of Object.entries(manifest)) assert.equal(createHash("sha1").update(files[name]).digest("hex"), digest, name);
  assert.equal(Object.keys(manifest).length, Object.keys(files).length - 2);
  const pass = JSON.parse(strFromU8(files["pass.json"]));
  assert.equal(pass.serialNumber, payload.serial);
  assert.equal(pass.eventTicket.primaryFields[0].value, "The Fifty-Five Dollar Burrito");
  assert.equal(pass.barcodes[0].message, `http://localhost:3020/v/${payload.serial}`);
  assert.ok(pass.eventTicket.backFields.some((field: { key: string; value: string }) => field.key === "roast" && field.value.includes("$55.12")));
  assert.ok(!JSON.stringify(pass).includes("attributedValue"));
  const strip = await loadImage(Buffer.from(files["strip@3x.png"]));
  assert.deepEqual([strip.width, strip.height], [1125, 294]);
  const work = path.join(data.dir, "pkpass");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, "manifest.json"), files["manifest.json"]);
  fs.writeFileSync(path.join(work, "signature"), files["signature"]);
  const verified = execFileSync("openssl", ["smime", "-verify", "-inform", "DER", "-binary", "-in", path.join(work, "signature"), "-content", path.join(work, "manifest.json"), "-CAfile", developmentCaPath(), "-purpose", "any", "-out", "/dev/null"], { stdio: ["ignore", "pipe", "pipe"] });
  assert.ok(verified !== undefined);
  fs.writeFileSync(path.join(work, "manifest.json"), Buffer.concat([Buffer.from(files["manifest.json"]), Buffer.from(" ")]));
  assert.throws(() => execFileSync("openssl", ["smime", "-verify", "-inform", "DER", "-binary", "-in", path.join(work, "signature"), "-content", path.join(work, "manifest.json"), "-CAfile", developmentCaPath(), "-purpose", "any", "-out", "/dev/null"], { stdio: "ignore" }));
});

test("Google Wallet save links are short RS256 JWTs that reference a pre-created object", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const service = { client_email: "wallet@absolvo.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  const url = saveUrl(payload.serial, "3388000000012345678", service);
  assert.ok(url.startsWith("https://pay.google.com/gp/v/save/"));
  assert.ok(url.length < 1800, `save link is ${url.length} characters`);
  const [header, claims, signature] = url.split("/").at(-1)!.split(".");
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url")), true);
  const body = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(body.typ, "savetowallet");
  assert.deepEqual(body.payload.genericObjects[0], { id: objectId("3388000000012345678", payload.serial), classId: "3388000000012345678.absolvo_certificate_v1" });
  const object = genericObject(payload, "3388000000012345678");
  assert.equal(object.barcode.value, `http://localhost:3020/v/${payload.serial}`);
  assert.equal(object.hexBackgroundColor, "#ece0c4");
  assert.ok(signJwt({ a: 1 }, service.private_key).split(".").length === 3);
});
