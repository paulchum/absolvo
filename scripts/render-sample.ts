import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { renderCard } from "../src/lib/art/card";
import { drawGargoyle } from "../src/lib/art/draw-gargoyle";
import { latinDate, remission, className, CLASSES } from "../src/lib/taxonomy";

const out = path.resolve(process.argv[2] || ".data/samples");
fs.mkdirSync(out, { recursive: true });
const seal = "7f3a9c1e5b2d8f40a1c3e5f7092b4d6e8fa1c3e5b7d9f1a3c5e7092b4d6e8fa1";
const card = await renderCard({
  serial: "ABS-MMXXVI-7F3K-Q9ZD-2M8P-XR4T", title: "The Fifty-Five Dollar Burrito", epitaph: "Here lies one burrito, and the dignity that paid for it.",
  latinOrder: "Gula Deliverandi", cardinalLatin: "Gula", cardinalEnglish: "Gluttony", className: className(5), classTitle: CLASSES[4],
  remission: remission(5, seal).text, latinDate: latinDate(Date.now()), seal, verifyUrl: "http://localhost:3020/v/ABS-MMXXVI-7F3K-Q9ZD-2M8P-XR4T",
  dispensation: process.argv.includes("--dispensation")
});
fs.writeFileSync(path.join(out, "card.png"), card);
for (const open of [0, 0.6, 1]) {
  const canvas = createCanvas(800, 920);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff"; context.fillRect(0, 0, 800, 920);
  context.scale(2, 2);
  drawGargoyle(context, { open, glare: false, scroll: open > 0.5, ledge: true });
  fs.writeFileSync(path.join(out, `gargoyle-${open}.png`), await canvas.encode("png"));
}
console.log(out);
