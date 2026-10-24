/** Procedural impulse response for a stone nave: pre-delay, sparse early reflections, a darkening exponential tail. */
export function cathedralImpulse(context: BaseAudioContext, seconds = 3.2, preDelay = 0.022) {
  const rate = context.sampleRate;
  const start = Math.floor(preDelay * rate);
  const length = start + Math.floor(seconds * rate);
  const buffer = context.createBuffer(2, length, rate);
  const reflections = [0.011, 0.019, 0.027, 0.034, 0.047, 0.061, 0.078];
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let index = start; index < length; index++) {
      const t = (index - start) / rate;
      // Air and stone absorb the highs first: the one-pole coefficient falls as the tail ages.
      const damping = 0.08 + 0.55 * Math.exp(-t / 0.6);
      low += damping * (Math.random() * 2 - 1 - low);
      data[index] = low * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.012);
    }
    reflections.forEach((delay, index) => {
      const at = start + Math.floor((delay + (channel ? 0.0017 * (index % 3) : 0)) * rate);
      if (at < length) data[at] += (channel ? -1 : 1) * (index % 2 ? -1 : 1) * 0.55 * 0.8 ** index;
    });
  }
  return buffer;
}

export function whiteNoise(context: BaseAudioContext, seconds = 2) {
  const buffer = context.createBuffer(1, Math.floor(seconds * context.sampleRate), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  return buffer;
}

/** Leaky-integrated noise for the fire's roar, with the loop seam crossfaded so looping never clicks. */
export function brownNoise(context: BaseAudioContext, seconds = 4) {
  const length = Math.floor(seconds * context.sampleRate);
  const fade = 2048;
  const raw = new Float32Array(length + fade);
  let last = 0;
  for (let index = 0; index < raw.length; index++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    raw[index] = last * 3.5;
  }
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) {
    data[index] = index < fade ? raw[index] * (index / fade) + raw[length + index] * (1 - index / fade) : raw[index];
  }
  return buffer;
}
