import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { useTempData } from "./helpers";
import { adminAuthorized } from "../src/lib/api";
import { judge } from "../src/lib/inquisitor";
import { formatFunnel, funnel } from "../src/lib/metrics";
import { reserveSpend } from "../src/lib/rate-limit";
import { consumeSin, createSin, judgeSin, markPaid, recordCheckout, summonSin } from "../src/lib/sins";

const data = useTempData("metrics");
after(data.cleanup);
delete process.env.DEEPSEEK_API_KEY;

const owner = "c".repeat(64);
const later = Date.now() + 1_800_000;
async function confess(text: string, now = Date.now()) {
  const created = createSin({ owner, kind: "text", mediaType: "text/plain", plaintext: Buffer.from(text) }, now);
  await judgeSin(created.id, owner, created.key, judge, now);
  return created.id;
}
const checkout = (id: string, session: string) => recordCheckout(id, { id: session, url: `https://checkout.stripe.com/${session}`, expiresAt: later });

test("the funnel counts each step once per sin, by tier, and prices only real payments", async () => {
  await confess("I ordered a $55 burrito");
  const browsed = await confess("texted my ex at 2am");
  checkout(browsed, "cs_test_a");
  checkout(browsed, "cs_test_b");
  const bought = await confess("nine hours of tiktok");
  checkout(bought, "cs_test_c");
  markPaid(bought, { mode: "paid", session: "cs_test_c", paymentIntent: "pi_test_c" });
  consumeSin(bought, owner);
  markPaid(await confess("per my last email"), { mode: "dispensation" });
  await confess("[[refuse]] left sealed");
  const summoned = await confess("[[refuse]] summoned and bought");
  summonSin(summoned, owner);
  checkout(summoned, "cs_test_d");
  markPaid(summoned, { mode: "paid", session: "cs_test_d", paymentIntent: "pi_test_d" });
  await confess("[[malphas-refuses]]");
  await confess("[[damned]]");
  createSin({ owner, kind: "text", mediaType: "text/plain", plaintext: Buffer.from("never judged") });
  await confess("an old burrito", Date.now() - 10 * 86_400_000);
  reserveSpend(123_456);

  const report = funnel(7);
  assert.equal(report.confessions, 9, "the ten-day-old confession falls outside the week");
  assert.deepEqual(report.parish, { roasted: 4, checkout: 2, paid: 1, dispensed: 1, eaten: 1, revenueCents: 199 });
  assert.deepEqual([report.recoiled, report.rejected, report.damned], [4, 1, 1]);
  assert.deepEqual(report.abyss, { roasted: 2, summoned: 1, checkout: 1, paid: 1, dispensed: 0, eaten: 0, revenueCents: 499 });
  assert.equal(report.aiSpendCents, 12);
  assert.equal(report.daily.length, 1);
  assert.deepEqual({ ...report.daily[0], day: "" }, { day: "", confessions: 9, roasted: 6, recoiled: 4, checkout: 3, paid: 2 });
  assert.equal(funnel(30).confessions, 10);

  const text = formatFunnel(report);
  assert.match(text, /Opened checkout\s+2\s+50\.0% of roasted/);
  assert.match(text, /Revenue at today's prices\s+\$6\.98/);
  assert.match(text, /Dispensations \(free, dev\)\s+1/);
});

test("the admin report needs the full admin token", () => {
  const ask = (authorization?: string) => adminAuthorized(new NextRequest("http://localhost:3020/api/admin/funnel", { headers: authorization ? { authorization } : {} }));
  process.env.ABSOLVO_ADMIN_TOKEN = "short";
  assert.equal(ask("Bearer short"), false, "a token under 16 characters opens nothing");
  process.env.ABSOLVO_ADMIN_TOKEN = "a-sufficiently-long-token";
  assert.equal(ask("Bearer a-sufficiently-long-token"), true);
  assert.equal(ask("Bearer a-sufficiently-long-tokem"), false);
  assert.equal(ask(), false);
  delete process.env.ABSOLVO_ADMIN_TOKEN;
});
