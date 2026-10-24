"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Inscription } from "@/lib/wall";
import { useWall } from "./use-wall";

/** The stone frieze: every soul absolved, crawling past, newest chiselled in live. */
export function Ticker({ initial }: { initial: Inscription[] }) {
  const { entries, fresh } = useWall(initial);
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const shown = entries.slice(0, 24);
  const loop = reduced ? shown : [...shown, ...shown];
  return (
    <section className="frieze" aria-label="The Graveyard of Sins, live">
      <div className="frieze-head smallcaps"><Link href="/graveyard">The Graveyard ☞</Link></div>
      {shown.length === 0 ? (
        <p className="frieze-empty">The Graveyard is silent. No soul has yet been absolved — be the first.</p>
      ) : (
        <div className="frieze-track" style={{ ["--crawl" as string]: `${Math.max(40, shown.length * 9)}s` }} aria-live="polite">
          {loop.map((entry, index) => (
            <span key={`${entry.id}-${index}`} className={`frieze-item ${fresh.has(entry.id) && index < shown.length ? "fresh" : ""}`} title={entry.latin} aria-hidden={index >= shown.length}>{entry.line}</span>
          ))}
        </div>
      )}
    </section>
  );
}
