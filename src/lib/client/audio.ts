import { brownNoise, cathedralImpulse, whiteNoise } from "./audio-ir";

export interface RitualAudio {
  readonly enabled: boolean;
  /** Call synchronously inside a user gesture. Creates/resumes the AudioContext, prefers the "playback" audio session, remembers the choice. */
  enable(): Promise<void>;
  disable(): void;
  /** Re-resume after iOS "interrupted"/"suspended" states; call on visibilitychange and on any later gesture. */
  wake(): void;
  drone(on: boolean): void;
  /** `depth` below 1 drops the growl toward sub-bass: 0.5 is Malphas. */
  growl(intensity?: number, depth?: number): void;
  /** A low, dissonant brass horn: the parish recoils. */
  horn(): void;
  whoosh(): void;
  tear(): void;
  snap(): void;
  crunch(): void;
  crackle(on: boolean, intensity?: number): void;
  bell(): void;
  chisel(): void;
  dispose(): void;
}

interface Bus {
  ctx: BaseAudioContext;
  dry: GainNode;
  wet: GainNode;
  white: AudioBuffer;
  brown: AudioBuffer;
  curve: Float32Array<ArrayBuffer>;
}
interface Voice { input: GainNode; panner: StereoPannerNode; nodes: AudioNode[] }
interface Control { stop(): void }
interface FireControl extends Control { set(intensity: number): void }

const STORAGE_KEY = "absolvo:sound";
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Waiting time to the next event of a Poisson process. */
const interval = (rate: number) => -Math.log(1 - Math.random()) / Math.max(rate, 0.001);

function softClip(drive: number, size = 2048) {
  const curve = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let index = 0; index < size; index++) curve[index] = Math.tanh(drive * ((index / (size - 1)) * 2 - 1)) / norm;
  return curve;
}

function createBus(ctx: BaseAudioContext): Bus {
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 8;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.normalize = true;
  reverb.buffer = cathedralImpulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.6;
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);
  const dry = ctx.createGain();
  dry.connect(master);
  const wet = ctx.createGain();
  wet.connect(reverb);
  return { ctx, dry, wet, white: whiteNoise(ctx), brown: brownNoise(ctx), curve: softClip(2.4) };
}

function voice(bus: Bus, wet: number, pan = 0, level = 1): Voice {
  const { ctx } = bus;
  const input = ctx.createGain();
  input.gain.value = level;
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan, -1, 1);
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet * 0.6;
  const send = ctx.createGain();
  send.gain.value = wet;
  input.connect(panner);
  panner.connect(dry);
  dry.connect(bus.dry);
  panner.connect(send);
  send.connect(bus.wet);
  return { input, panner, nodes: [input, panner, dry, send] };
}

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.707) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

/** A slice of the shared noise buffer at a random offset, so no two grains are the same. */
function noise(bus: Bus, at: number, duration: number, rate = 1, brown = false) {
  const source = bus.ctx.createBufferSource();
  const buffer = brown ? bus.brown : bus.white;
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const span = duration * rate;
  source.start(at, Math.random() * Math.max(0, buffer.duration - span - 0.001), span);
  return source;
}

function loop(bus: Bus, brown: boolean) {
  const source = bus.ctx.createBufferSource();
  source.buffer = brown ? bus.brown : bus.white;
  source.loop = true;
  return source;
}

function tone(ctx: BaseAudioContext, type: OscillatorType, frequency: number, detune = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detune;
  return osc;
}

/** Exponential attack/decay; exponential ramps never start from zero. */
function envelope(param: AudioParam, at: number, attack: number, peak: number, decay: number, floor = 0.0001) {
  param.setValueAtTime(floor, at);
  param.exponentialRampToValueAtTime(Math.max(floor * 2, peak), at + attack);
  param.exponentialRampToValueAtTime(floor, at + attack + decay);
}

