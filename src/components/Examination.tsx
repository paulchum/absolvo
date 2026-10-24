"use client";

import { useEffect, useState } from "react";
import type { Inscription } from "@/lib/wall";

const IDLE = [
  "The Inquisitor adjusteth his spectacles.",
  "He counteth thy timestamps on his fingers.",
  "He tutteth at thy battery percentage.",
  "The Gargoyle licketh his chops."
];

/** The wait while Claude reads: candlelight, and the comfort of other souls' sins. */
export function Examination({ error, onRetry }: { error: string | null; onRetry(): void }) {
  const [lines, setLines] = useState<string[]>(IDLE);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    fetch("/api/wall?limit=12").then(response => response.json()).then((body: { entries: Inscription[] }) => {
      if (body.entries.length) setLines(body.entries.map(entry => entry.line));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIndex(current => current + 1); setVisible(true); }, 400);
    }, 4200);
    return () => clearInterval(timer);
  }, []);
  const meanwhile = lines !== IDLE;
  return (
    <section className="examining" aria-live="polite">
      {error ? (
        <>
          <h2 className="blackletter">The Inquisitor is vexed</h2>
          <p>{error}</p>
          <button type="button" className="plaque" onClick={onRetry}>Present it again</button>
        </>
      ) : (
        <>
          <p className="smallcaps muted" style={{ margin: 0 }}>Inquisitio</p>
          <h2 className="blackletter">The Inquisitor examineth thine evidence</h2>
          <p>Every timestamp, every dollar, every shameful percentage is being read.</p>
          <p className="meanwhile">
            <span className="smallcaps">{meanwhile ? "Meanwhile, elsewhere in Christendom…" : "In the scriptorium…"}</span>
            <strong style={{ opacity: visible ? 1 : 0 }}>{lines[index % lines.length]}</strong>
          </p>
        </>
      )}
    </section>
  );
}
