import Link from "next/link";
import { BINDING } from "@/lib/sacrament";

export function Topbar() {
  return (
    <header className="topbar">
      <Link href="/" className="mark blackletter" aria-label="Absolvo, home">Absolvo</Link>
      <nav aria-label="Main">
        <Link href="/graveyard">The Graveyard</Link>
        <Link href="/privacy">What we keep</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span className="binding">{BINDING}</span>
      <span><Link href="/privacy">Privacy &amp; the purge</Link></span>
    </footer>
  );
}

/** `crimson` turns every flame deep red: the parish has recoiled, or the Abyss is open. */
export function Candles({ count = 5, crimson = false }: { count?: number; crimson?: boolean }) {
  const heights = [62, 88, 104, 80, 58, 94, 70];
  return (
    <div className={`candles ${crimson ? "crimson" : ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="candle lit" style={{ height: heights[index % heights.length] }}>
          <span className="flame" style={{ animationDelay: `${index * 0.37}s, ${0.3 + index * 0.45}s` }} />
        </div>
      ))}
    </div>
  );
}