/** Freezes a parameter where it is now so a fade can start from the current value. */
function hold(param: AudioParam, now: number) {
  if ("cancelAndHoldAtTime" in param && typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else {
    const value = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
}

/** Disconnects a sound's nodes once its last source has ended. */
function retire(nodes: AudioNode[], sources: AudioScheduledSourceNode[]) {
  let pending = sources.length;
  for (const source of sources) {
    source.onended = () => {
      if (--pending > 0) return;
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* already detached */ }
      }
    };
  }
}

function playTear(bus: Bus, at: number) {
  const { ctx } = bus;
  const length = rand(0.55, 0.8);
  const out = voice(bus, 0.12, rand(-0.25, 0.25), 0.9);
  const highpass = biquad(ctx, "highpass", 900, 0.7);
  const band = biquad(ctx, "bandpass", 2200, 0.8);
  band.frequency.setValueAtTime(rand(2000, 2500), at);
  band.frequency.exponentialRampToValueAtTime(rand(4300, 5800), at + length);
  highpass.connect(band);
  band.connect(out.input);
  const nodes: AudioNode[] = [highpass, band, ...out.nodes];
  const sources: AudioScheduledSourceNode[] = [];
  const bed = noise(bus, at, length + 0.03, rand(0.9, 1.1));
  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(0.0001, at);
  for (let t = 0.004; t < length; t += rand(0.006, 0.014)) {
    bedGain.gain.linearRampToValueAtTime(Math.max(0.0001, Math.sin(Math.PI * (t / length)) ** 0.7 * rand(0.015, 0.11)), at + t);
  }
  bedGain.gain.linearRampToValueAtTime(0.0001, at + length + 0.02);
  bed.connect(bedGain);
  bedGain.connect(highpass);
  nodes.push(bed, bedGain);
  sources.push(bed);
  for (let t = 0; t < length;) {
    const progress = t / length;
    const span = rand(0.005, 0.03);
    const grain = noise(bus, at + t, span + 0.004, rand(0.75, 1.25) + 0.45 * progress);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at + t);
    gain.gain.linearRampToValueAtTime(rand(0.08, 0.42) * (0.55 + 0.45 * progress), at + t + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0006, at + t + span);
    grain.connect(gain);
    gain.connect(highpass);
    nodes.push(grain, gain);
    sources.push(grain);
    t += rand(0.004, 0.022) * (1 - 0.35 * progress);
  }
  retire(nodes, sources);
}

function playSnap(bus: Bus, at: number) {
  const { ctx } = bus;
  const out = voice(bus, 0.16, rand(-0.1, 0.1), 1);
  const thud = tone(ctx, "sine", rand(112, 132));
  thud.frequency.setValueAtTime(thud.frequency.value, at);
  thud.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  const thudGain = ctx.createGain();
  envelope(thudGain.gain, at, 0.004, 0.85, 0.17);
  thud.connect(thudGain);
  thudGain.connect(out.input);
  thud.start(at);
  thud.stop(at + 0.22);
  const click = noise(bus, at, 0.006, rand(1, 1.3));
  const clickFilter = biquad(ctx, "highpass", 3000, 0.7);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.55, at);
  clickGain.gain.exponentialRampToValueAtTime(0.0005, at + 0.005);
  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(out.input);
  const clack = noise(bus, at + 0.002, 0.02);
  const clackFilter = biquad(ctx, "bandpass", rand(1600, 2100), 4);
  const clackGain = ctx.createGain();
  clackGain.gain.setValueAtTime(2.2, at + 0.002);
  clackGain.gain.exponentialRampToValueAtTime(0.001, at + 0.022);
  clack.connect(clackFilter);
  clackFilter.connect(clackGain);
  clackGain.connect(out.input);
  retire([thud, thudGain, click, clickFilter, clickGain, clack, clackFilter, clackGain, ...out.nodes], [thud, click, clack]);
}

