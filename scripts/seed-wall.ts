import { randomBytes } from "node:crypto";
import { db, utcDay } from "../src/lib/db";
import { appUrl, isLocalOrigin } from "../src/lib/env";
import { ORDERS, type Cardinal } from "../src/lib/taxonomy";

/**
 * Development only: fills a local Graveyard with sample souls so the wall can be designed.
 * Production is never seeded with invented confessions.
 */
if (!isLocalOrigin()) {
  console.error(`Refusing to seed: APP_URL (${appUrl()}) is not a local origin.`);
  process.exit(1);
}
const count = Math.min(200, Number(process.argv[2] || 40));
const places = ["Vancouver", "Lagos", "London", "Seoul", "São Paulo", "Toronto", "Berlin", "Mumbai", "Melbourne", "Mexico City", "Los Angeles", null];
const labels: Record<string, string[]> = {
  gula_deliverandi: ["The $41 Pad Thai", "Midnight Burrito Delivery"], gula_nocturna: ["Midnight Taco Bell", "3 AM Cereal"], gula_liquida: ["The Sixth Oat Latte"],
  acedia_scrollandi: ["Nine Hours of Scrolling"], acedia_responsionis: ["4,812 Unread Emails"], luxuria_nocturna_textualis: ["The 2 AM Text"], luxuria_exis: ["Liking a 2019 Photo"],
  avaritia_subscriptionum: ["Four Streaming Services"], vanagloria_linkedinensis: ["Thrilled to Announce"], ira_epistolaris: ["Per My Last Email"], invidia_instagrammatica: ["The Deep Scroll"]
};
const now = Date.now();
const insert = db().prepare(`INSERT INTO inscriptions (sin_mac, cardinal, sin_order, severity, label, place, created_at, publish_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const tally = db().prepare("INSERT INTO absolutions (day, sin_order, cardinal, count) VALUES (?, ?, ?, 1) ON CONFLICT(day, sin_order) DO UPDATE SET count = count + 1");
for (let index = 0; index < count; index++) {
  const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
  const cardinal = (order.cardinal ?? "gula") as Cardinal;
  const at = now - Math.floor(Math.random() * 3 * 86_400_000);
  const options = labels[order.id] ?? [order.epithet];
  insert.run(`seed-${randomBytes(12).toString("hex")}`, cardinal, order.id, 1 + Math.floor(Math.random() * 7), Math.random() < 0.8 ? options[index % options.length] : null, places[index % places.length], at, at, at);
  tally.run(utcDay(at), order.id, cardinal);
}
console.log(`Seeded ${count} souls into the local Graveyard.`);
