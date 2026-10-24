"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { Receipt } from "@/lib/certificates";
import type { ClientView } from "@/lib/views";

interface Preview { carve: string; classOnly: string; chosen: "carve" | "class" | "struck" | null }

function Consent({ id }: { id: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/sins/${id}/inscription`).then(response => response.json()).then(setPreview).catch(() => {}); }, [id]);
  async function choose(choice: "carve" | "class" | "secret") {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/sins/${id}/inscription`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choice }) });
    const body = (await response.json().catch(() => ({}))) as { preview?: Preview; error?: string };
    if (!response.ok || !body.preview) setError(body.error || "The chisel slipped. Try again.");
    else setPreview(body.preview);
    setBusy(false);
  }
  if (!preview) return null;
  return (
    <section className="slip consent" aria-labelledby="consent-title">
      <h3 id="consent-title" className="blackletter">The Graveyard of Sins</h3>
      {preview.chosen === "struck" ? (
        <p>The keeper of the Graveyard hath struck this stone from the wall.</p>
      ) : preview.chosen === "carve" || preview.chosen === "class" ? (
        <>
          <p>It shall be carved within a few minutes, among the other souls:</p>
          <blockquote>{preview.chosen === "carve" ? preview.carve : preview.classOnly}</blockquote>
          <div className="choices">
            <Link className="plaque light" href="/graveyard">Visit the Graveyard</Link>
            <button type="button" className="plaque light" disabled={busy} onClick={() => choose("secret")}>Erase it</button>
          </div>
        </>
      ) : (
        <>
          <p>Shall thine absolution be carved, anonymously, for all Christendom to see? Only this line is shown — the city named by thy browser&apos;s timezone, the class and the sin. Never thy confession.</p>
          <blockquote>{preview.carve}</blockquote>
          <div className="choices">
            <button type="button" className="plaque light" disabled={busy} onClick={() => choose("carve")}>Carve it</button>
            <button type="button" className="plaque light" disabled={busy} onClick={() => choose("class")}>Class only</button>
            <button type="button" className="plaque light" disabled={busy} onClick={() => choose("secret")}>Keep it secret</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

export function CertificateReveal({ view, serial, receipt }: { view: ClientView; serial: string; receipt: Receipt | null }) {
  const card = `/api/certificates/${serial}/card`;
  const [loaded, setLoaded] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [shareable, setShareable] = useState(false);
  const file = useRef<File | null>(null);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(card).then(response => (response.ok ? response.blob() : null)).then(blob => {
      if (!blob || cancelled) return;
      file.current = new File([blob], `absolution-${serial}.png`, { type: "image/png" });
      setShareable(Boolean(navigator.canShare?.({ files: [file.current] })));
    }).catch(() => {});
    if (window.matchMedia("(pointer: fine)").matches) {
      fetch(`/api/certificates/${serial}/handoff`).then(response => response.json()).then((body: { url?: string }) => {
        if (body.url && !cancelled) return QRCode.toDataURL(body.url, { margin: 1, width: 264, color: { dark: "#16110d", light: "#ece0c4" } }).then(setQr);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [card, serial]);

  async function share() {
    if (!file.current) return;
    try { await navigator.share({ files: [file.current], title: "I have been absolved", text: "The Gargoyle ate my sin. absolvo" }); } catch { /* dismissed */ }
  }

  return (
    <section className="certificate" aria-labelledby="absolved-title">
      <div className={`card-frame ${view.tier}`}>
        {!loaded && <div className="pressing">The press is inking thy certificate…</div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card} alt={view.tier === "abyssal" ? "Thy Black Seal of Absolution, a woodcut of six-eyed Malphas devouring a burning scroll, printed bone on soot" : "Thy Certificate of Absolution, a woodcut of the Gargoyle devouring a burning scroll"} onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0, transition: "opacity 600ms" }} />
      </div>
      <div>
        <p className="smallcaps muted" style={{ margin: 0 }}>Absolutio</p>
        <h2 id="absolved-title" className="blackletter">Thou art absolved</h2>
        <p>{view.verdict?.epitaph ? `“${view.verdict.epitaph}”` : "The Gargoyle hath eaten thy sin."}</p>
        {view.standIn && <p className="note">{view.standIn}</p>}
        <div className="actions">
          <a className="plaque" href={`/api/certificates/${serial}/pass`}>✠ Carry it in thy Wallet</a>
          <span className="note">Apple Wallet pass (.pkpass).{view.passSigning === "development" && " Development-signed: iPhones will refuse it until real Apple certificates are configured."}</span>
          {view.googleWallet && <a className="plaque" href={`/api/certificates/${serial}/google`}>Save to Google Wallet</a>}
          {shareable ? <button type="button" className="plaque" onClick={share}>Share the woodcut</button> : <a className="plaque" href={`${card}?download=1`} download>Download the woodcut</a>}
          <Link className="textlink" href={`/v/${serial}`}>Verify this absolution ☞</Link>
        </div>
        {qr && (
          <div className="handoff">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to open this certificate on thy phone" />
            <p style={{ margin: 0 }}>Scan with thy phone to carry the certificate to its wallet. The link holds for one hour.</p>
          </div>
        )}
        <Consent id={view.id} />
        {receipt && (
          <details className="record">
            <summary>The scribe&apos;s record of the purge</summary>
            <ol className="scribe">{receipt.steps.map(step => <li key={step.label}>{step.label}<span className="ms">{step.ms.toFixed(1)} ms</span></li>)}</ol>
            <p className="note">{receipt.method}. The verdict is kept so it can be printed on thy certificate.</p>
          </details>
        )}
        <p style={{ marginTop: 26 }}><Link href="/">Confess another sin ☞</Link></p>
      </div>
    </section>
  );
}