function playCrunch(bus: Bus, at: number) {
  const { ctx } = bus;
  const out = voice(bus, 0.1, rand(-0.2, 0.2), 0.38);
  const shaper = ctx.createWaveShaper();
  shaper.curve = bus.curve;
  shaper.oversample = "2x";
  shaper.connect(out.input);
  const nodes: AudioNode[] = [shaper, ...out.nodes];
  const sources: AudioScheduledSourceNode[] = [];
  const cracks = 4 + Math.floor(Math.random() * 6);
  for (let index = 0; index < cracks; index++) {
    const t = at + Math.random() ** 1.6 * 0.25;
    const span = rand(0.001, 0.012);
    const crack = noise(bus, t, span + 0.004, rand(0.8, 1.5));
    const filter = biquad(ctx, "bandpass", rand(800, 3500), rand(4, 11));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(rand(3, 8), t + 0.0008);
    gain.gain.exponentialRampToValueAtTime(0.002, t + span + 0.003);
    crack.connect(filter);
    filter.connect(gain);
    gain.connect(shaper);
    nodes.push(crack, filter, gain);
    sources.push(crack);
  }
  const body = tone(ctx, "sine", rand(125, 150));
  body.frequency.setValueAtTime(body.frequency.value, at);
  body.frequency.exponentialRampToValueAtTime(52, at + 0.09);
  const bodyGain = ctx.createGain();
  envelope(bodyGain.gain, at, 0.003, 1.1, 0.11);
  body.connect(bodyGain);
  bodyGain.connect(out.input);
  body.start(at);
  body.stop(at + 0.14);
  const squish = noise(bus, at + 0.01, 0.07, 0.8);
  const squishFilter = biquad(ctx, "lowpass", 650, 0.9);
  const squishGain = ctx.createGain();
  envelope(squishGain.gain, at + 0.01, 0.006, 0.6, 0.06);
  squish.connect(squishFilter);
  squishFilter.connect(squishGain);
  squishGain.connect(out.input);
  nodes.push(body, bodyGain, squish, squishFilter, squishGain);
  sources.push(body, squish);
  retire(nodes, sources);
}

function playGrowl(bus: Bus, at: number, intensity: number, depth = 1) {
  const { ctx } = bus;
  const strength = clamp(intensity, 0.2, 1.5);
  const deep = clamp(depth, 0.3, 1);
  const length = (0.6 + 0.6 * Math.min(1, strength) * rand(0.8, 1)) / Math.sqrt(deep);
  const end = at + length;
  const out = voice(bus, 0.45, rand(-0.15, 0.15), 0.75 * Math.min(1.2, strength));
  const shape = ctx.createGain();
  shape.gain.setValueAtTime(0.0001, at);
  shape.gain.exponentialRampToValueAtTime(1, at + 0.14);
  shape.gain.setValueAtTime(1, end - 0.28);
  shape.gain.exponentialRampToValueAtTime(0.0001, end);
  shape.connect(out.input);
  const f0 = rand(55, 80) * deep;
  const throat = ctx.createGain();
  throat.gain.value = 0.4;
  const oscillators = [tone(ctx, "sawtooth", f0), tone(ctx, "sawtooth", f0, 9), tone(ctx, "sine", f0 / 2)];
  for (const osc of oscillators) {
    osc.frequency.setValueAtTime(osc.frequency.value * 0.92, at);
    osc.frequency.linearRampToValueAtTime(osc.frequency.value * 1.06, at + length * 0.4);
    osc.frequency.linearRampToValueAtTime(osc.frequency.value * 0.85, end);
    osc.connect(throat);
  }
  const wobble = tone(ctx, "sine", rand(6, 9));
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = rand(25, 45);
  wobble.connect(wobbleDepth);
  for (const osc of oscillators.slice(0, 2)) wobbleDepth.connect(osc.detune);
  const nodes: AudioNode[] = [shape, throat, wobble, wobbleDepth, ...oscillators, ...out.nodes];
  for (const [frequency, q, level] of [[420, 6, 2.7], [860, 7, 1.8], [2450, 9, 1.05]] as const) {
    const formant = biquad(ctx, "bandpass", frequency * (0.55 + 0.45 * deep) * rand(0.95, 1.05), q);
    const gain = ctx.createGain();
    gain.gain.value = level;
    throat.connect(formant);
    formant.connect(gain);
    gain.connect(shape);
    nodes.push(formant, gain);
  }
  const chest = biquad(ctx, "lowpass", 700, 0.8);
  const chestGain = ctx.createGain();
  chestGain.gain.value = 0.28;
  throat.connect(chest);
  chest.connect(chestGain);
  chestGain.connect(shape);
  const rasp = noise(bus, at, length + 0.05, 1);
  const raspFilter = biquad(ctx, "bandpass", 1100, 1.2);
  const raspGain = ctx.createGain();
  raspGain.gain.value = 0.15;
  const rattle = tone(ctx, "square", rand(28, 40));
  const rattleDepth = ctx.createGain();
  rattleDepth.gain.value = 0.12;
  rattle.connect(rattleDepth);
  rattleDepth.connect(raspGain.gain);
  rasp.connect(raspFilter);
  raspFilter.connect(raspGain);
  raspGain.connect(shape);
  nodes.push(chest, chestGain, rasp, raspFilter, raspGain, rattle, rattleDepth);
  const sources = [...oscillators, wobble, rattle];
  if (deep < 1) {
    const sub = tone(ctx, "sine", f0 * 0.5);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.9 * (1 - deep);
    sub.connect(subGain);
    subGain.connect(shape);
    nodes.push(sub, subGain);
    sources.push(sub);
  }
  for (const source of sources) {
    source.start(at);
    source.stop(end + 0.05);
  }
  retire(nodes, [...sources, rasp]);
}

