/**
 * Value noise shared by the burn shader and the CPU. The JS twin rounds every step to float32
 * (Math.fround) so it tracks the GPU closely enough to spawn embers on the live burn front.
 */
const f = Math.fround;
const K = f(0.1031);
const C = f(33.33);
const OCTAVES = 5;
const NORMALIZER = 1 - 0.5 ** OCTAVES;

/** Spatial frequency and amplitude of the noise that ragged-edges the burn front. */
export const FIELD_FREQUENCY = 3.5;
export const FIELD_NOISE = 0.35;

export const NOISE_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int octave = 0; octave < ${OCTAVES}; octave++) {
    sum += amp * vnoise(p);
    p = vec2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y) + vec2(17.0, 9.0);
    amp *= 0.5;
  }
  return sum / ${NORMALIZER.toFixed(6)};
}
`;

const fract = (value: number) => f(value - Math.floor(value));
const mix = (a: number, b: number, t: number) => f(a + f(f(b - a) * t));

export function hash(x: number, y: number) {
  const px = fract(f(x * K)), py = fract(f(y * K)), pz = px;
  const d = f(f(f(px * f(py + C)) + f(py * f(pz + C))) + f(pz * f(px + C)));
  const qx = f(px + d), qy = f(py + d), qz = f(pz + d);
  return fract(f(f(qx + qy) * qz));
}

export function valueNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = f(x - ix), fy = f(y - iy);
  const ux = f(f(fx * fx) * f(3 - 2 * fx)), uy = f(f(fy * fy) * f(3 - 2 * fy));
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/** The per-burn offset into noise space; the shader receives the same pair as u_seed. */
export function seedOffset(seed: number): [number, number] {
  const s = Math.abs(Math.floor(seed)) % 1000;
  return [f(s * 1.37 + 3.1), f(s * 2.11 + 7.7)];
}

function fbmAt(x: number, y: number) {
  let sum = 0, amp = 0.5, px = f(x), py = f(y);
  for (let octave = 0; octave < OCTAVES; octave++) {
    sum = f(sum + f(amp * valueNoise(px, py)));
    const nx = f(f(f(1.6 * px) - f(1.2 * py)) + 17), ny = f(f(f(1.2 * px) + f(1.6 * py)) + 9);
    px = nx; py = ny;
    amp *= 0.5;
  }
  return Math.min(1, Math.max(0, sum / NORMALIZER));
}

/** Fractal value noise in [0, 1]; matches `fbm(p + u_seed)` in NOISE_GLSL. */
export function fbm(x: number, y: number, seed: number) {
  const [ox, oy] = seedOffset(seed);
  return fbmAt(f(x + ox), f(y + oy));
}

/** Scales image space so the longest side measures 1, keeping distances round on any aspect. */
export function aspectScale(aspect: number): [number, number] {
  return aspect >= 1 ? [1, 1 / aspect] : [aspect, 1];
}

/**
 * The value the burn front thresholds: distance from the bite (aspect-corrected) plus ragged noise.
 * u, v and the bite are in normalized image space; aspect is image width / height.
 */
export function burnField(u: number, v: number, bite: { x: number; y: number }, seed: number, aspect = 1) {
  const [sx, sy] = aspectScale(aspect);
  const dx = (u - bite.x) * sx, dy = (v - bite.y) * sy;
  return Math.hypot(dx, dy) + fbm(f(u * sx) * FIELD_FREQUENCY, f(v * sy) * FIELD_FREQUENCY, seed) * FIELD_NOISE;
}
