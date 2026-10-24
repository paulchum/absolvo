import { Path2D, type SKRSContext2D } from "@napi-rs/canvas";
import { features, gargoyle, VIEW, type GargoyleShape, type Variant } from "./gargoyle-paths";

/** Grey levels chosen for Atkinson dithering: the darker the fill, the denser the ink. */
const g = (level: number) => `rgb(${level},${level},${level})`;
type Paint = string | ReturnType<SKRSContext2D["createLinearGradient"]>;

function fill(context: SKRSContext2D, d: string, style: Paint) {
  context.fillStyle = style;
  context.fill(new Path2D(d));
}
function stroke(context: SKRSContext2D, d: string, width: number, level = 18) {
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = g(level);
  context.stroke(new Path2D(d));
}

/** Parallel engraving lines clipped to a shape. */
function hatch(context: SKRSContext2D, d: string, spacing: number, angle: number, width: number, level = 25) {
  context.save();
  context.clip(new Path2D(d));
  context.translate(VIEW.width / 2, VIEW.height / 2);
  context.rotate(angle);
  context.strokeStyle = g(level);
  context.lineWidth = width;
  context.beginPath();
  for (let offset = -VIEW.height; offset < VIEW.height; offset += spacing) { context.moveTo(-VIEW.width, offset); context.lineTo(VIEW.width, offset); }
  context.stroke();
  context.restore();
}

function radial(context: SKRSContext2D, x: number, y: number, r: number, stops: [number, number][]) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, level] of stops) gradient.addColorStop(at, g(level));
  return gradient;
}
function linear(context: SKRSContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, number][]) {
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  for (const [at, level] of stops) gradient.addColorStop(at, g(level));
  return gradient;
}