function playWhoosh(bus: Bus, at: number) {
  const { ctx } = bus;
  const length = 0.35;
  const out = voice(bus, 0.2, -0.6, 1);
  out.panner.pan.setValueAtTime(-0.6, at);
  out.panner.pan.linearRampToValueAtTime(0.6, at + length);
  const source = noise(bus, at, length + 0.05);
  const filter = biquad(ctx, "bandpass", 300, 0.9);
  filter.frequency.setValueAtTime(300, at);
  filter.frequency.exponentialRampToValueAtTime(3000, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.6, at + length * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(out.input);
  retire([source, filter, gain, ...out.nodes], [source]);
}

/** Partial ratio, amplitude and decay (s) of a large church bell, after the classic inharmonic series. */
const PARTIALS = [[0.5, 0.32, 6], [1, 0.6, 4.6], [1.19, 0.24, 3.6], [1.56, 0.2, 3.1], [2, 0.3, 2.6], [2.51, 0.13, 2.1], [2.66, 0.1, 1.9], [3.01, 0.08, 1.6], [4.16, 0.06, 1.1]] as const;

/** A tritone and a minor second over A1 through a lowpass "bell" that opens as the note swells, like a brass blat. */
function playHorn(bus: Bus, at: number) {
  const { ctx } = bus;
  const length = 2.6;
  const end = at + length;
  const out = voice(bus, 0.75, rand(-0.05, 0.05), 0.42);
  const shape = ctx.createGain();
  shape.gain.setValueAtTime(0.0001, at);
  shape.gain.exponentialRampToValueAtTime(1, at + 0.32);
  shape.gain.setValueAtTime(1, end - 0.9);
  shape.gain.exponentialRampToValueAtTime(0.0001, end);
  shape.connect(out.input);
  const mix = ctx.createGain();
  mix.gain.value = 0.2;
  const drive = ctx.createWaveShaper();
  drive.curve = bus.curve;
  const flare = biquad(ctx, "lowpass", 160, 2.4);
  flare.frequency.setValueAtTime(160, at);
  flare.frequency.exponentialRampToValueAtTime(1500, at + 0.42);
  flare.frequency.exponentialRampToValueAtTime(650, end);
  const body = biquad(ctx, "peaking", 470, 1.1);
  body.gain.value = 6;
  mix.connect(drive);
  drive.connect(flare);
  flare.connect(body);
  body.connect(shape);
  const vibrato = tone(ctx, "sine", rand(4.6, 5.4));
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(0, at);
  vibratoDepth.gain.linearRampToValueAtTime(0, at + 0.7);
  vibratoDepth.gain.linearRampToValueAtTime(11, at + 1.4);
  vibrato.connect(vibratoDepth);
  const nodes: AudioNode[] = [shape, mix, drive, flare, body, vibrato, vibratoDepth, ...out.nodes];
  const sources: AudioScheduledSourceNode[] = [vibrato];
  const root = rand(53, 56);
  for (const [ratio, detune, level] of [[1, 0, 1], [1, 8, 0.8], [Math.SQRT2, -6, 0.75], [Math.pow(2, 1 / 12), 5, 0.6], [0.5, 0, 0.7]] as const) {
    const osc = tone(ctx, "sawtooth", root * ratio, detune);
    osc.frequency.setValueAtTime(root * ratio * 0.93, at);
    osc.frequency.exponentialRampToValueAtTime(root * ratio, at + 0.16);
    const gain = ctx.createGain();
    gain.gain.value = level;
    vibratoDepth.connect(osc.detune);
    osc.connect(gain);
    gain.connect(mix);
    nodes.push(osc, gain);
    sources.push(osc);
  }
  for (const source of sources) {
    source.start(at);
    source.stop(end + 0.05);
  }
  retire(nodes, sources);
}

function playBell(bus: Bus, at: number) {
  const { ctx } = bus;
  const base = rand(144, 149);
  const out = voice(bus, 1.1, rand(-0.1, 0.1), 0.24);
  const nodes: AudioNode[] = [...out.nodes];
  const sources: AudioScheduledSourceNode[] = [];
  const partials: [number, number, number][] = [...PARTIALS.map(([ratio, amplitude, decay]) => [base * ratio, amplitude, decay] as [number, number, number]), [base * 0.5 + 0.7, 0.12, 5.5]];
  for (const [frequency, amplitude, decay] of partials) {
    const osc = tone(ctx, "sine", frequency, rand(-3, 3));
    const gain = ctx.createGain();
    const ring = decay * rand(0.9, 1.1);
    envelope(gain.gain, at, 0.003, amplitude, ring);
    osc.connect(gain);
    gain.connect(out.input);
    osc.start(at);
    osc.stop(at + ring + 0.1);
    nodes.push(osc, gain);
    sources.push(osc);
  }
  const strike = noise(bus, at, 0.03, 1.2);
  const strikeFilter = biquad(ctx, "bandpass", 2600, 1.5);
  const strikeGain = ctx.createGain();
  strikeGain.gain.setValueAtTime(0.9, at);
  strikeGain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
  strike.connect(strikeFilter);
  strikeFilter.connect(strikeGain);
  strikeGain.connect(out.input);
  nodes.push(strike, strikeFilter, strikeGain);
  sources.push(strike);
  retire(nodes, sources);
}

function playChisel(bus: Bus, at: number) {
  const { ctx } = bus;
  const out = voice(bus, 0.25, rand(-0.3, 0.3), 0.12);
  const nodes: AudioNode[] = [...out.nodes];
  const sources: AudioScheduledSourceNode[] = [];
  const taps = Math.random() < 0.5 ? 2 : 3;
  for (let index = 0, t = at; index < taps; index++, t += rand(0.07, 0.11)) {
    const tick = noise(bus, t, 0.004, 1.3);
    const tickFilter = biquad(ctx, "bandpass", rand(4000, 6000), 8);
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(6, t);
    tickGain.gain.exponentialRampToValueAtTime(0.002, t + 0.004);
    tick.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(out.input);
    nodes.push(tick, tickFilter, tickGain);
    sources.push(tick);
    for (const frequency of [3100, 4700]) {
      const ring = tone(ctx, "sine", frequency * rand(0.98, 1.02));
      const gain = ctx.createGain();
      envelope(gain.gain, t, 0.001, 0.5, 0.06);
      ring.connect(gain);
      gain.connect(out.input);
      ring.start(t);
      ring.stop(t + 0.08);
      nodes.push(ring, gain);
      sources.push(ring);
    }
  }
  retire(nodes, sources);
}

function startDrone(bus: Bus, at: number): Control {
  const { ctx } = bus;
  const out = voice(bus, 0.55);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.045, at + 4);
  const filter = biquad(ctx, "lowpass", 420, 0.7);
  const sweep = tone(ctx, "sine", 0.07);
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 110;
  sweep.connect(sweepDepth);
  sweepDepth.connect(filter.frequency);
  filter.connect(level);
  level.connect(out.input);
  const nodes: AudioNode[] = [level, filter, sweep, sweepDepth, ...out.nodes];
  const sources: AudioScheduledSourceNode[] = [sweep];
  for (const [frequency, detune, type, gainValue] of [[55, -4, "sawtooth", 0.5], [55, 5, "sawtooth", 0.5], [82.41, -3, "sawtooth", 0.4], [82.41, 4, "sawtooth", 0.35], [110, 0, "sine", 0.3]] as const) {
    const osc = tone(ctx, type, frequency, detune);
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(filter);
    nodes.push(osc, gain);
    sources.push(osc);
  }
  for (const source of sources) source.start(at);
  return {
    stop() {
      const now = ctx.currentTime;
      hold(level.gain, now);
      level.gain.setTargetAtTime(0, now, 0.9);
      for (const source of sources) source.stop(now + 3.5);
      retire(nodes, sources);
    }
  };
}

