import { after, test } from "node:test";
import assert from "node:assert/strict";
import { useTempData } from "./helpers";
import { consumeSin, createSin, judgeSin, markPaid } from "../src/lib/sins";
import { judgeMock } from "../src/lib/inquisitor";
import { census, hide, inscribe, lineFor, preview, publishDue, recent, subscribe, type Inscription } from "../src/lib/wall";
import { HttpError } from "../src/lib/http";

const data = useTempData("wall");
after(data.cleanup);
process.env.ABSOLVO_WALL_DELAY_SECONDS = "0";

const owner = "c".repeat(64);
async function absolved(text: string, tz = "America/Vancouver") {
  const { id, key } = createSin({ owner, kind: "text", mediaType: "text/plain", plaintext: Buffer.from(text), tz });
  await judgeSin(id, owner, key, judgeMock);
  markPaid(id, { mode: "dispensation" });
  consumeSin(id, owner);
  return id;
}

test("a line reads exactly like the penitent's example", () => {
  assert.equal(lineFor({ place: "Vancouver", severity: 4, cardinal: "gula", label: "Midnight Taco Bell" }), "A soul in Vancouver was absolved of Class IV Gluttony: Midnight Taco Bell");
  assert.equal(lineFor({ place: null, severity: 2, cardinal: "ira", label: null }), "A soul somewhere in Christendom was absolved of Class II Wrath.");
});

test("nothing is carved without a choice, class-only carries no label, and keeping it secret deletes it", async () => {
  const id = await absolved("a $55 burrito on DoorDash");
  assert.equal(preview(id, owner)!.chosen, null);
  publishDue();
  assert.equal(recent().length, 0);
  inscribe(id, owner, "class");
  assert.equal(preview(id, owner)!.chosen, "class");
  publishDue();
  assert.equal(recent()[0].label, null);
  assert.match(recent()[0].line, /^A soul in Vancouver was absolved of Class [IVX]+ Gluttony\.$/);
  inscribe(id, owner, "secret");
  assert.equal(preview(id, owner)!.chosen, null);
  assert.equal(recent().length, 0);
  assert.throws(() => inscribe(id, "d".repeat(64), "carve"), (error: unknown) => error instanceof HttpError && error.status === 404);
});

test("publication waits for its delay, then streams to subscribers who can leave cleanly", async () => {
  const id = await absolved("nine hours of tiktok", "Asia/Seoul");
  process.env.ABSOLVO_WALL_DELAY_SECONDS = "60";
  inscribe(id, owner, "carve");
  const heard: Inscription[] = [];
  const leave = subscribe(entry => heard.push(entry))!;
  assert.equal(publishDue(), 0, "not before its time");
  assert.equal(publishDue(Date.now() + 61_000), 1);
  assert.equal(heard.length, 1);
  assert.equal(heard[0].line, "A soul in Seoul was absolved of Class V Sloth: Nine Hours of Scrolling");
  leave();
  leave();
  assert.equal(publishDue(Date.now() + 120_000), 0);
  process.env.ABSOLVO_WALL_DELAY_SECONDS = "0";
});

test("one client cannot hold more than four streams", () => {
  const held = Array.from({ length: 4 }, () => subscribe(() => {}, "203.0.113.9"));
  assert.ok(held.every(Boolean));
  assert.equal(subscribe(() => {}, "203.0.113.9"), null);
  held.forEach(leave => leave!());
  const again = subscribe(() => {}, "203.0.113.9");
  assert.ok(again);
  again!();
});

test("moderation cannot be undone by carving again", async () => {
  const id = await absolved("per my last email, reply all");
  inscribe(id, owner, "carve");
  publishDue();
  const stone = recent()[0];
  assert.equal(hide(stone.id), true);
  assert.equal(recent().some(entry => entry.id === stone.id), false);
  assert.equal(preview(id, owner)!.chosen, "struck");
  assert.throws(() => inscribe(id, owner, "carve"), /struck this stone/);
  assert.throws(() => inscribe(id, owner, "secret"), /struck this stone/);
  assert.equal(recent().some(entry => entry.id === stone.id), false);
});

test("the census counts every consumed sin, carved or not", () => {
  const counts = census();
  assert.equal(counts.souls, 3);
  assert.ok(counts.counts.gula >= 1 && counts.counts.acedia >= 1 && counts.counts.ira >= 1);
  assert.equal(counts.today, Object.values(counts.counts).reduce((sum, value) => sum + value, 0));
});
