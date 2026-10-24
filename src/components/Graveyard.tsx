"use client";

import { useEffect, useRef, useState } from "react";
import { ritualAudio } from "@/lib/client/audio";
import { CARDINAL, CARDINALS, type Cardinal } from "@/lib/taxonomy";
import type { Inscription } from "@/lib/wall";
import { useWall } from "./use-wall";

interface Census { counts: Record<Cardinal, number>; today: number; souls: number }
const SHAPES = ["round", "gothic", "slab", "round", "slab", "gothic"] as const;
const when = (at: number) => new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function Graveyard({ initial, census: start }: { initial: Inscription[]; census: Census }) {
  const [census, setCensus] = useState(start);
  const { entries, fresh } = useWall(initial, () => {
    ritualAudio().chisel();
    fetch("/api/wall/census").then(response => response.json()).then(setCensus).catch(() => {});
  });
  const [older, setOlder] = useState<Inscription[]>([]);
  const [exhausted, setExhausted] = useState(initial.length < 36);
  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || exhausted) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loading.current) return;
      loading.current = true;
      const last = [...entries, ...older].at(-1);
      const body = await fetch(`/api/wall?limit=36${last ? `&before=${last.id}` : ""}`).then(response => response.json()).catch(() => ({ entries: [] })) as { entries: Inscription[] };
      setOlder(previous => [...previous, ...body.entries.filter(item => !entries.some(existing => existing.id === item.id))]);
      if (body.entries.length < 36) setExhausted(true);
      loading.current = false;
    }, { rootMargin: "600px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [entries, older, exhausted]);

  const all = [...entries, ...older.filter(item => !entries.some(existing => existing.id === item.id))];
  const peak = Math.max(1, ...Object.values(census.counts));
  return (
    <>
      <header className="graveyard-head">
        <p className="smallcaps muted" style={{ margin: 0 }}>Here lie the sins of</p>
        <h1 className="blackletter">The Graveyard</h1>
        <p>{census.souls === 0 ? "No soul has yet been absolved. The first stone awaits." : `${census.souls.toLocaleString()} ${census.souls === 1 ? "soul" : "souls"} absolved. Every stone a sin the Gargoyle hath eaten; new ones are carved as they happen.`}</p>
      </header>
      <section aria-labelledby="census-title">
        <h2 id="census-title" className="smallcaps" style={{ textAlign: "center", fontWeight: 400, fontSize: 18, color: "var(--ember-hi)" }}>The Census of Vice · today, {census.today} absolved</h2>
        <div className="census">
          {CARDINALS.map(cardinal => (
            <div key={cardinal}>
              <span className="tally">{census.counts[cardinal]}</span>
              <span className="name smallcaps">{CARDINAL[cardinal].latin}</span>
              <div className="bar" style={{ transform: `scaleX(${census.counts[cardinal] / peak})` }} />
            </div>
          ))}
        </div>
      </section>
      <section className="stones" aria-label="Inscriptions, newest first" aria-live="polite">
        {all.map(entry => (
          <article key={entry.id} className={`stone ${SHAPES[entry.id % SHAPES.length]} ${fresh.has(entry.id) ? "fresh" : ""}`}>
            <div className="rip">R · I · P</div>
            <p className="line">{entry.line}</p>
            <div className="latin">{entry.latin}</div>
            <div className="when">{when(entry.at)}</div>
          </article>
        ))}
      </section>
      {!exhausted && <div ref={sentinel} style={{ height: 1 }} />}
    </>
  );
}
