import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Topbar } from "@/components/Chrome";
import { findCertificate, verifyCertificate } from "@/lib/certificates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify an absolution — Absolvo" };

/** Public, and deliberately thin: authenticity, date and class of sin — never the roast or the evidence. */
export default async function Verify({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const row = findCertificate(serial);
  const checked = row ? verifyCertificate(row) : null;
  const state = !checked ? "unknown" : !checked.authentic ? "forged" : checked.status;
  return (
    <main>
      <div className="shell">
        <Topbar />
        <article className="manuscript document">
          <p className="kicker smallcaps">Verificatio</p>
          <h1 className="blackletter" style={{ fontSize: "clamp(40px, 6vw, 64px)", margin: "4px 0 14px", lineHeight: 1 }}>Litteræ Indulgentiarum</h1>
          {state === "unknown" && <p>No absolution bearing the number <strong>{serial}</strong> exists in the registers. It may be forged, mistyped, or never issued.</p>}
          {checked && (
            <>
              <span className={`verdict-badge ${state}`}>{state === "valid" ? "✓ Authentic & in force" : state === "revoked" ? "Revoked — the offering was returned" : "Forged — the seal does not match"}</span>
              <dl className="facts">
                <dt>Number</dt><dd>{checked.payload.serial}</dd>
                <dt>Issued</dt><dd>{new Date(checked.payload.issuedAt).toUTCString()}</dd>
                <dt>Sin</dt><dd>{checked.payload.sin.latin} — {checked.payload.sin.english}, {checked.payload.sin.className}</dd>
                <dt>Remission</dt><dd>{checked.payload.remission}</dd>
                <dt>Offering</dt><dd>{checked.payload.payment === "paid" ? "Paid to the Sin-Eater" : "Dispensation (development, unpaid)"}</dd>
                <dt>Evidence</dt><dd>Destroyed {new Date(checked.payload.purgedAt).toUTCString()}</dd>
                <dt>Seal</dt><dd><code style={{ fontSize: 14 }}>{checked.payload.seal}</code></dd>
              </dl>
              <p className="note" style={{ color: "#4a3a28" }}>The seal is keyed with the confession&apos;s own destroyed key, so not even the issuer can match it back to the evidence. The certificate is signed with Ed25519; the public key and method are at <Link href="/api/keys" style={{ color: "var(--rubric)" }}>/api/keys</Link>.</p>
            </>
          )}
          <p><Link href="/" style={{ color: "var(--rubric)" }}>Confess thine own sin ☞</Link></p>
        </article>
        <Footer />
      </div>
    </main>
  );
}
