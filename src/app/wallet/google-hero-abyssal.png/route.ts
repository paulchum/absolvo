import { googleHero } from "@/lib/art/pass-images";

let hero: Promise<Buffer> | undefined;

/** The Black Seal's class artwork for Google Wallet. */
export async function GET() {
  hero ??= googleHero("abyssal");
  return new Response(new Uint8Array(await hero), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
