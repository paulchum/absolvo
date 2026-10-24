import { passImages } from "@/lib/art/pass-images";

let logo: Promise<Buffer> | undefined;

/** Google wants a square logo; the wax-seal eye from the Apple icon set serves at 87 px. */
export async function GET() {
  logo ??= passImages().then(images => images["icon@3x.png"]);
  return new Response(new Uint8Array(await logo), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
