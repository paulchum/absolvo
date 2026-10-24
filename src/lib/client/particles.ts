import { valueNoise } from "./noise";

export interface Point { x: number; y: number }

/**
 * Embers, ash and smoke on a 2D overlay. Coordinates and sizes are overlay canvas pixels
 * (device pixels). draw() does not clear the canvas; the caller does, once per frame.
 */
export interface ParticleSystem {
  emitEmbers(points: readonly Point[], heat: number, count?: number): void;
  emitAsh(points: readonly Point[], amount: number, count?: number): void;
  emitSmoke(points: readonly Point[], amount: number, count?: number): void;
  step(dt: number): void;
  draw(): void;
  count(): number;
  clear(): void;
}

const EMBER = 0, ASH = 1, SMOKE = 2;
const TAU = Math.PI * 2;
const ASH_TONES = ["#1e1a17", "#3b3530", "#5a524a", "#7a7066"];

function sprite(size: number, stops: [number, string][]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, colour] of stops) gradient.addColorStop(at, colour);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return canvas;
}

export function createParticles(context: CanvasRenderingContext2D, options: { maxParticles: number; dpr: number }): ParticleSystem {
  const capacity = Math.max(16, Math.floor(options.maxParticles));
  const dpr = options.dpr;
  const x = new Float32Array(capacity), y = new Float32Array(capacity);
  const vx = new Float32Array(capacity), vy = new Float32Array(capacity);
  const life = new Float32Array(capacity), span = new Float32Array(capacity);
  const size = new Float32Array(capacity), spin = new Float32Array(capacity);
  const turn = new Float32Array(capacity), phase = new Float32Array(capacity);
  const kind = new Uint8Array(capacity);
  let alive = 0, time = 0;

  // Ember stages, hottest first: ffd27a yellow → ff7a1a orange → deep red → dying coal.
  const embers = [
    sprite(32, [[0, "rgba(255,244,214,1)"], [0.22, "rgba(255,210,122,0.95)"], [0.5, "rgba(255,122,26,0.35)"], [1, "rgba(255,122,26,0)"]]),
    sprite(32, [[0, "rgba(255,206,130,1)"], [0.28, "rgba(255,122,26,0.85)"], [0.6, "rgba(179,38,15,0.25)"], [1, "rgba(179,38,15,0)"]]),
    sprite(32, [[0, "rgba(255,122,26,0.9)"], [0.35, "rgba(179,38,15,0.6)"], [0.7, "rgba(80,12,4,0.15)"], [1, "rgba(80,12,4,0)"]]),
    sprite(32, [[0, "rgba(120,30,10,0.7)"], [0.5, "rgba(50,10,4,0.3)"], [1, "rgba(50,10,4,0)"]])
  ];
  const smoke = sprite(64, [[0, "rgba(28,20,14,0.85)"], [0.45, "rgba(28,20,14,0.42)"], [1, "rgba(28,20,14,0)"]]);

  function spawn(type: number, px: number, py: number, pvx: number, pvy: number, seconds: number, radius: number, rotation: number) {
    if (alive >= capacity) return;
    const i = alive++;
    kind[i] = type; x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy;
    life[i] = seconds; span[i] = seconds; size[i] = radius;
    spin[i] = Math.random() * TAU; turn[i] = rotation; phase[i] = Math.random() * TAU;
  }

  function remove(i: number) {
    const last = --alive;
    if (i === last) return;
    kind[i] = kind[last]; x[i] = x[last]; y[i] = y[last]; vx[i] = vx[last]; vy[i] = vy[last];
    life[i] = life[last]; span[i] = span[last]; size[i] = size[last];
    spin[i] = spin[last]; turn[i] = turn[last]; phase[i] = phase[last];
  }

  return {
    emitEmbers(points, heat, count = points.length) {
      const h = Math.min(1.2, Math.max(0.2, heat));
      for (let k = 0; k < count && k < points.length; k++) {
        const twins = h > 0.8 && Math.random() < 0.3 ? 2 : 1;
        for (let j = 0; j < twins; j++) {
          spawn(EMBER, points[k].x, points[k].y, (Math.random() - 0.5) * 46 * dpr, -(18 + Math.random() * 74) * dpr * h,
            0.5 + Math.random() * 1.15, (0.8 + Math.random() * 1.7) * dpr * (0.7 + 0.45 * h), 0);
        }
      }
    },
    emitAsh(points, amount, count = points.length) {
      for (let k = 0; k < count && k < points.length; k++) {
        if (Math.random() > amount) continue;
        spawn(ASH, points[k].x, points[k].y, (Math.random() - 0.5) * 34 * dpr, -(10 + Math.random() * 44) * dpr,
          1.2 + Math.random() * 1.7, (2 + Math.random() * 4.2) * dpr, (Math.random() - 0.5) * 9);
      }
    },
    emitSmoke(points, amount, count = points.length) {
      for (let k = 0; k < count && k < points.length; k++) {
        if (Math.random() > amount) continue;
        spawn(SMOKE, points[k].x, points[k].y, (Math.random() - 0.5) * 12 * dpr, -(10 + Math.random() * 16) * dpr,
          1.8 + Math.random() * 1.5, (14 + Math.random() * 22) * dpr, 0);
      }
    },
    step(dt) {
      if (dt <= 0) return;
      time += dt;
      const drag = 1 - Math.min(1, 1.35 * dt);
      for (let i = 0; i < alive;) {
        life[i] -= dt;
        if (life[i] <= 0) { remove(i); continue; }
        const type = kind[i];
        if (type === EMBER) {
          // Curl of a drifting noise field: divergence-free swirls, so sparks eddy instead of jittering.
          const nx = x[i] * 0.005 / dpr, ny = y[i] * 0.005 / dpr + time * 0.35, e = 0.02;
          const curlX = (valueNoise(nx, ny + e) - valueNoise(nx, ny - e)) / (2 * e);
          const curlY = -(valueNoise(nx + e, ny) - valueNoise(nx - e, ny)) / (2 * e);
          vx[i] = (vx[i] + curlX * 26 * dpr * dt) * drag;
          vy[i] = (vy[i] + curlY * 26 * dpr * dt - 58 * dpr * dt) * drag;
        } else if (type === ASH) {
          const lift = life[i] / span[i] > 0.7 ? 34 : 0;
          vx[i] = (vx[i] + Math.sin(time * 2.1 + phase[i]) * 22 * dpr * dt) * drag;
          vy[i] = (vy[i] + (24 - lift) * dpr * dt) * drag;
          spin[i] += turn[i] * dt;
        } else {
          vx[i] = (vx[i] + (valueNoise(x[i] * 0.004 / dpr, time * 0.2 + phase[i]) - 0.5) * 18 * dpr * dt) * (1 - Math.min(1, 0.6 * dt));
          vy[i] -= 7 * dpr * dt;
          size[i] += 15 * dpr * dt;
        }
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        i++;
      }
    },
    draw() {
      if (!alive) return;
      context.save();
      context.globalCompositeOperation = "source-over";
      for (let i = 0; i < alive; i++) {
        if (kind[i] !== SMOKE) continue;
        const remaining = life[i] / span[i];
        context.globalAlpha = Math.min(1, (1 - remaining) / 0.18) * remaining * 0.32;
        const r = size[i];
        context.drawImage(smoke, x[i] - r, y[i] - r, r * 2, r * 2);
      }
      for (let i = 0; i < alive; i++) {
        if (kind[i] !== ASH) continue;
        const remaining = life[i] / span[i];
        context.globalAlpha = Math.min(1, (1 - remaining) * 5) * Math.min(1, remaining * 3) * 0.85;
        context.fillStyle = ASH_TONES[((phase[i] * 0.636) | 0) & 3];
        const s = size[i], c = Math.cos(spin[i]) * s, n = Math.sin(spin[i]) * s, flip = Math.cos(time * 3.1 + phase[i]);
        context.setTransform(c, n, -n * flip, c * flip, x[i], y[i]);
        context.fillRect(-0.5, -0.32, 1, 0.64);
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "lighter";
      for (let i = 0; i < alive; i++) {
        if (kind[i] !== EMBER) continue;
        const remaining = life[i] / span[i];
        const stage = remaining > 0.66 ? 0 : remaining > 0.42 ? 1 : remaining > 0.2 ? 2 : 3;
        const flicker = 0.6 + 0.4 * Math.sin(time * 27 + phase[i] * 5);
        context.globalAlpha = Math.min(1, remaining * 2.6 + 0.15) * flicker;
        const r = size[i] * (2.2 + remaining);
        context.drawImage(embers[stage], x[i] - r, y[i] - r, r * 2, r * 2);
        if (remaining > 0.5) {
          const core = r * 0.42;
          context.drawImage(embers[0], x[i] - core, y[i] - core, core * 2, core * 2);
        }
      }
      context.restore();
    },
    count() { return alive; },
    clear() { alive = 0; }
  };
}
