import { publicKeyJwk, publicKeyPem } from "@/lib/signing";

/** Anyone may verify a certificate offline: canonical JSON of the payload, Ed25519, this key. */
export async function GET() {
  return Response.json({ algorithm: "Ed25519", canonicalization: "sorted-key JSON", jwk: publicKeyJwk(), pem: publicKeyPem() }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
