import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Topbar } from "@/components/Chrome";
import { abyssalVision } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What we keep — Absolvo" };

export default function Privacy() {
  return (
    <main>
      <div className="shell">
        <Topbar />
        <article className="manuscript document">
          <p className="kicker smallcaps">De Purgatione</p>
          <h1 className="blackletter" style={{ fontSize: "clamp(40px, 6vw, 64px)", margin: "4px 0 18px", lineHeight: 1 }}>What we keep, and what we burn</h1>
          <p><strong>Thy browser holds the key.</strong> Each confession is encrypted with its own AES-256-GCM key the moment it arrives. The server keeps the confession only as ciphertext; the key travels back to thy browser in a cookie scoped to that one confession, and is never written to our disk or database.</p>
          <p><strong>The Inquisitor reads it once.</strong> To judge thy sin, the server decrypts the confession in memory and sends it to Anthropic&apos;s Claude API, under Anthropic&apos;s data policy. So the protection is for data at rest: the plaintext does pass through our server at upload and at judgment.</p>
          <p><strong>The Arch-Prelate reads what the Inquisitor will not.</strong> If the Inquisitor recoils, the confession goes on to Malphas, a second AI provider, under that provider&apos;s terms. {abyssalVision() ? "He is shown the image itself." : "An image is first read on our server, and only its words are sent to him."} If he too refuses, the confession is destroyed at once and nothing is charged.</p>
          <p><strong>The Gargoyle eats it.</strong> When thou art absolved, the server deletes its ciphertext and tells thy browser to forget the key. We do not pretend to overwrite the disk — on modern SSDs and copy-on-write filesystems that proves nothing. The guarantee is that the key is gone, so whatever copies a backup may hold are noise. The receipt we show thee is a signed statement of these steps, not a mathematical proof. Unpaid confessions are destroyed after a day; unpayable ones at once.</p>
          <p><strong>What survives.</strong> The verdict (title, sermon, and penance) is kept, because it is printed on thy certificate and pass. Until the Gargoyle eats or the confession expires, the verdict also holds the few quotations the Inquisitor read from thy evidence; they are struck when it is eaten, and an expired confession&apos;s verdict is deleted outright. The certificate&apos;s seal is keyed with the destroyed key, so no one, us included, can match it back to the original image.</p>
          <p><strong>The Graveyard.</strong> Only if thou choosest, one line is carved on the public wall: a city taken from thy browser&apos;s timezone (never thy IP address), the class and sin, and a short abstract label. The entry is stored without thy confession or thy cookie, appears after a random delay of a minute or so, and erasing it from thy certificate page deletes it. Only the server&apos;s own secret could tie it back to thy certificate.</p>
          <p><strong>Payment.</strong> Stripe handles the card. Stripe sees a generic product, “Absolution: one sin”, and never thy confession. Stripe&apos;s payment reference is kept with thy certificate so that a refund can revoke it.</p>
          <p><Link href="/" style={{ color: "var(--rubric)" }}>Return to the altar ☞</Link></p>
        </article>
        <Footer />
      </div>
    </main>
  );
}
