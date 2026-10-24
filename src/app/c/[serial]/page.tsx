import Link from "next/link";
import { Footer, Topbar } from "@/components/Chrome";
import { findCertificate } from "@/lib/certificates";
import { verifyHandoff } from "@/lib/session";
import { appleConfig } from "@/lib/wallet/apple";
import { googleConfig } from "@/lib/wallet/google";

export const dynamic = "force-dynamic";

/** Where the desktop QR code lands: the certificate, carried to the phone with a one-hour link. */
export default async function Handoff({ params, searchParams }: { params: Promise<{ serial: string }>; searchParams: Promise<{ t?: string }> }) {
  const { serial } = await params;
  const { t } = await searchParams;
  const valid = Boolean(findCertificate(serial)) && verifyHandoff(serial, typeof t === "string" ? t : null);
  const query = `?t=${encodeURIComponent(t ?? "")}`;
  return (
    <main>
      <div className="shell">
        <Topbar />
        {valid ? (
          <section className="certificate" style={{ marginTop: 24 }}>
            <div className="card-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/certificates/${serial}/card${query}`} alt="Thy Certificate of Absolution" />
            </div>
            <div>
              <h2 className="blackletter">Carry it with thee</h2>
              <div className="actions">
                <a className="plaque" href={`/api/certificates/${serial}/pass${query}`}>✠ Carry it in thy Wallet</a>
                <span className="note">Apple Wallet pass (.pkpass).{!appleConfig().real && " Development-signed: iPhones will refuse it until real Apple certificates are configured."}</span>
                {googleConfig().enabled && <a className="plaque" href={`/api/certificates/${serial}/google${query}`}>Save to Google Wallet</a>}
                <a className="plaque" href={`/api/certificates/${serial}/card${query}&download=1`} download>Download the woodcut</a>
              </div>
            </div>
          </section>
        ) : (
          <article className="manuscript document">
            <h2 className="blackletter">This link hath expired</h2>
            <p>Handoff links last one hour. Open the certificate again on the device where thou wert absolved and scan a fresh code.</p>
            <Link href="/" style={{ color: "var(--rubric)" }}>To the altar ☞</Link>
          </article>
        )}
        <Footer />
      </div>
    </main>
  );
}