/** Fire light from the maw, rising onto the underside of the face. */
function uplight(context: SKRSContext2D, d: string, shape: GargoyleShape, strength: number) {
  context.save();
  context.clip(new Path2D(d));
  context.globalCompositeOperation = "lighter";
  const y = shape.mouth.y;
  const gradient = context.createRadialGradient(200, y, 0, 200, y, 150);
  gradient.addColorStop(0, `rgba(255,255,255,${0.55 * strength})`);
  gradient.addColorStop(0.5, `rgba(255,255,255,${0.18 * strength})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  context.restore();
}

export interface DrawOptions { open?: number; glare?: boolean; scroll?: boolean; flames?: boolean; ledge?: boolean; ink?: number; variant?: Variant }

/** Draws the gargoyle in greys on a 400×460 grid; callers transform the context to place and scale it. */
export function drawGargoyle(context: SKRSContext2D, options: DrawOptions = {}) {
  const shape = gargoyle(options.open ?? 0.6);
  const { upperTeeth, eyes } = features(shape, options.variant);
  const line = (options.ink ?? 1) * 3;
  const fire = options.flames !== false && (options.open ?? 0.6) > 0.2 ? 1 : 0;
  context.save();

  if (options.glare) {
    context.strokeStyle = g(150);
    for (let ray = 0; ray < 96; ray++) {
      const angle = (ray / 96) * Math.PI * 2;
      context.lineWidth = ray % 2 ? 1 : 2;
      context.beginPath();
      context.moveTo(200 + Math.cos(angle) * (ray % 2 ? 170 : 150), 220 + Math.sin(angle) * (ray % 2 ? 170 : 150));
      context.lineTo(200 + Math.cos(angle) * 320, 220 + Math.sin(angle) * 320);
      context.stroke();
    }
  }

  for (const wing of shape.wings) {
    fill(context, wing, linear(context, 200, 230, 10, 70, [[0, 92], [1, 54]]));
    hatch(context, wing, 6, -0.62, 1.3, 30);
    stroke(context, wing, line);
  }
  for (const bone of shape.wingBones) stroke(context, bone, line * 1.05, 12);

  for (const horn of shape.horns) {
    fill(context, horn, linear(context, 165, 115, 90, 20, [[0, 168], [0.6, 120], [1, 205]]));
    stroke(context, horn, line);
  }
  for (const ring of shape.hornRings) stroke(context, ring, line * 0.7, 28);
  for (const ear of shape.ears) { fill(context, ear, linear(context, 104, 160, 22, 124, [[0, 120], [1, 78]])); stroke(context, ear, line); }
  for (const inner of shape.earInner) stroke(context, inner, line * 0.6, 26);

  fill(context, shape.head, radial(context, 168, 140, 200, [[0, 190], [0.5, 128], [1, 70]]));
  for (const shadow of shape.cheekShadows) { fill(context, shadow, g(70)); hatch(context, shadow, 4.5, 0.85, 1.2, 28); }
  uplight(context, shape.head, shape, fire);

  fill(context, shape.maw, g(4));
  if (fire) {
    fill(context, shape.maw, radial(context, 200, shape.mouth.y + shape.jawDrop * 0.35, 46 + shape.jawDrop, [[0, 255], [0.3, 236], [0.7, 120], [1, 4]]));
    fill(context, shape.tongue, linear(context, 200, 290, 200, 330, [[0, 110], [1, 40]]));
  }
  if (options.scroll) drawScroll(context, shape);
  for (const tooth of upperTeeth) { fill(context, tooth, linear(context, 0, 284, 0, 340, [[0, 250], [1, 205]])); stroke(context, tooth, line * 0.55); }
  stroke(context, shape.head, line * 1.2, 10);

  fill(context, shape.jaw, linear(context, 200, 296 + shape.jawDrop, 200, 400 + shape.jawDrop, [[0, 150], [1, 64]]));
  fill(context, shape.jawShadow, g(52));
  hatch(context, shape.jaw, 5, 0.62, 1.1, 34);
  uplight(context, shape.jaw, shape, fire * 0.8);
  stroke(context, shape.jaw, line * 1.15, 10);
  for (const crease of shape.jawLines) stroke(context, crease, line * 0.6, 26);
  for (const tooth of shape.lowerTeeth) { fill(context, tooth, g(242)); stroke(context, tooth, line * 0.5); }
  for (const tusk of shape.tusks) { fill(context, tusk, linear(context, 130, 296, 106, 240, [[0, 196], [1, 250]])); stroke(context, tusk, line * 0.75); }
  for (const spike of shape.beard) { fill(context, spike, linear(context, 0, 380, 0, 436, [[0, 96], [1, 60]])); stroke(context, spike, line * 0.65); }

  fill(context, shape.brow, linear(context, 200, 146, 200, 204, [[0, 136], [1, 44]]));
  hatch(context, shape.brow, 4, -0.2, 1, 30);
  stroke(context, shape.brow, line * 1.05, 10);
  for (const furrow of shape.furrows) stroke(context, furrow, line * 0.7, 26);
  for (const socket of shape.sockets) fill(context, socket, g(6));
  for (const eye of eyes.slice(2)) {
    context.fillStyle = g(6);
    context.beginPath(); context.ellipse(eye.cx, eye.cy, eye.rx + 3.5, eye.ry + 3, eye.tilt, 0, Math.PI * 2); context.fill();
  }
  for (const eye of eyes) {
    context.fillStyle = radial(context, eye.cx, eye.cy, eye.rx, [[0, 255], [0.65, 248], [1, 190]]);
    context.beginPath(); context.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, eye.tilt, 0, Math.PI * 2); context.fill();
    context.fillStyle = g(4);
    context.beginPath(); context.ellipse(eye.cx, eye.cy, eye.pupil, eye.ry * 0.95, eye.tilt, 0, Math.PI * 2); context.fill();
  }
  fill(context, shape.snout, linear(context, 200, 200, 200, 268, [[0, 172], [1, 96]]));
  uplight(context, shape.snout, shape, fire * 0.6);
  stroke(context, shape.snout, line * 0.85, 12);
  for (const wrinkle of shape.snarl) stroke(context, wrinkle, line * 0.6, 26);
  for (const nostril of shape.nostrils) fill(context, nostril, g(6));
  for (const fold of shape.folds) stroke(context, fold, line * 0.75, 22);
  if (options.scroll && fire) drawFlames(context, shape);

  if (options.ledge) {
    fill(context, shape.ledge, linear(context, 0, 430, 0, 460, [[0, 160], [1, 96]]));
    hatch(context, shape.ledge, 4, 0, 1.1, 50);
    stroke(context, "M 0 430 L 400 430", line, 12);
    for (const crack of shape.ledgeCracks) stroke(context, crack, line * 0.6, 22);
    for (const hand of shape.hands) { fill(context, hand, linear(context, 0, 398, 0, 432, [[0, 150], [1, 80]])); stroke(context, hand, line * 0.9); }
    for (const knuckle of shape.knuckles) stroke(context, knuckle, line * 0.6, 26);
    for (const claw of shape.claws) { fill(context, claw, linear(context, 0, 430, 0, 458, [[0, 230], [1, 160]])); stroke(context, claw, line * 0.6); }
  }
  context.restore();
  return shape;
}

/** Malphas's six eyes as a mask for the rubric layer: dithered halos, the eyes themselves, and clear pupils. */
export function drawEyeGlow(context: SKRSContext2D, shape: GargoyleShape) {
  const { eyes } = features(shape, "abyssal");
  context.save();
  context.globalCompositeOperation = "darken";
  for (const eye of eyes) {
    const reach = eye.rx * 2.6;
    const halo = context.createRadialGradient(eye.cx, eye.cy, eye.rx * 0.5, eye.cx, eye.cy, reach);
    halo.addColorStop(0, g(70));
    halo.addColorStop(1, g(255));
    context.fillStyle = halo;
    context.beginPath(); context.arc(eye.cx, eye.cy, reach, 0, Math.PI * 2); context.fill();
  }
  context.restore();
  for (const eye of eyes) {
    context.fillStyle = g(0);
    context.beginPath(); context.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, eye.tilt, 0, Math.PI * 2); context.fill();
    context.fillStyle = g(255);
    context.beginPath(); context.ellipse(eye.cx, eye.cy, eye.pupil, eye.ry * 0.95, eye.tilt, 0, Math.PI * 2); context.fill();
  }
}

/** The confession, rolled as a scroll and clamped in the teeth. */
function drawScroll(context: SKRSContext2D, shape: GargoyleShape) {
  const y = shape.mouth.y + 4;
  const body = `M 104 ${y - 16} C 160 ${y - 22} 240 ${y - 22} 296 ${y - 18} L 298 ${y + 18} C 240 ${y + 14} 160 ${y + 16} 102 ${y + 22} Z`;
  fill(context, body, linear(context, 0, y - 20, 0, y + 22, [[0, 252], [0.7, 232], [1, 196]]));
  for (let row = 0; row < 4; row++) stroke(context, `M ${122 + row * 4} ${y - 8 + row * 7} C 170 ${y - 12 + row * 7} 230 ${y - 12 + row * 7} ${276 - row * 6} ${y - 10 + row * 7}`, 1.3, 80);
  stroke(context, body, 2, 16);
  for (const x of [100, 300]) {
    const roll = `M ${x - 10} ${y - 23} C ${x + 10} ${y - 25} ${x + 12} ${y + 24} ${x - 8} ${y + 26} C ${x - 17} ${y + 12} ${x - 17} ${y - 10} ${x - 10} ${y - 23} Z`;
    fill(context, roll, linear(context, x - 14, 0, x + 12, 0, [[0, 210], [1, 248]]));
    stroke(context, roll, 2, 16);
    stroke(context, `M ${x - 6} ${y - 14} C ${x + 2} ${y - 10} ${x + 2} ${y + 8} ${x - 5} ${y + 14}`, 1.2, 40);
  }
}

/** A woodcut tongue of fire: a swelling body that narrows into a hooked, flicking tip. */
function flame(cx: number, base: number, height: number, lean: number, width: number) {
  const tipX = cx + lean, tipY = base - height;
  return `M ${cx - width} ${base}`
    + ` C ${cx - width * 1.7} ${base - height * 0.28} ${cx - width * 0.9 + lean * 0.2} ${base - height * 0.55} ${cx + lean * 0.35} ${base - height * 0.74}`
    + ` C ${cx + lean * 0.7} ${base - height * 0.86} ${tipX - width * 0.6} ${tipY + height * 0.12} ${tipX} ${tipY}`
    + ` C ${tipX + width * 0.5} ${tipY + height * 0.22} ${cx + lean * 0.4 + width * 0.9} ${base - height * 0.62} ${cx + width * 0.8} ${base - height * 0.42}`
    + ` C ${cx + width * 1.7} ${base - height * 0.28} ${cx + width * 1.5} ${base - height * 0.08} ${cx + width} ${base} Z`;
}

function drawFlames(context: SKRSContext2D, shape: GargoyleShape) {
  const base = shape.mouth.y + 12;
  const tongues: [number, number, number, number][] = [[98, 118, -26, 15], [116, 74, 16, 10], [82, 66, -36, 9]];
  for (const [x, height, lean, width] of [...tongues, ...tongues.map(([tx, h, l, w]) => [VIEW.width - tx, h, -l, w] as [number, number, number, number])]) {
    const outer = flame(x, base, height, lean, width);
    fill(context, outer, linear(context, x, base, x + lean, base - height, [[0, 236], [0.45, 252], [1, 200]]));
    stroke(context, outer, 1.8, 14);
    const inner = flame(x + lean * 0.06, base, height * 0.62, lean * 0.5, width * 0.5);
    fill(context, inner, g(255));
    stroke(context, inner, 1.1, 60);
  }
  context.fillStyle = g(30);
  for (const [x, y, r] of [[92, 150, 2.4], [70, 180, 1.8], [124, 168, 1.6], [306, 146, 2.4], [330, 176, 1.8], [278, 164, 1.6], [100, 120, 1.4], [298, 118, 1.4]] as const) {
    context.beginPath(); context.arc(x, y + shape.jawDrop * 0.2, r, 0, Math.PI * 2); context.fill();
  }
}
