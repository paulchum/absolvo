import { createCanvas } from "@napi-rs/canvas";
import type { Tier } from "../env";
import { PALETTES, Press } from "./card";
import { drawEyeGlow, drawGargoyle } from "./draw-gargoyle";
import { gargoyle } from "./gargoyle-paths";
import { FONT, registerFonts } from "./fonts";

const rgb = (colour: readonly number[]) => `rgb(${colour.join(",")})`;
const SCALES = [1, 2, 3] as const;
const suffix = (scale: number) => (scale === 1 ? "" : `@${scale}x`);

/** The wax-seal eye: legible at 29 pt where a dithered gargoyle would be mush. */
async function icon(size: number, tier: Tier = "parish") {
  const palette = PALETTES[tier];
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = rgb(palette.ground);
  context.fillRect(0, 0, size, size);
  context.fillStyle = rgb(palette.rubric);
  context.beginPath(); context.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2); context.fill();
  context.fillStyle = rgb(palette.ground);
  context.beginPath(); context.ellipse(size / 2, size / 2, size * 0.3, size * 0.15, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = rgb(tier === "abyssal" ? palette.rubric : palette.ink);
  context.beginPath(); context.ellipse(size / 2, size / 2, size * 0.05, size * 0.14, 0, 0, Math.PI * 2); context.fill();
  return canvas.encode("png");
}

async function logo(scale: number, tier: Tier = "parish") {
  registerFonts();
  const width = 160 * scale, height = 50 * scale;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = rgb(PALETTES[tier].ink);
  context.font = `${34 * scale}px ${FONT.blackletter}`;
  context.textBaseline = "middle";
  context.fillText("Absolvo", 2 * scale, height / 2 + 2 * scale);
  return canvas.encode("png");
}

/** Event-ticket strip, 375×98 pt: flames along the foot, the gargoyle at the right where no text sits. */
async function strip(scale: number, tier: Tier = "parish") {
  const width = 375 * scale, height = 98 * scale;
  const press = new Press(width, height, tier);
  const size = height * 1.5;
  const place = (context: Parameters<Parameters<Press["engrave"]>[4]>[0]) => {
    context.translate(width - size * 0.72, -height * 0.18);
    context.scale(size / 400, size / 400);
  };
  press.engrave(0, 0, width, height, context => {
    for (let index = 0; index < 22; index++) {
      const x = (index / 21) * width, h = height * (0.22 + 0.18 * Math.abs(Math.sin(index * 1.7)));
      const gradient = context.createLinearGradient(0, height, 0, height - h);
      gradient.addColorStop(0, "rgb(120,120,120)");
      gradient.addColorStop(1, "rgb(235,235,235)");
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(x - 10 * scale, height);
      context.quadraticCurveTo(x - 12 * scale, height - h * 0.6, x + (index % 2 ? 6 : -6) * scale, height - h);
      context.quadraticCurveTo(x + 10 * scale, height - h * 0.5, x + 9 * scale, height);
      context.fill();
    }
    context.save();
    place(context);
    drawGargoyle(context, { open: 0.75, scroll: true, ink: 1.4, variant: tier });
    context.restore();
  });
  if (tier === "abyssal") press.engrave(0, 0, width, height, context => { place(context); drawEyeGlow(context, gargoyle(0.75)); }, "red");
  return press.png();
}

export async function passImages(tier: Tier = "parish") {
  const files: Record<string, Buffer> = {};
  for (const scale of SCALES) {
    files[`icon${suffix(scale)}.png`] = await icon(29 * scale, tier);
    files[`logo${suffix(scale)}.png`] = await logo(scale, tier);
    files[`strip${suffix(scale)}.png`] = await strip(scale, tier);
  }
  return files;
}

/** Fixed class artwork for Google Wallet, which forbids per-pass personal images: one per tier. */
export async function googleHero(tier: Tier = "parish") {
  const width = 1032, height = 336;
  const press = new Press(width, height, tier);
  const place = (context: Parameters<Parameters<Press["engrave"]>[4]>[0]) => {
    context.translate(width / 2 - 170, -40);
    context.scale(0.85, 0.85);
  };
  press.engrave(0, 0, width, height, context => {
    context.save();
    place(context);
    drawGargoyle(context, { open: 0.7, glare: true, scroll: true, variant: tier });
    context.restore();
  });
  if (tier === "abyssal") press.engrave(0, 0, width, height, context => { place(context); drawEyeGlow(context, gargoyle(0.7)); }, "red");
  return press.png();
}
