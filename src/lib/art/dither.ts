/** Luminance 0..255 from RGBA, compositing transparent pixels over white. */
export function toGray(rgba: Uint8ClampedArray) {
  const gray = new Float32Array(rgba.length / 4);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4, alpha = rgba[offset + 3] / 255;
    const value = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
    gray[index] = value * alpha + 255 * (1 - alpha);
  }
  return gray;
}

/** Atkinson error diffusion: 6/8 of the error spread, which keeps highlights crisp like a woodcut. Returns 1 for ink. */
export function atkinson(gray: Float32Array, width: number, height: number, threshold = 128) {
  const work = Float32Array.from(gray);
  const ink = new Uint8Array(work.length);
  const spread = (x: number, y: number, error: number) => { if (x >= 0 && x < width && y < height) work[y * width + x] += error; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const old = work[index];
      const value = old < threshold ? 0 : 255;
      ink[index] = value === 0 ? 1 : 0;
      const error = (old - value) / 8;
      spread(x + 1, y, error); spread(x + 2, y, error);
      spread(x - 1, y + 1, error); spread(x, y + 1, error); spread(x + 1, y + 1, error);
      spread(x, y + 2, error);
    }
  }
  return ink;
}

/** Floyd–Steinberg diffusion with serpentine scanning, for smoother mid-tones. */
export function floydSteinberg(gray: Float32Array, width: number, height: number, threshold = 128) {
  const work = Float32Array.from(gray);
  const ink = new Uint8Array(work.length);
  for (let y = 0; y < height; y++) {
    const forward = y % 2 === 0;
    for (let step = 0; step < width; step++) {
      const x = forward ? step : width - 1 - step;
      const index = y * width + x;
      const old = work[index];
      const value = old < threshold ? 0 : 255;
      ink[index] = value === 0 ? 1 : 0;
      const error = old - value;
      const ahead = forward ? 1 : -1;
      if (x + ahead >= 0 && x + ahead < width) work[index + ahead] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x - ahead >= 0 && x - ahead < width) work[index + width - ahead] += (error * 3) / 16;
        work[index + width] += (error * 5) / 16;
        if (x + ahead >= 0 && x + ahead < width) work[index + width + ahead] += error / 16;
      }
    }
  }
  return ink;
}

function bayerMatrix(size: number): number[][] {
  if (size === 1) return [[0]];
  const half = bayerMatrix(size / 2);
  const out: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
    const value = half[y][x] * 4;
    out[y][x] = value; out[y][x + size / 2] = value + 2; out[y + size / 2][x] = value + 3; out[y + size / 2][x + size / 2] = value + 1;
  }
  return out;
}

/** Ordered dithering for flat textures (stone, smoke) where diffusion would crawl. */
export function bayer(gray: Float32Array, width: number, height: number, size = 8) {
  const matrix = bayerMatrix(size), cells = size * size;
  const ink = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const limit = ((matrix[y % size][x % size] + 0.5) / cells) * 255;
    ink[y * width + x] = gray[y * width + x] < limit ? 1 : 0;
  }
  return ink;
}

export function threshold(gray: Float32Array, limit = 150) {
  const ink = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index++) ink[index] = gray[index] < limit ? 1 : 0;
  return ink;
}
