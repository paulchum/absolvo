import fs from "node:fs";
import path from "node:path";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

/** Synthetic phone screenshots for tests and demos. Every name and number here is invented. */
const out = path.resolve(process.argv[2] || "tests/fixtures");
fs.mkdirSync(out, { recursive: true });
const W = 1179, H = 2556;

function statusBar(context: SKRSContext2D, time: string, battery: number, dark = false) {
  context.fillStyle = dark ? "#fff" : "#000";
  context.font = "600 50px sans-serif";
  context.fillText(time, 120, 120);
  context.strokeStyle = dark ? "#fff" : "#000";
  context.lineWidth = 4;
  context.strokeRect(W - 200, 82, 92, 46);
  context.fillStyle = battery < 20 ? "#e5332a" : dark ? "#fff" : "#000";
  context.fillRect(W - 194, 88, Math.max(4, (80 * battery) / 100), 34);
  context.fillStyle = dark ? "#fff" : "#000";
  context.font = "600 40px sans-serif";
  context.fillText(`${battery}%`, W - 330, 122);
}

async function receipt() {
  const canvas = createCanvas(W, H), context = canvas.getContext("2d");
  context.fillStyle = "#fff"; context.fillRect(0, 0, W, H);
  statusBar(context, "2:13", 4);
  context.fillStyle = "#111"; context.font = "700 72px sans-serif"; context.fillText("Order receipt", 80, 300);
  context.fillStyle = "#666"; context.font = "44px sans-serif"; context.fillText("DashEats · Placed at 2:13 AM", 80, 380);
  const rows: [string, string][] = [["1 × Carne Asada Burrito", "$12.49"], ["Delivery fee", "$6.99"], ["Service fee", "$5.41"], ["Small order fee", "$3.00"], ["Late night fee", "$2.50"], ["Tax", "$2.73"], ["Dasher tip", "$22.00"]];
  context.font = "48px sans-serif";
  rows.forEach(([label, amount], index) => {
    const y = 560 + index * 110;
    context.fillStyle = "#222"; context.fillText(label, 80, y);
    context.textAlign = "right"; context.fillText(amount, W - 80, y); context.textAlign = "left";
    context.fillStyle = "#eee"; context.fillRect(80, y + 36, W - 160, 3);
  });
  context.fillStyle = "#111"; context.font = "700 64px sans-serif";
  context.fillText("Total", 80, 1420); context.textAlign = "right"; context.fillText("$55.12", W - 80, 1420); context.textAlign = "left";
  context.fillStyle = "#e5332a"; context.font = "600 44px sans-serif"; context.fillText("Arriving 2:58 AM", 80, 1560);
  return canvas.encode("png");
}

async function thread() {
  const canvas = createCanvas(W, H), context = canvas.getContext("2d");
  context.fillStyle = "#000"; context.fillRect(0, 0, W, H);
  statusBar(context, "2:47", 11, true);
  context.fillStyle = "#fff"; context.font = "600 56px sans-serif"; context.textAlign = "center"; context.fillText("Old Flame", W / 2, 300); context.textAlign = "left";
  const bubble = (text: string, y: number, mine: boolean) => {
    context.font = "52px sans-serif";
    const width = context.measureText(text).width + 80;
    const x = mine ? W - 60 - width : 60;
    context.fillStyle = mine ? "#0a84ff" : "#262626";
    context.beginPath(); context.roundRect(x, y, width, 110, 50); context.fill();
    context.fillStyle = "#fff"; context.fillText(text, x + 40, y + 72);
  };
  context.fillStyle = "#8e8e93"; context.font = "40px sans-serif"; context.textAlign = "center"; context.fillText("Today 2:47 AM", W / 2, 460); context.textAlign = "left";
  bubble("u up?", 520, true);
  context.fillStyle = "#8e8e93"; context.font = "36px sans-serif"; context.textAlign = "right"; context.fillText("Read 2:48 AM", W - 70, 680); context.textAlign = "left";
  bubble("hello?", 780, true); bubble("i was just thinking about us", 920, true); bubble("ok goodnight i guess", 1060, true);
  return canvas.encode("png");
}

async function screenTime() {
  const canvas = createCanvas(W, H), context = canvas.getContext("2d");
  context.fillStyle = "#f2f2f7"; context.fillRect(0, 0, W, H);
  statusBar(context, "11:52", 23);
  context.fillStyle = "#000"; context.font = "700 80px sans-serif"; context.fillText("Screen Time", 80, 320);
  context.fillStyle = "#8e8e93"; context.font = "44px sans-serif"; context.fillText("Daily Average", 80, 440);
  context.fillStyle = "#000"; context.font = "700 120px sans-serif"; context.fillText("9h 41m", 80, 580);
  context.fillStyle = "#e5332a"; context.font = "44px sans-serif"; context.fillText("▲ 38% from last week", 80, 660);
  const apps: [string, string, number][] = [["ShortVids", "5h 12m", 0.54], ["PhotoGram", "1h 58m", 0.2], ["Messages", "1h 03m", 0.11], ["Pickups", "214", 0]];
  apps.forEach(([name, value, share], index) => {
    const y = 860 + index * 150;
    context.fillStyle = "#000"; context.font = "52px sans-serif"; context.fillText(name, 80, y);
    context.textAlign = "right"; context.fillText(value, W - 80, y); context.textAlign = "left";
    if (share) { context.fillStyle = "#0a84ff"; context.fillRect(80, y + 30, (W - 160) * share, 18); }
  });
  return canvas.encode("png");
}

for (const [name, render] of [["receipt.png", receipt], ["text-thread.png", thread], ["screen-time.png", screenTime]] as const) {
  fs.writeFileSync(path.join(out, name), await render());
}
console.log(out);
