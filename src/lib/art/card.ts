import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { atkinson, threshold, toGray } from "./dither";
import type { Tier } from "../env";
import { BINDING } from "../sacrament";
import { drawEyeGlow, drawGargoyle } from "./draw-gargoyle";
import { gargoyle } from "./gargoyle-paths";
import { FONT, registerFonts } from "./fonts";
import { drawQr, qrMatrix } from "./qr";
import { drawSigil } from "./sigil";

export interface Palette { ink: readonly number[]; ground: readonly number[]; rubric: readonly number[] }
/** The parish prints black on parchment; the Black Seal prints bone on soot. Both keep the rubric red. */
export const PALETTES: Record<Tier, Palette> = {
  parish: { ink: [22, 17, 13], ground: [236, 224, 196], rubric: [163, 36, 26] },
  abyssal: { ink: [236, 224, 196], ground: [15, 13, 11], rubric: [163, 36, 26] }
};
export const CARD = { width: 1500, height: 2100 } as const;

export interface CardInput {
  serial: string;
  title: string;
  epitaph: string;
  latinOrder: string;
  cardinalLatin: string;
  cardinalEnglish: string;
  className: string;
  classTitle: string;
  remission: string;
  latinDate: string;
  seal: string;
  verifyUrl: string;
  dispensation: boolean;
  revoked?: boolean;
  tier?: Tier;
}

