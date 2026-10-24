import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";

/** Claude Opus 5.5 reads images up to 2576 px on the long edge. Tall screenshots become labelled slices. */
export const MAX_EDGE = 2576;
export const MAX_SLICES = 4;
const SLICE_HEIGHT = 2400;
const OVERLAP = 96;

export type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export interface Slice { data: Buffer; width: number; height: number; mediaType: ImageType }

export async function probe(bytes: Buffer) {
  const image = await loadImage(bytes);
  return { width: image.width, height: image.height };
}

const sliceCount = (height: number) => Math.max(1, Math.ceil((height - OVERLAP) / (SLICE_HEIGHT - OVERLAP)));

async function render(image: Image, scale: number, top: number, width: number, height: number, mediaType: string): Promise<Slice> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, top / scale, image.width, height / scale, 0, 0, width, height);
  const png = mediaType === "image/png";
  return { data: png ? await canvas.encode("png") : await canvas.encode("jpeg", 88), width, height, mediaType: png ? "image/png" : "image/jpeg" };
}

export async function slicesFor(bytes: Buffer, mediaType: string): Promise<Slice[]> {
  const image = await loadImage(bytes);
  if (image.width <= MAX_EDGE && image.height <= MAX_EDGE) return [{ data: bytes, width: image.width, height: image.height, mediaType: mediaType as ImageType }];
  let scale = Math.min(1, MAX_EDGE / image.width);
  let height = Math.round(image.height * scale);
  if (height <= MAX_EDGE) return [await render(image, scale, 0, Math.round(image.width * scale), height, mediaType)];
  if (sliceCount(height) > MAX_SLICES) {
    scale *= (MAX_SLICES * (SLICE_HEIGHT - OVERLAP) + OVERLAP) / height;
    height = Math.round(image.height * scale);
  }
  const width = Math.round(image.width * scale);
  const count = sliceCount(height);
  const step = (height - SLICE_HEIGHT) / (count - 1);
  const out: Slice[] = [];
  for (let index = 0; index < count; index++) out.push(await render(image, scale, Math.round(index * step), width, SLICE_HEIGHT, mediaType));
  return out;
}
