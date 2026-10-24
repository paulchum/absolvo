import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import OpenAI from "openai";
import { useTempData } from "./helpers";
import { abyssalWorstCase, buildAbyssalRequest, judgeAbyssal, readAbyssal, transcribe, type AbyssalResponse } from "../src/lib/abyss";
import { judge, type Confession } from "../src/lib/inquisitor";
import { MALPHAS_JUDGMENTS } from "../src/lib/mock-judgments";
import { spentToday } from "../src/lib/rate-limit";
import { HttpError } from "../src/lib/http";

const data = useTempData("abyss");
after(data.cleanup);
delete process.env.DEEPSEEK_API_KEY;
delete process.env.ABSOLVO_ABYSSAL_VISION;

const text: Confession = { kind: "text", mediaType: "text/plain", slices: [], text: "I did a thing the parish will not hear", localTime: "3:03 AM", tz: "Europe/Paris" };
const image: Confession = { kind: "image", mediaType: "image/png", slices: [{ data: Buffer.from("fake-png"), width: 10, height: 10, mediaType: "image/png" }] };
const reply = (content: string | null, overrides: Partial<AbyssalResponse["choices"][number]> = {}): AbyssalResponse =>
  ({ model: "deepseek-chat", choices: [{ finish_reason: "stop", message: { content }, ...overrides }], usage: { prompt_tokens: 3000, completion_tokens: 600 } });
const good = JSON.stringify(MALPHAS_JUDGMENTS[0]);

test("every parish refusal, whatever its category, goes to Malphas", async () => {
  const outcome = await judge({ ...text, text: "[[refuse]] no category at all" }, "0000");
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.kind === "verdict" && outcome.tier, "abyssal");
});

test("a text-only Arch-Prelate is given a local transcription, never the image", () => {
  const request = buildAbyssalRequest(image, "TOTAL $55.12\n2:13 AM");
  assert.equal(typeof request.messages[1].content, "string");
  assert.ok((request.messages[1].content as string).includes("<transcription>\nTOTAL $55.12"));
  assert.equal(request.response_format.type, "json_object");
  assert.ok((request.messages[0].content as string).includes("JSON"));
  process.env.ABSOLVO_ABYSSAL_VISION = "true";
  const vision = buildAbyssalRequest(image, null);
  delete process.env.ABSOLVO_ABYSSAL_VISION;
  const parts = vision.messages[1].content as OpenAI.Chat.Completions.ChatCompletionContentPart[];
  assert.ok(parts[0].type === "image_url" && parts[0].image_url.url.startsWith("data:image/png;base64,"));
  assert.ok(abyssalWorstCase(vision) > abyssalWorstCase(request) - 4000 * 4, "images are budgeted");
});

test("Malphas's answers are mended when close, and anything that is not a judgment is a rejection", () => {
  const fenced = readAbyssal("```json\n" + JSON.stringify({ ...MALPHAS_JUDGMENTS[0], verdict: undefined, evidence: [{ kind: "smell", value: "brimstone", detail: "Everywhere." }], sin: { cardinal: "sloth", order: "made_up", severity: "7" } }) + "\n```");
  assert.ok(fenced && typeof fenced === "object");
  assert.equal(fenced.verdict, "judged");
  assert.equal(fenced.evidence[0].kind, "other");
  assert.equal(fenced.sin.order, "casus_reservatus");
  assert.equal(fenced.sin.severity, 7);
  assert.equal(readAbyssal("I'm sorry, but I can't help with that."), "rejected");
  assert.equal(readAbyssal('{"damned": true}'), "damned");
  assert.equal(readAbyssal('{"verdict": "jud'), null);
  assert.equal(readAbyssal(null), null);
});

test("a judgment from the Abyss is abyssal, and its measured cost is booked at the abyssal price", async () => {
  const before = spentToday();
  const outcome = await judgeAbyssal(text, async () => reply(good), async () => null);
  assert.equal(outcome.kind, "verdict");
  assert.equal(outcome.kind === "verdict" && outcome.tier, "abyssal");
  assert.equal(outcome.kind === "verdict" && outcome.verdict.servedBy, "deepseek-chat");
  assert.equal(spentToday() - before, 3000 * 1 + 600 * 4);
});

test("a hard 400, a moderation 403, a refusal or a content filter ends at the rejection scroll, free", async () => {
  const rejected = { kind: "refused", category: "abyss" };
  const before = spentToday();
  for (const status of [400, 403, 422]) {
    assert.deepEqual(await judgeAbyssal(text, async () => { throw OpenAI.APIError.generate(status, { message: "Content Exists Risk" }, "Content Exists Risk", new Headers()); }, async () => null), rejected);
  }
  assert.equal(spentToday(), before, "an unbilled call leaves no reservation behind");
  assert.deepEqual(await judgeAbyssal(text, async () => reply(null, { message: { content: null, refusal: "No." } }), async () => null), rejected);
  assert.deepEqual(await judgeAbyssal(text, async () => reply("{}", { finish_reason: "content_filter" }), async () => null), rejected);
  assert.deepEqual(await judgeAbyssal(text, async () => reply('{"damned": true}'), async () => null), { kind: "refused", category: "damned" });
  let calls = 0;
  assert.deepEqual(await judgeAbyssal(text, async () => { calls++; return reply('{"title": '); }, async () => null), rejected);
  assert.equal(calls, 2, "broken output is retried once before the Abyss gives up");
});

test("an overloaded or misconfigured Abyss is a retryable 503, not a rejection", async () => {
  for (const status of [429, 500, 401, 402]) {
    await assert.rejects(judgeAbyssal(text, async () => { throw OpenAI.APIError.generate(status, { message: "busy" }, "busy", new Headers()); }, async () => null), (error: unknown) => error instanceof HttpError && error.status === 503);
  }
});

test("the OCR bridge reads a real screenshot on this machine", { timeout: 60_000 }, async () => {
  const words = await transcribe([{ data: fs.readFileSync("tests/fixtures/receipt.png"), width: 0, height: 0, mediaType: "image/png" }]);
  assert.ok(words, "something legible was read");
  assert.match(words!, /55/);
});