const roarLevel = (intensity: number) => 0.05 + 0.13 * intensity;
const hissLevel = (intensity: number) => 0.006 + 0.02 * intensity;
const clickRate = (intensity: number) => 6 + 38 * intensity;
const popRate = (intensity: number) => 0.4 + 2.2 * intensity;

/** Continuous fire. Real time schedules ahead on an interval; offline (until set) schedules everything at once. */
function startFire(bus: Bus, intensity: number, at: number, until?: number): FireControl {
  const { ctx } = bus;
  let strength = clamp(intensity, 0, 1);
  const out = voice(bus, 0.22);
  const roar = loop(bus, true);
  const roarFilter = biquad(ctx, "lowpass", 480, 0.6);
  const roarGain = ctx.createGain();
  roarGain.gain.setValueAtTime(0.0001, at);
  roarGain.gain.exponentialRampToValueAtTime(roarLevel(strength), at + 0.8);
  const swell = tone(ctx, "sine", rand(0.22, 0.38));
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = roarLevel(strength) * 0.35;
  swell.connect(swellDepth);
  swellDepth.connect(roarGain.gain);
  const flicker = tone(ctx, "sine", rand(2.3, 3.1));
  const flickerDepth = ctx.createGain();
  flickerDepth.gain.value = 140;
  flicker.connect(flickerDepth);
  flickerDepth.connect(roarFilter.frequency);
  roar.connect(roarFilter);
  roarFilter.connect(roarGain);
  roarGain.connect(out.input);
  const hiss = loop(bus, false);
  const hissFilter = biquad(ctx, "highpass", 6200, 0.7);
  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.0001, at);
  hissGain.gain.exponentialRampToValueAtTime(hissLevel(strength), at + 0.8);
  hiss.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(out.input);
  const nodes: AudioNode[] = [roar, roarFilter, roarGain, swell, swellDepth, flicker, flickerDepth, hiss, hissFilter, hissGain, ...out.nodes];
  const bands = ([[2200, 2, -0.5], [3400, 2.4, 0.1], [5200, 3, 0.55]] as const).map(([frequency, q, pan]) => {
    const filter = biquad(ctx, "bandpass", frequency, q);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    filter.connect(panner);
    panner.connect(out.input);
    nodes.push(filter, panner);
    return filter;
  });
  const popBand = biquad(ctx, "bandpass", 900, 2);
  popBand.connect(out.input);
  nodes.push(popBand);
  const loops = [roar, hiss, swell, flicker];
  roar.start(at, Math.random() * bus.brown.duration);
  hiss.start(at, Math.random() * bus.white.duration);
  swell.start(at);
  flicker.start(at);

  const click = (t: number) => {
    const span = rand(0.0005, 0.003);
    const source = noise(bus, t, span + 0.002, rand(0.9, 1.4));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(rand(0.15, 1) * (0.3 + 0.7 * strength) * (Math.random() < 0.1 ? 2.2 : 1), t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + span);
    source.connect(gain);
    gain.connect(bands[Math.floor(Math.random() * bands.length)]);
    retire([source, gain], [source]);
  };
  const pop = (t: number) => {
    const span = rand(0.004, 0.01);
    const source = noise(bus, t, span + 0.003, rand(0.8, 1.1));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(rand(2.5, 6) * (0.4 + 0.6 * strength), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + span);
    source.connect(gain);
    gain.connect(popBand);
    const thump = tone(ctx, "sine", rand(220, 340));
    const thumpGain = ctx.createGain();
    envelope(thumpGain.gain, t, 0.001, 0.18 * (0.4 + 0.6 * strength), 0.012);
    thump.connect(thumpGain);
    thumpGain.connect(out.input);
    thump.start(t);
    thump.stop(t + 0.02);
    retire([source, gain, thump, thumpGain], [source, thump]);
  };
  let nextClick = at + interval(clickRate(strength));
  let nextPop = at + interval(popRate(strength));
  const schedule = (horizon: number) => {
    while (nextClick < horizon) { click(nextClick); nextClick += interval(clickRate(strength)); }
    while (nextPop < horizon) { pop(nextPop); nextPop += interval(popRate(strength)); }
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  if (until !== undefined) {
    schedule(until);
    for (const source of loops) source.stop(until);
    retire(nodes, loops);
  } else {
    schedule(ctx.currentTime + 0.15);
    timer = setInterval(() => schedule(ctx.currentTime + 0.15), 50);
  }
  let stopped = false;
  return {
    set(next) {
      if (stopped) return;
      strength = clamp(next, 0, 1);
      const now = ctx.currentTime;
      for (const [param, value] of [[roarGain.gain, roarLevel(strength)], [hissGain.gain, hissLevel(strength)], [swellDepth.gain, roarLevel(strength) * 0.35]] as const) {
        hold(param, now);
        param.setTargetAtTime(value, now, 0.4);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (until !== undefined) return;
      const now = ctx.currentTime;
      for (const param of [roarGain.gain, hissGain.gain, swellDepth.gain]) {
        hold(param, now);
        param.setTargetAtTime(0, now, 0.35);
      }
      for (const source of loops) source.stop(now + 1.6);
      retire(nodes, loops);
    }
  };
}

interface AudioSessionLike { type: string }
function audioSession() {
  try { return (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession ?? null; }
  catch { return null; }
}
function sessionType(type: "playback" | "auto") {
  const session = audioSession();
  try { if (session && session.type !== type) session.type = type; } catch { /* unsupported */ }
}

function remember(on: boolean) {
  try { window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
}

/** Sound is opt-in: true only when the visitor turned it on before. */
export function soundPreference() {
  try { return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "on"; }
  catch { return false; }
}

const asleep = (context: AudioContext) => {
  const state = context.state as string;
  return state === "suspended" || state === "interrupted";
};

/** Older iOS only unlocks audio after something plays inside the gesture itself. */
function unlock(context: AudioContext) {
  try {
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start(0);
  } catch { /* nothing to unlock */ }
}

let instance: Engine | undefined;

class Engine implements RitualAudio {
  private context: AudioContext | null = null;
  private bus: Bus | null = null;
  private active = false;
  private droning: Control | null = null;
  private fire: FireControl | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisibility = () => { if (document.visibilityState === "visible") this.wake(); };

  get enabled() { return this.active && this.context !== null && this.context.state !== "closed"; }

  enable(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    sessionType("playback");
    if (!this.context || this.context.state === "closed") {
      const Context: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return Promise.resolve();
      const context = new Context({ latencyHint: "interactive" });
      this.context = context;
      this.bus = createBus(context);
      context.onstatechange = () => { if (this.active && document.visibilityState === "visible" && asleep(context)) context.resume().catch(() => undefined); };
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    this.active = true;
    remember(true);
    unlock(this.context);
    return asleep(this.context) ? this.context.resume().catch(() => undefined) : Promise.resolve();
  }

  disable() {
    this.drone(false);
    this.crackle(false);
    this.active = false;
    remember(false);
    sessionType("auto");
    const context = this.context;
    if (!context || context.state !== "running") return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => { if (!this.active && context.state === "running") context.suspend().catch(() => undefined); }, 1500);
  }

  wake() {
    if (this.active && this.context && asleep(this.context)) this.context.resume().catch(() => undefined);
  }

  /** The bus and a start time just ahead of now, or null when sound is off. */
  private stage() {
    if (!this.enabled || !this.bus || !this.context) return null;
    if (asleep(this.context)) this.wake();
    return { bus: this.bus, at: this.context.currentTime + 0.005 };
  }

  drone(on: boolean) {
    if (!on) { this.droning?.stop(); this.droning = null; return; }
    const stage = this.stage();
    if (stage && !this.droning) this.droning = startDrone(stage.bus, stage.at);
  }
  growl(intensity = 1, depth = 1) { const stage = this.stage(); if (stage) playGrowl(stage.bus, stage.at, intensity, depth); }
  horn() { const stage = this.stage(); if (stage) playHorn(stage.bus, stage.at); }
  whoosh() { const stage = this.stage(); if (stage) playWhoosh(stage.bus, stage.at); }
  tear() { const stage = this.stage(); if (stage) playTear(stage.bus, stage.at); }
  snap() { const stage = this.stage(); if (stage) playSnap(stage.bus, stage.at); }
  crunch() { const stage = this.stage(); if (stage) playCrunch(stage.bus, stage.at); }
  crackle(on: boolean, intensity = 0.7) {
    if (!on) { this.fire?.stop(); this.fire = null; return; }
    if (this.fire) { this.fire.set(intensity); return; }
    const stage = this.stage();
    if (stage) this.fire = startFire(stage.bus, intensity, stage.at);
  }
  bell() { const stage = this.stage(); if (stage) playBell(stage.bus, stage.at); }
  chisel() { const stage = this.stage(); if (stage) playChisel(stage.bus, stage.at); }

  dispose() {
    this.drone(false);
    this.crackle(false);
    this.active = false;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    const context = this.context;
    this.context = null;
    this.bus = null;
    if (context && context.state !== "closed") context.close().catch(() => undefined);
    if (instance === this) instance = undefined;
  }
}

export function ritualAudio(): RitualAudio { return (instance ??= new Engine()); }

/** Renders one sound offline so a real browser can check it is audible and finite. */
export function renderPreview(kind: "crunch" | "tear" | "bell" | "crackle" | "horn" | "abyssal-growl", seconds: number): Promise<AudioBuffer> {
  const rate = 44_100;
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * rate)), rate);
  const bus = createBus(context);
  const at = 0.02;
  if (kind === "crunch") playCrunch(bus, at);
  else if (kind === "tear") playTear(bus, at);
  else if (kind === "bell") playBell(bus, at);
  else if (kind === "horn") playHorn(bus, at);
  else if (kind === "abyssal-growl") playGrowl(bus, at, 1.2, 0.5);
  else startFire(bus, 0.8, at, seconds);
  return context.startRendering();
}
