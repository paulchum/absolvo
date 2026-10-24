"use client";

import { useEffect, useRef, useState } from "react";
import type { Inscription } from "@/lib/wall";

/** Live Graveyard entries over Server-Sent Events, falling back to polling if the stream is refused. */
export function useWall(initial: Inscription[], onArrive?: (entry: Inscription) => void) {
  const [entries, setEntries] = useState(initial);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  useEffect(() => {
    let stopped = false, poll: ReturnType<typeof setInterval> | undefined, source: EventSource | undefined;
    const add = (entry: Inscription) => {
      setEntries(previous => (previous.some(item => item.id === entry.id) ? previous : [entry, ...previous].slice(0, 200)));
      setFresh(previous => new Set(previous).add(entry.id));
      arrive.current?.(entry);
    };
    const startPolling = () => {
      if (poll || stopped) return;
      poll = setInterval(async () => {
        const newest = await fetch("/api/wall?limit=1").then(response => response.json()).catch(() => null) as { entries: Inscription[] } | null;
        const latest = newest?.entries[0];
        if (!latest) return;
        const result = await fetch(`/api/wall?after=${Math.max(0, latest.id - 20)}&limit=20`).then(response => response.json()).catch(() => null) as { entries: Inscription[] } | null;
        result?.entries.slice().reverse().forEach(add);
      }, 20_000);
    };
    if ("EventSource" in window) {
      source = new EventSource("/api/wall/stream");
      source.addEventListener("inscription", event => add(JSON.parse((event as MessageEvent<string>).data) as Inscription));
      source.addEventListener("full", () => { source?.close(); startPolling(); });
    } else startPolling();
    return () => { stopped = true; source?.close(); if (poll) clearInterval(poll); };
  }, []);

  return { entries, fresh };
}
