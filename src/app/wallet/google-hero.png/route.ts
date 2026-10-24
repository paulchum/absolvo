import { googleHero } from "@/lib/art/pass-images";

let hero: Promise<Buffer> | undefined;

/** Fixed class artwork for Google Wallet, fetched by Google from the public origin. */
export async function GET() {
  hero ??= googleHero();
  return new Response(new Uint8Array(await hero), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
