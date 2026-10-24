import type { SKRSContext2D } from "@napi-rs/canvas";
import { FONT } from "./fonts";

const bytesOf = (seal: string) => Array.from({ length: 32 }, (_, index) => parseInt(seal.slice(index * 2, index * 2 + 2), 16) || 0);

/**
 * A wax seal unique to the sin: a dripping disc with a legend around the rim and a star whose
 * spokes are read from the keyed seal. Drawn black-on-white so callers can use it as a spot-colour mask.
 */
export function drawSigil(context: SKRSContext2D, cx: number, cy: number, radius: number, seal: string) {
  const bytes = bytesOf(seal);
  context.save();
  context.fillStyle = "#000";
  context.beginPath();
  for (let step = 0; step <= 180; step++) {
    const angle = (step / 180) * Math.PI * 2;
    const wobble = 1 + 0.035 * Math.sin(angle * 7 + bytes[0] / 40) + 0.025 * Math.sin(angle * 13 + bytes[1] / 30) + 0.015 * Math.sin(angle * 29 + bytes[2] / 20);
    const x = cx + Math.cos(angle) * radius * wobble, y = cy + Math.sin(angle) * radius * wobble;
    if (step === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  for (let drip = 0; drip < 3; drip++) {
    const angle = Math.PI * (0.3 + drip * 0.2) + (bytes[3 + drip] / 255 - 0.5) * 0.3;
    const length = radius * (0.12 + (bytes[6 + drip] / 255) * 0.18);
    const x = cx + Math.cos(angle) * radius * 0.96, y = cy + Math.sin(angle) * radius * 0.96;
    context.beginPath();
    context.ellipse(x, y + length / 2, radius * 0.06, length / 2 + radius * 0.04, 0, 0, Math.PI * 2);
    context.fill();
  }

  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = radius * 0.022;
  context.beginPath(); context.arc(cx, cy, radius * 0.8, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.arc(cx, cy, radius * 0.62, 0, Math.PI * 2); context.stroke();

  const legend = "SIGILLVM ✠ ABSOLVONIS ✠ PECCATA CONSVMPTA ✠ ";
  context.font = `${Math.round(radius * 0.12)}px ${FONT.caps}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const letters = [...legend];
  letters.forEach((letter, index) => {
    const angle = -Math.PI / 2 + (index / letters.length) * Math.PI * 2;
    context.save();
    context.translate(cx + Math.cos(angle) * radius * 0.71, cy + Math.sin(angle) * radius * 0.71);
    context.rotate(angle + Math.PI / 2);
    context.fillText(letter, 0, 0);
    context.restore();
  });

  const spokes = 8 + (bytes[9] % 5);
  context.lineWidth = radius * 0.035;
  context.lineCap = "round";
  for (let spoke = 0; spoke < spokes; spoke++) {
    const angle = (spoke / spokes) * Math.PI * 2 + bytes[10] / 80;
    const reach = radius * (0.3 + (bytes[11 + (spoke % 16)] / 255) * 0.26);
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * radius * 0.14, cy + Math.sin(angle) * radius * 0.14);
    context.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
    context.stroke();
    context.beginPath();
    context.arc(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, radius * 0.03, 0, Math.PI * 2);
    context.fill();
  }
  context.beginPath();
  context.ellipse(cx, cy, radius * 0.16, radius * 0.08, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#000";
  context.beginPath();
  context.ellipse(cx, cy, radius * 0.025, radius * 0.07, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
