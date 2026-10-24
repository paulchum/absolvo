import { test } from "node:test";
import assert from "node:assert/strict";
import { NOISE_GLSL, aspectScale, burnField, fbm, hash, seedOffset, valueNoise } from "../src/lib/client/noise";

test("fbm is deterministic, seeded and bounded to [0, 1]", () => {
  let min = 1, max = 0;
  for (let i = 0; i < 4000; i++) {
    const x = (i % 97) * 0.173, y = Math.floor(i / 97) * 0.291;
    const value = fbm(x, y, 42);
    assert.equal(value, fbm(x, y, 42));
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  assert.ok(min >= 0 && max <= 1, `fbm stayed within [${min}, ${max}]`);
  assert.ok(max - min > 0.4, "fbm actually varies");
  let differing = 0;
  for (let i = 0; i < 50; i++) if (fbm(i * 0.37, i * 0.11, 1) !== fbm(i * 0.37, i * 0.11, 2)) differing++;
  assert.ok(differing > 40, "different seeds give different noise");
});

test("the hash and value noise stay in [0, 1) on and off the lattice", () => {
  for (let i = -50; i < 50; i++) {
    const h = hash(i, i * 3 + 7);
    assert.ok(h >= 0 && h < 1);
    const n = valueNoise(i * 0.31 + 0.5, i * 0.17 - 0.25);
    assert.ok(n >= 0 && n <= 1);
  }
  assert.equal(valueNoise(3, 4), hash(3, 4), "value noise equals the hash at lattice points");
});

test("the burn field grows with distance from the bite", () => {
  const bite = { x: 0.2, y: 0.8 };
  let near = 0, far = 0, nearCount = 0, farCount = 0;
  for (let i = 0; i < 3000; i++) {
    const u = (0.5 + i * 0.7548776662) % 1, v = (0.5 + i * 0.569840291) % 1;
    const distance = Math.hypot(u - bite.x, v - bite.y);
    const field = burnField(u, v, bite, 7);
    if (distance < 0.15) { near += field; nearCount++; }
    if (distance > 0.6) { far += field; farCount++; }
    assert.ok(field >= distance - 1e-9 && field <= distance + 0.35 + 1e-9);
  }
  assert.ok(nearCount > 10 && farCount > 10);
  assert.ok(far / farCount > near / nearCount + 0.3);
});

test("aspect correction measures the longest side as 1", () => {
  assert.deepEqual(aspectScale(2), [1, 0.5]);
  assert.deepEqual(aspectScale(0.5), [0.5, 1]);
  const tall = burnField(0.5, 1, { x: 0.5, y: 0 }, 3, 0.5);
  const wide = burnField(1, 0.5, { x: 0, y: 0.5 }, 3, 0.5);
  assert.ok(tall >= 1 && wide < tall, "the long axis of a tall image spans more of the field");
});

test("the GLSL carries the same noise as the JS twin", () => {
  assert.match(NOISE_GLSL, /float fbm\(vec2 p\)/);
  assert.match(NOISE_GLSL, /0\.1031/);
  assert.match(NOISE_GLSL, /33\.33/);
  assert.equal(seedOffset(1003)[0], seedOffset(3)[0]);
});
