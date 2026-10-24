import { FIELD_FREQUENCY, FIELD_NOISE, NOISE_GLSL, aspectScale, burnField, seedOffset } from "./noise";
import { createParticles, type ParticleSystem, type Point } from "./particles";

export interface BurnOptions {
  /** WebGL2 target, sized by the caller via CSS. */
  canvas: HTMLCanvasElement;
  /** 2D canvas for particles, the same box, stacked above. */
  overlay: HTMLCanvasElement;
  image: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
  /** Normalized 0..1 point in image space where the gargoyle bit: the burn's origin. */
  bite: { x: number; y: number };
  seed?: number;
  /** No particles or heat warp; a ~1.2 s char-dissolve on the Canvas2D path. */
  reducedMotion?: boolean;
  onProgress?(progress: number): void;
}

export interface Burner {
  readonly mode: "webgl2" | "canvas2d";
  /** A toothed bite appears over ~180 ms; call 1–3 times for successive, larger bites. */
  bite(strength: number): void;
  /** Burns from the bite over durationMs; resolves once fully consumed and the particles have mostly settled. */
  ignite(durationMs: number): Promise<void>;
  /** The server purge is confirmed: release the final 15% of the burn. */
  confirm(): void;
  dispose(): void;
}

type Fit = { x: number; y: number; w: number; h: number };
interface Frame { front: number; char: number; time: number; biteRadius: number; fit: Fit; width: number; height: number }
interface Renderer { render(frame: Frame): void; destroy(): void }

const CHAR = 0.09;
const EMBER = 0.012;
const TEETH = 14;
const BITE_MS = 180;
const HOLD = 0.85;
const REDUCED_MS = 1200;
const MAX_TEXTURE = 2048;
const CPU_EDGE = 256;
const TAU = Math.PI * 2;

const VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec4 u_rect;
uniform vec2 u_scale;
uniform vec2 u_bite;
uniform vec2 u_seed;
uniform float u_front;
uniform float u_char;
uniform float u_ember;
uniform float u_time;
uniform float u_biteR;
uniform float u_warp;
${NOISE_GLSL}
void main() {
  vec2 screen = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 uv = (screen - u_rect.xy) / u_rect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { outColor = vec4(0.0); return; }
  vec3 emberLo = vec3(1.0, 0.478, 0.102);
  vec3 emberHi = vec3(1.0, 0.824, 0.478);
  float flicker = vnoise(uv * 38.0 + vec2(u_time * 2.7, -u_time * 3.1));
  vec3 glow = mix(emberLo, emberHi, flicker);

  vec2 bd = (uv - u_bite) * u_scale;
  float br = length(bd);
  float tooth = abs(fract(atan(bd.y, bd.x) / ${TAU.toFixed(7)} * ${TEETH.toFixed(1)}) - 0.5) * 2.0;
  float edge = u_biteR * (0.8 + 0.32 * tooth);
  if (u_biteR > 0.0 && br < edge) { outColor = vec4(0.0); return; }
  float rim = u_biteR > 0.0 ? 1.0 - smoothstep(0.0, 0.014, br - edge) : 0.0;

  float field = length((uv - u_bite) * u_scale) + fbm(uv * u_scale * ${FIELD_FREQUENCY.toFixed(3)} + u_seed) * ${FIELD_NOISE.toFixed(3)};
  float rel = field - u_front;
  if (rel < 0.0) {
    float halo = (1.0 - smoothstep(0.0, u_ember * 1.6, -rel)) * (0.6 + 0.4 * flicker) * 0.85;
    outColor = vec4(glow * halo, halo);
    return;
  }

  float heat = 1.0 - smoothstep(0.0, 0.16, rel);
  vec2 suv = uv;
  if (u_warp > 0.5) {
    vec2 wobble = vec2(vnoise(uv * 22.0 + vec2(u_time * 0.9, 0.0)), vnoise(uv * 22.0 + vec2(5.2, u_time * 0.9))) - 0.5;
    suv = clamp(uv + wobble * 0.012 * heat, 0.0, 1.0);
  }
  vec4 tex = texture(u_tex, suv);
  vec3 col = tex.rgb;
  float a = tex.a;
  float scorch = 1.0 - smoothstep(u_char, u_char * 2.4, rel);
  col *= mix(vec3(1.0), vec3(0.78, 0.55, 0.32), scorch * 0.55);
  float charred = 1.0 - smoothstep(0.0, u_char, rel);
  float curl = vnoise(uv * 64.0 + u_seed) * (1.0 - smoothstep(0.0, u_char * 0.5, rel));
  col = mix(col, col * vec3(0.42, 0.24, 0.1), smoothstep(0.0, 0.5, charred));
  col = mix(col, vec3(0.102, 0.059, 0.031) * a, clamp(smoothstep(0.45, 1.0, charred) + curl * 0.35, 0.0, 1.0));
  float line = 1.0 - smoothstep(0.0, u_ember, rel);
  float lit = clamp(max(line * (0.75 + 0.5 * flicker), rim * (0.6 + 0.4 * flicker)), 0.0, 1.0);
  col = mix(col, glow * a, lit);
  outColor = vec4(min(col, vec3(a)), a);
}`;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const toothOf = (dx: number, dy: number) => {
  const turn = (Math.atan2(dy, dx) / TAU) * TEETH;
  return Math.abs(turn - Math.floor(turn) - 0.5) * 2;
};

function dimensions(image: BurnOptions["image"]) {
  const width = image instanceof HTMLImageElement ? image.naturalWidth || image.width : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight || image.height : image.height;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

function scaledCopy(image: BurnOptions["image"], width: number, height: number) {
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  copy.getContext("2d")?.drawImage(image, 0, 0, width, height);
  return copy;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("Burn shader failed to compile", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createGpuRenderer(canvas: HTMLCanvasElement, image: BurnOptions["image"], scale: [number, number], bite: Point, seed: [number, number], warp: boolean): Renderer | null {
  let gl: WebGL2RenderingContext | null = null;
  try { gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); }
  catch { return null; }
  if (!gl || gl.isContextLost()) return null;
  const context = gl;
  const vertex = compile(context, context.VERTEX_SHADER, VERTEX);
  const fragment = compile(context, context.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return null;
  const program = context.createProgram();
  context.attachShader(program, vertex);
  context.attachShader(program, fragment);
  context.linkProgram(program);
  context.deleteShader(vertex);
  context.deleteShader(fragment);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    console.warn("Burn shader failed to link", context.getProgramInfoLog(program));
    context.deleteProgram(program);
    return null;
  }
  const { width, height } = dimensions(image);
  const limit = Math.min(MAX_TEXTURE, Number(context.getParameter(context.MAX_TEXTURE_SIZE)) || MAX_TEXTURE);
  const shrink = Math.min(1, limit / Math.max(width, height));
  const source = shrink < 1 ? scaledCopy(image, Math.max(1, Math.round(width * shrink)), Math.max(1, Math.round(height * shrink))) : image;
  const texture = context.createTexture();
  context.bindTexture(context.TEXTURE_2D, texture);
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
  try { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, source); }
  catch (error) {
    console.warn("Burn texture upload failed", error);
    context.deleteTexture(texture);
    context.deleteProgram(program);
    return null;
  }
  context.generateMipmap(context.TEXTURE_2D);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR_MIPMAP_LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  const vao = context.createVertexArray();
  const at = (name: string) => context.getUniformLocation(program, name);
  const uniforms = {
    rect: at("u_rect"), front: at("u_front"), char: at("u_char"), ember: at("u_ember"),
    time: at("u_time"), biteR: at("u_biteR")
  };
  context.useProgram(program);
  context.uniform1i(at("u_tex"), 0);
  context.uniform2f(at("u_scale"), scale[0], scale[1]);
  context.uniform2f(at("u_bite"), bite.x, bite.y);
  context.uniform2f(at("u_seed"), seed[0], seed[1]);
  context.uniform1f(at("u_warp"), warp ? 1 : 0);
  context.disable(context.BLEND);
  return {
    render(frame) {
      if (context.isContextLost()) return;
      context.viewport(0, 0, frame.width, frame.height);
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      context.useProgram(program);
      context.bindVertexArray(vao);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, texture);
      context.uniform4f(uniforms.rect, frame.fit.x / frame.width, frame.fit.y / frame.height, frame.fit.w / frame.width, frame.fit.h / frame.height);
      context.uniform1f(uniforms.front, frame.front);
      context.uniform1f(uniforms.char, frame.char);
      context.uniform1f(uniforms.ember, EMBER);
      context.uniform1f(uniforms.time, frame.time);
      context.uniform1f(uniforms.biteR, frame.biteRadius);
      context.drawArrays(context.TRIANGLES, 0, 3);
    },
    destroy() {
      if (!context.isContextLost()) {
        context.deleteTexture(texture);
        context.deleteVertexArray(vao);
        context.deleteProgram(program);
        context.clearColor(0, 0, 0, 0);
        context.clear(context.COLOR_BUFFER_BIT);
      }
      context.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}

/** CPU twin of the shader on a ≤256 px working copy, drawn scaled into the overlay. Never throws. */
function createCpuRenderer(target: CanvasRenderingContext2D, image: BurnOptions["image"], scale: [number, number], bite: Point, seed: number, aspect: number): Renderer {
  const { width: iw, height: ih } = dimensions(image);
  const shrink = Math.min(1, CPU_EDGE / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * shrink)), h = Math.max(1, Math.round(ih * shrink));
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const context = work.getContext("2d", { willReadFrequently: true });
  let pixels: Uint8ClampedArray | null = null;
  let output: ImageData | null = null;
  const field = new Float32Array(w * h), distance = new Float32Array(w * h), teeth = new Float32Array(w * h);
  try {
    if (context) {
      context.drawImage(image, 0, 0, w, h);
      pixels = new Uint8ClampedArray(context.getImageData(0, 0, w, h).data);
      output = context.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = (x + 0.5) / w, v = (y + 0.5) / h, index = y * w + x;
          const dx = (u - bite.x) * scale[0], dy = (v - bite.y) * scale[1];
          field[index] = burnField(u, v, bite, seed, aspect);
          distance[index] = Math.hypot(dx, dy);
          teeth[index] = toothOf(dx, dy);
        }
      }
    }
  } catch { pixels = null; output = null; }

  return {
    render(frame) {
      const { fit } = frame;
      if (!context || !pixels || !output) {
        // Unreadable pixels: fade the whole confession out with the burn instead.
        target.save();
        target.globalAlpha = frame.front < 0 ? 1 : clamp01(1 - frame.front / (1 + FIELD_NOISE));
        target.drawImage(image, fit.x, fit.y, fit.w, fit.h);
        target.restore();
        return;
      }
      const out = output.data;
      const charW = frame.char, warmth = 0.6 + 0.4 * Math.sin(frame.time * 9);
      for (let index = 0, p = 0; index < field.length; index++, p += 4) {
        const edge = frame.biteRadius * (0.8 + 0.32 * teeth[index]);
        const rel = field[index] - frame.front;
        if ((frame.biteRadius > 0 && distance[index] < edge) || rel < 0) {
          const halo = rel < 0 && -rel < EMBER * 1.6 && !(frame.biteRadius > 0 && distance[index] < edge) ? (1 - -rel / (EMBER * 1.6)) * 0.8 * warmth : 0;
          out[p] = 255; out[p + 1] = 150; out[p + 2] = 50; out[p + 3] = halo * 255;
          continue;
        }
        let r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const a = pixels[p + 3];
        const scorch = (1 - clamp01((rel - charW) / (charW * 1.4))) * 0.55;
        r *= 1 - 0.22 * scorch; g *= 1 - 0.45 * scorch; b *= 1 - 0.68 * scorch;
        const charred = 1 - clamp01(rel / charW);
        const brown = clamp01(charred / 0.5), black = clamp01((charred - 0.45) / 0.55);
        r = r * (1 - 0.58 * brown); g = g * (1 - 0.76 * brown); b = b * (1 - 0.9 * brown);
        r += (26 - r) * black; g += (15 - g) * black; b += (8 - b) * black;
        const line = 1 - clamp01(rel / EMBER);
        const rim = frame.biteRadius > 0 ? 1 - clamp01((distance[index] - edge) / 0.014) : 0;
        const lit = clamp01(Math.max(line * (0.75 + 0.5 * warmth), rim * (0.6 + 0.4 * warmth)));
        out[p] = r + (255 - r) * lit;
        out[p + 1] = g + (170 - g) * lit;
        out[p + 2] = b + (60 - b) * lit;
        out[p + 3] = a;
      }
      context.putImageData(output, 0, 0);
      target.save();
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = "high";
      target.drawImage(work, fit.x, fit.y, fit.w, fit.h);
      target.restore();
    },
    destroy() { work.width = work.height = 0; }
  };
}

export function createBurner(options: BurnOptions): Burner {
  const { canvas, overlay, image } = options;
  const seed = options.seed ?? Math.floor(Math.random() * 100_000);
  const reduced = options.reducedMotion === true;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width: imageWidth, height: imageHeight } = dimensions(image);
  const aspect = imageWidth / imageHeight;
  const scale = aspectScale(aspect);
  const bite = { x: clamp01(options.bite.x), y: clamp01(options.bite.y) };
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => Math.hypot((u - bite.x) * scale[0], (v - bite.y) * scale[1]));
  const frontEnd = Math.max(...corners) + FIELD_NOISE + CHAR + 0.02;
  const overlayContext = overlay.getContext("2d");
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 500;
  const maxParticles = lowEnd ? 450 : 900;
  const particles: ParticleSystem | null = overlayContext && !reduced ? createParticles(overlayContext, { maxParticles, dpr }) : null;
  const candidates = lowEnd ? 48 : 90;
  const points: Point[] = Array.from({ length: candidates }, () => ({ x: 0, y: 0 }));

  let width = 1, height = 1;
  const fit: Fit = { x: 0, y: 0, w: 1, h: 1 };
  function resize() {
    width = Math.max(1, Math.round((canvas.clientWidth || imageWidth / dpr) * dpr));
    height = Math.max(1, Math.round((canvas.clientHeight || imageHeight / dpr) * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    const contain = Math.min(width / imageWidth, height / imageHeight);
    fit.w = imageWidth * contain;
    fit.h = imageHeight * contain;
    fit.x = (width - fit.w) / 2;
    fit.y = (height - fit.h) / 2;
  }
  resize();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resize());
  observer?.observe(canvas);

  const offset = seedOffset(seed);
  let gpu: Renderer | null = reduced ? null : createGpuRenderer(canvas, image, scale, bite, offset, true);
  let cpu: Renderer | null = null;
  let mode: Burner["mode"] = gpu ? "webgl2" : "canvas2d";

  let biteFrom = 0, biteTo = 0, biteRadius = 0, biteStarted = -1;
  let ignited = false, confirmed = false, progress = 0, frontStart = -0.02, ignitedAt = 0, duration = 1, completedAt = -1;
  let pending: Promise<void> | null = null;
  let resolve: (() => void) | null = null;
  let emberBudget = 0, ashBudget = 0, smokeBudget = 0;
  let raf = 0, last = -1, disposed = false;
  const started = performance.now();

  const onLost = (event: Event) => { event.preventDefault(); gpu = null; mode = "canvas2d"; };
  const onRestored = () => {
    if (disposed || completedAt >= 0) return;
    gpu = createGpuRenderer(canvas, image, scale, bite, offset, true);
    if (gpu) mode = "webgl2";
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  function insideBite(u: number, v: number) {
    if (biteRadius <= 0) return false;
    const dx = (u - bite.x) * scale[0], dy = (v - bite.y) * scale[1];
    return Math.hypot(dx, dy) < biteRadius * (0.8 + 0.32 * toothOf(dx, dy));
  }

  function emitAlongFront(front: number, dt: number) {
    if (!particles) return;
    let hits = 0;
    for (let k = 0; k < candidates; k++) {
      const u = Math.random(), v = Math.random();
      if (Math.abs(burnField(u, v, bite, seed, aspect) - front) > 0.016 || insideBite(u, v)) continue;
      points[hits].x = fit.x + u * fit.w;
      points[hits].y = fit.y + v * fit.h;
      hits++;
    }
    const holding = !confirmed && progress >= HOLD;
    emberBudget = Math.min(30, emberBudget + dt * (holding ? 90 : 260));
    ashBudget = Math.min(10, ashBudget + dt * (holding ? 12 : 42));
    smokeBudget = Math.min(3, smokeBudget + dt * (progress > 0.45 ? 6 : 0));
    if (!hits) return;
    const embers = Math.min(hits, Math.floor(emberBudget));
    emberBudget -= embers;
    if (embers) particles.emitEmbers(points, holding ? 0.6 : 1 - progress * 0.25, embers);
    const ash = Math.min(hits, Math.floor(ashBudget));
    ashBudget -= ash;
    if (ash) particles.emitAsh(points, 0.9, ash);
    const smoke = Math.min(hits, Math.floor(smokeBudget));
    smokeBudget -= smoke;
    if (smoke) particles.emitSmoke(points, 1, smoke);
  }

  function tick(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = last < 0 ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (biteStarted >= 0) {
      const t = clamp01((now - biteStarted) / BITE_MS);
      biteRadius = biteFrom + (biteTo - biteFrom) * easeOutBack(t);
      if (t >= 1) { biteRadius = biteTo; biteStarted = -1; }
    }
    let front = -1, charScale = 0;
    if (ignited) {
      const ceiling = confirmed ? 1 : HOLD;
      if (progress < ceiling) progress = Math.min(ceiling, progress + (dt * 1000) / duration);
      front = frontStart + (frontEnd - frontStart) * easeInOut(progress);
      charScale = clamp01((now - ignitedAt) / 350);
      options.onProgress?.(progress);
      if (progress >= 1 && completedAt < 0) completedAt = now;
      if (completedAt < 0) emitAlongFront(front, dt);
    }
    particles?.step(dt);
    overlayContext?.clearRect(0, 0, overlay.width, overlay.height);
    const frame: Frame = { front, char: Math.max(0.0005, CHAR * charScale), time: (now - started) / 1000, biteRadius, fit, width, height };
    if (mode === "webgl2" && gpu) gpu.render(frame);
    else if (overlayContext) (cpu ??= createCpuRenderer(overlayContext, image, scale, bite, seed, aspect)).render(frame);
    particles?.draw();
    if (completedAt >= 0 && resolve && (reduced || !particles || particles.count() <= maxParticles * 0.05 || now - completedAt > 1600)) {
      const done = resolve;
      resolve = null;
      done();
    }
    if (completedAt >= 0 && !resolve && (!particles || particles.count() === 0)) return;
    raf = requestAnimationFrame(tick);
  }
  function loop() {
    if (!raf && !disposed) { last = -1; raf = requestAnimationFrame(tick); }
  }
  loop();

  return {
    get mode() { return mode; },
    bite(strength) {
      if (disposed) return;
      const s = Math.min(1.5, Math.max(0, strength));
      biteFrom = biteRadius;
      biteTo = Math.min(0.26, biteTo + 0.05 + 0.04 * s);
      biteStarted = performance.now();
      if (particles) {
        let count = 0;
        for (let k = 0; k < points.length && count < 28; k++) {
          const angle = Math.random() * TAU;
          const u = bite.x + (Math.cos(angle) * biteTo) / scale[0], v = bite.y + (Math.sin(angle) * biteTo) / scale[1];
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          points[count].x = fit.x + u * fit.w;
          points[count].y = fit.y + v * fit.h;
          count++;
        }
        particles.emitEmbers(points, 0.9, count);
        particles.emitAsh(points, 0.7, count);
      }
      loop();
    },
    ignite(durationMs) {
      if (pending) return pending;
      ignited = true;
      ignitedAt = performance.now();
      duration = reduced ? REDUCED_MS : Math.max(400, durationMs);
      frontStart = biteTo > 0 ? biteTo * 0.85 : -0.02;
      pending = new Promise<void>(done => { resolve = done; });
      if (disposed) { resolve?.(); resolve = null; }
      loop();
      return pending;
    },
    confirm() { confirmed = true; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gpu?.destroy();
      gpu = null;
      cpu?.destroy();
      cpu = null;
      particles?.clear();
      overlayContext?.clearRect(0, 0, overlay.width, overlay.height);
      resolve?.();
      resolve = null;
    }
  };
}