/** A two-layer print: every pixel ends up ink, ground or rubric red. On soot the engravings print light, not dark. */
export class Press {
  readonly ink; readonly red; readonly inkContext; readonly redContext;
  constructor(readonly width: number, readonly height: number, readonly tier: Tier = "parish") {
    this.ink = createCanvas(width, height);
    this.red = createCanvas(width, height);
    this.inkContext = this.ink.getContext("2d");
    this.redContext = this.red.getContext("2d");
    for (const context of [this.inkContext, this.redContext]) { context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.fillStyle = "#000"; context.strokeStyle = "#000"; }
  }
  /**
   * Draws greys into a scratch canvas, dithers them, and stamps the result onto a layer. Dark greys
   * become ink on parchment; on soot the ink is bone, so light greys become ink over a black scratch.
   */
  engrave(x: number, y: number, width: number, height: number, draw: (context: SKRSContext2D) => void, layer: "ink" | "red" = "ink") {
    const negative = layer === "ink" && this.tier === "abyssal";
    const scratch = createCanvas(width, height);
    const context = scratch.getContext("2d");
    context.fillStyle = negative ? "#000" : "#fff";
    context.fillRect(0, 0, width, height);
    draw(context);
    const gray = toGray(context.getImageData(0, 0, width, height).data);
    if (negative) for (let index = 0; index < gray.length; index++) gray[index] = 255 - gray[index];
    const dots = atkinson(gray, width, height);
    const target = (layer === "ink" ? this.inkContext : this.redContext);
    const pixels = target.getImageData(x, y, width, height);
    for (let index = 0; index < dots.length; index++) if (dots[index]) { pixels.data[index * 4] = 0; pixels.data[index * 4 + 1] = 0; pixels.data[index * 4 + 2] = 0; }
    target.putImageData(pixels, x, y);
  }
  async png() {
    const ink = threshold(toGray(this.inkContext.getImageData(0, 0, this.width, this.height).data), 140);
    const red = threshold(toGray(this.redContext.getImageData(0, 0, this.width, this.height).data), 140);
    const out = createCanvas(this.width, this.height);
    const context = out.getContext("2d");
    const image = context.createImageData(this.width, this.height);
    const palette = PALETTES[this.tier];
    for (let index = 0; index < ink.length; index++) {
      const colour = red[index] ? palette.rubric : ink[index] ? palette.ink : palette.ground;
      image.data[index * 4] = colour[0]; image.data[index * 4 + 1] = colour[1]; image.data[index * 4 + 2] = colour[2]; image.data[index * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return out.encode("png");
  }
}

function wrap(context: SKRSContext2D, text: string, widthFor: (line: number) => number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (context.measureText(attempt).width > widthFor(lines.length) && current) { lines.push(current); current = word; }
    else current = attempt;
  }
  if (current) lines.push(current);
  return lines;
}

/** Spreads words to the measure, as a compositor would, except on the last line. */
function justify(context: SKRSContext2D, line: string, x: number, y: number, width: number, last: boolean) {
  const words = line.split(" ");
  if (last || words.length < 2) { context.fillText(line, x, y); return; }
  const gap = (width - words.reduce((sum, word) => sum + context.measureText(word).width, 0)) / (words.length - 1);
  if (gap > context.measureText(" ").width * 3) { context.fillText(line, x, y); return; }
  let cursor = x;
  for (const word of words) { context.fillText(word, cursor, y); cursor += context.measureText(word).width + gap; }
}

function rosette(context: SKRSContext2D, x: number, y: number, r: number) {
  for (let petal = 0; petal < 4; petal++) {
    const angle = (petal / 4) * Math.PI * 2 + Math.PI / 4;
    context.beginPath();
    context.arc(x + Math.cos(angle) * r * 0.55, y + Math.sin(angle) * r * 0.55, r * 0.45, 0, Math.PI * 2);
    context.fill();
  }
  context.save();
  context.fillStyle = "#fff";
  context.beginPath(); context.arc(x, y, r * 0.22, 0, Math.PI * 2); context.fill();
  context.restore();
}

function frame(context: SKRSContext2D, width: number, height: number) {
  context.lineWidth = 7;
  context.strokeRect(38, 38, width - 76, height - 76);
  context.lineWidth = 2.5;
  context.strokeRect(70, 70, width - 140, height - 140);
  context.save();
  context.beginPath();
  context.rect(41, 41, width - 82, height - 82);
  context.rect(70, height - 70, width - 140, -(height - 140));
  context.clip("evenodd");
  context.lineWidth = 2;
  context.beginPath();
  for (let offset = -height; offset < width + height; offset += 11) { context.moveTo(offset, 0); context.lineTo(offset + height, height); }
  context.stroke();
  context.restore();
  for (const [x, y] of [[54, 54], [width - 54, 54], [54, height - 54], [width - 54, height - 54]]) rosette(context, x, y, 30);
}

function rule(context: SKRSContext2D, y: number, from: number, to: number) {
  const middle = (from + to) / 2;
  context.lineWidth = 2.5;
  context.beginPath(); context.moveTo(from, y); context.lineTo(middle - 22, y); context.moveTo(middle + 22, y); context.lineTo(to, y); context.stroke();
  context.beginPath(); context.moveTo(middle, y - 12); context.lineTo(middle + 14, y); context.lineTo(middle, y + 12); context.lineTo(middle - 14, y); context.closePath(); context.fill();
}

export async function renderCard(input: CardInput) {
  registerFonts();
  const { width, height } = CARD;
  const abyssal = input.tier === "abyssal";
  const press = new Press(width, height, input.tier);
  const ink = press.inkContext, red = press.redContext;
  frame(ink, width, height);
  ink.textAlign = "center";
  ink.textBaseline = "alphabetic";
  ink.font = `34px ${FONT.caps}`;
  ink.fillText(abyssal ? "POENITENTIARIA APOSTOLICA // ORDO ABYSSI" : "✠ The Holy Order of Absolvo ✠", width / 2, 160);
  ink.font = `112px ${FONT.blackletter}`;
  ink.fillText("Litteræ Indulgentiarum", width / 2, 270);
  ink.font = `46px ${FONT.italic}`;
  ink.fillText(abyssal ? "The Black Seal of Absolution" : "A Certificate of Absolution", width / 2, 334);
  rule(ink, 372, 260, width - 260);

  const place = (context: SKRSContext2D) => {
    const scale = 626 / 460;
    context.translate(600 - 200 * scale, 0);
    context.scale(scale, scale);
  };
  press.engrave(150, 390, 1200, 626, context => {
    place(context);
    drawGargoyle(context, { open: 0.72, glare: true, scroll: true, ledge: true, ink: 0.9, variant: input.tier });
  });
  if (abyssal) press.engrave(150, 390, 1200, 626, context => { place(context); drawEyeGlow(context, gargoyle(0.72)); }, "red");

  const left = 170, right = width - 170, measure = right - left;
  ink.textAlign = "left";
  ink.font = `39px ${FONT.body}`;
  const offering = input.dispensation ? "having been granted a dispensation in lieu of the customary offering" : `having rendered unto the ${abyssal ? "Arch-Prelate" : "Sin-Eater"} the customary offering`;
  const court = abyssal ? "Malphas, Arch-Prelate of the Abyss, the reserved sin" : "the Holy Inquisition the sin";
  const body = `e it known unto all the faithful that the bearer of these letters, having confessed before ${court} of ${input.latinOrder}, namely ${input.title}, and ${offering}, hath seen the evidence thereof devoured and burned and its key destroyed, and is by these presents`;
  const capWidth = 124;
  const lines = wrap(ink, body, line => (line < 3 ? measure - capWidth : measure)).slice(0, 8);
  const top = 1076, leading = 52;
  red.font = `202px ${FONT.heavy}`;
  red.textBaseline = "alphabetic";
  red.fillText("B", left - 6, top + leading * 2 + 4);
  lines.forEach((line, index) => justify(ink, line, index < 3 ? left + capWidth : left, top + index * leading, index < 3 ? measure - capWidth : measure, index === lines.length - 1));
  let y = top + (lines.length - 1) * leading + 92;
  red.textAlign = "center";
  red.font = `112px ${FONT.blackletter}`;
  red.fillText("Absolved", width / 2, y);
  y += 74;
  ink.textAlign = "center";
  ink.font = `44px ${FONT.caps}`;
  ink.fillText(input.remission, width / 2, y);
  ink.font = `36px ${FONT.italic}`;
  const epitaph = wrap(ink, `“${input.epitaph}”`, () => measure - 160).slice(0, 2);
  epitaph.forEach((line, index) => ink.fillText(line, width / 2, y + 54 + index * 44));
  y += 54 + (epitaph.length - 1) * 44 + 50;
  ink.font = `28px ${FONT.caps}`;
  ink.fillText(`${input.cardinalLatin} (${input.cardinalEnglish})  ·  ${input.className}, ${input.classTitle}`, width / 2, Math.min(y, 1704));

  drawSigil(red, 318, 1866, 132, input.seal);
  if (abyssal) {
    // Scanners want dark modules on light: a bone plate with soot modules.
    ink.fillRect(width - 444, 1738, 252, 252);
    ink.fillStyle = "#fff";
    drawQr(ink, qrMatrix(input.verifyUrl), width - 444, 1738, 252);
    ink.fillStyle = "#000";
  } else drawQr(ink, qrMatrix(input.verifyUrl), width - 444, 1738, 252);
  ink.font = `20px ${FONT.caps}`;
  ink.fillText("Verify thine absolution", width - 318, 2008);
  ink.font = `29px ${FONT.italic}`;
  ink.fillText("Datum ad Altare Absolvonis,", width / 2, 1752);
  ink.fillText(input.latinDate, width / 2, 1788);
  ink.font = `24px ${FONT.caps}`;
  ink.fillText(`No. ${input.serial}`, width / 2, 1828);
  ink.font = `20px ${FONT.caps}`;
  ink.fillText("The Seal of thy Sin, its likeness destroyed:", width / 2, 1866);
  ink.font = `21px ${FONT.body}`;
  for (let row = 0; row < 2; row++) ink.fillText(input.seal.slice(row * 32, row * 32 + 32).replace(/(.{4})/g, "$1 ").trim(), width / 2, 1894 + row * 26);
  ink.font = `19px ${FONT.italic}`;
  wrap(ink, BINDING, () => 560).slice(0, 3).forEach((line, index) => ink.fillText(line, width / 2, 1962 + index * 24));

  if (input.dispensation || input.revoked) {
    red.save();
    red.translate(width / 2, 902);
    red.rotate(-0.12);
    red.lineWidth = 10;
    red.strokeRect(-470, -78, 940, 156);
    red.lineWidth = 3;
    red.strokeRect(-450, -60, 900, 120);
    red.font = `76px ${FONT.caps}`;
    red.textAlign = "center";
    red.textBaseline = "middle";
    red.fillText(input.revoked ? "Revoked · Refunded" : "Dispensation · Unpaid", 0, 4);
    red.restore();
  }
  return press.png();
}
