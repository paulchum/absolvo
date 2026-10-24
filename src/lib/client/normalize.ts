/** Keeps iOS Safari well under its canvas limits (16.7 MP and a shared memory budget). */
const MAX_WIDTH = 1290;
const MAX_AREA = 12_000_000;

export class ConfessionError extends Error {}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release(): void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      throw new ConfessionError(heic ? "This browser cannot read HEIC photos. Use Safari, or send a screenshot (PNG or JPEG) instead." : "That file is not an image the Gargoyle can see.");
    }
  }
}

function blank(context: CanvasRenderingContext2D, width: number, height: number) {
  const sample = context.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.floor(sample.length / 4 / 4096) * 4);
  let min = 255, max = 0;
  for (let index = 0; index < sample.length; index += step) {
    const value = sample[index] + sample[index + 1] + sample[index + 2];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min < 6;
}

/**
 * Re-encodes the confession as a white-backed JPEG no wider than 1290 px. Re-encoding drops EXIF
 * (including GPS); computing the size first keeps us inside mobile canvas limits.
 */
export async function normalizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > 40 * 1024 * 1024) throw new ConfessionError("That file is enormous. Send a screenshot instead.");
  const decoded = await decode(file);
  const scale = Math.min(1, MAX_WIDTH / decoded.width, Math.sqrt(MAX_AREA / (decoded.width * decoded.height)));
  const width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new ConfessionError("This browser refused to draw the image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    if (blank(context, width, height)) throw new ConfessionError("The image came out blank. Try a smaller screenshot.");
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size < 512) throw new ConfessionError("The image could not be prepared. Try another.");
    return { blob, width, height };
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
