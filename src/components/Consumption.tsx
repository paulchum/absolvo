"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ritualAudio } from "@/lib/client/audio";
import { createBurner, type Burner } from "@/lib/client/burn";
import { forgetRelic, loadRelic } from "@/lib/client/relic-store";
import { textRelic } from "@/lib/client/text-relic";
import type { Receipt } from "@/lib/certificates";
import type { ClientView } from "@/lib/views";
import { Gargoyle, type GargoyleHandle } from "./Gargoyle";
import { wakeSound } from "./SoundToggle";

/** Where the confession hangs from the jaws, and the larger box the fire may rise through (grid units). */
const CARD = { x: 140, y: 292, w: 120, h: 160 };
const BOX = { x: 60, y: 120, w: 280, h: 340 };
const PX = 4;
const BITE = { x: (CARD.x + CARD.w / 2 - BOX.x) / BOX.w, y: (CARD.y + 7 - BOX.y) / BOX.h };
const REST = { x: 0, y: 1.05 };

const place = (rect: { x: number; y: number; w: number; h: number }) => ({ left: `${(rect.x / 400) * 100}%`, top: `${(rect.y / 460) * 100}%`, width: `${(rect.w / 400) * 100}%`, height: `${(rect.h / 460) * 100}%` });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface Absolution { serial: string; receipt: Receipt; view: ClientView }
interface Props { view: ClientView; onAbsolved(result: Absolution): void }
type Phase = "loading" | "ready" | "devouring" | "burning" | "done";

async function relicImage(id: string): Promise<HTMLCanvasElement | ImageBitmap> {
  const saved = await loadRelic(id);
  if (saved?.kind === "image" && saved.blob) return createImageBitmap(saved.blob);
  if (saved?.kind === "text" && saved.text) return textRelic(saved.text);
  const response = await fetch(`/api/sins/${id}/relic`, { cache: "no-store" });
  if (response.ok) {
    if ((response.headers.get("content-type") || "").startsWith("text/")) return textRelic(await response.text());
    return createImageBitmap(await response.blob());
  }
  return textRelic("The Gargoyle grew impatient and ate thy confession while thou wert away. This parchment stands in its place.");
}

/** The confession on parchment, padded into the fire box so embers have room to rise. */
function padded(source: HTMLCanvasElement | ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = BOX.w * PX;
  canvas.height = BOX.h * PX;
  const context = canvas.getContext("2d")!;
  const x = (CARD.x - BOX.x) * PX, y = (CARD.y - BOX.y) * PX, w = CARD.w * PX, h = CARD.h * PX;
  context.fillStyle = "#ece0c4";
  context.fillRect(x - 10, y - 10, w + 20, h + 20);
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, w, h);
  const cover = Math.max(w / source.width, h / source.height);
  context.drawImage(source, x + (w - source.width * cover) / 2, y, source.width * cover, source.height * cover);
  context.restore();
  return canvas;
}

export function Consumption({ view, onAbsolved }: Props) {
  const gargoyle = useRef<GargoyleHandle>(null);
  const abyssal = view.tier === "abyssal";
  const stage = useRef<HTMLDivElement>(null);
  const cardCanvas = useRef<HTMLCanvasElement>(null);
  const fireCanvas = useRef<HTMLCanvasElement>(null);
  const emberCanvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLCanvasElement | ImageBitmap | null>(null);
  const burner = useRef<Burner | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null);
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [offset, setOffset] = useState(REST);
  const [animate, setAnimate] = useState(false);
  const [held, setHeld] = useState(false);
  const [fire, setFire] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [log, setLog] = useState<Receipt["steps"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const retry = useRef<(() => void) | null>(null);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let cancelled = false;
    relicImage(view.id).then(image => {
      if (cancelled) return;
      source.current = image;
      const canvas = cardCanvas.current;
      if (canvas) {
        canvas.width = CARD.w * PX;
        canvas.height = CARD.h * PX;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const cover = Math.max(canvas.width / image.width, canvas.height / image.height);
        context.drawImage(image, (canvas.width - image.width * cover) / 2, 0, image.width * cover, image.height * cover);
      }
      setPhase("ready");
      requestAnimationFrame(() => stage.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    }).catch(() => setError("The relic could not be brought to the altar. Reload to try again."));
    return () => { cancelled = true; burner.current?.dispose(); burner.current = null; ritualAudio().crackle(false); };
  }, [view.id]);

  const cardHeight = () => (stage.current?.querySelector(".relic-card") as HTMLElement | null)?.getBoundingClientRect().height ?? 160;

  const shake = useCallback(() => { setShaking(false); requestAnimationFrame(() => setShaking(true)); setTimeout(() => setShaking(false), 320); }, []);

  const consume = useCallback(async (): Promise<Absolution> => {
    const response = await fetch(`/api/sins/${view.id}/consume`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await response.json().catch(() => ({}))) as Partial<Absolution> & { error?: string };
    if (!response.ok || !body.serial || !body.receipt || !body.view) throw new Error(body.error || "The purge faltered.");
    return body as Absolution;
  }, [view.id]);

  const devour = useCallback(async () => {
    if (started.current || !source.current || !fireCanvas.current || !emberCanvas.current) return;
    started.current = true;
    const audio = ritualAudio();
    const jaw = gargoyle.current!;
    setPhase("devouring");
    stage.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setAnimate(true);
    setOffset({ x: 0, y: 0 });
    audio.growl(0.9, abyssal ? 0.5 : 1);
    await jaw.setJaw(1, reduced ? 120 : 260);
    audio.whoosh();
    burner.current = createBurner({ canvas: fireCanvas.current, overlay: emberCanvas.current, image: padded(source.current), bite: BITE, reducedMotion: reduced });
    setSwapped(true);
    await wait(reduced ? 60 : 200);
    audio.tear();
    audio.snap();
    void jaw.setJaw(0.42, 90);
    burner.current.bite(1);
    shake();
    let result: Absolution | null = null;
    const purge = (async function attempt(): Promise<Absolution> {
      try { return await consume(); }
      catch (caught) {
        setError(caught instanceof Error ? caught.message : "The purge faltered.");
        return new Promise<Absolution>(resolve => { retry.current = () => { setError(null); retry.current = null; resolve(attempt()); }; });
      }
    })();
    void purge.then(done => {
      result = done;
      done.receipt.steps.forEach((step, index) => setTimeout(() => setLog(previous => [...previous, step]), index * 340));
      burner.current?.confirm();
    });
    await wait(330);
    if (!reduced) {
      for (const strength of [1, 1.25]) {
        await jaw.setJaw(0.86, 170);
        audio.crunch();
        void jaw.setJaw(0.4, 100);
        burner.current.bite(strength);
        shake();
        await wait(300);
      }
    }
    setPhase("burning");
    setFire(1);
    audio.crackle(true, 0.85);
    void jaw.setJaw(0.62, 500);
    await burner.current.ignite(4600);
    audio.crackle(false);
    setFire(0.25);
    jaw.exhale();
    await jaw.setJaw(0.14, 700);
    await purge;
    await wait(500);
    audio.bell();
    setPhase("done");
    void forgetRelic(view.id);
    await wait(900);
    onAbsolved(result!);
  }, [abyssal, consume, onAbsolved, reduced, shake, view.id]);

  function begin() {
    wakeSound();
    void devour();
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (phase !== "ready") return;
    wakeSound();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    setAnimate(false);
    setHeld(true);
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const height = cardHeight();
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    const next = { x: REST.x + dx / height, y: REST.y + dy / height };
    setOffset(next);
    const closeness = 1 - Math.min(1, Math.hypot(next.x, next.y) / REST.y);
    void gargoyle.current?.setJaw(0.14 + closeness * 0.86, 70);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    setHeld(false);
    if (!current.moved || Math.hypot(offset.x, offset.y) < 0.55) { void devour(); return; }
    setAnimate(true);
    setOffset(REST);
    void gargoyle.current?.setJaw(0.14, 300);
  }

  const cardStyle = {
    ...place(CARD),
    transform: `translate(${offset.x * 100}%, ${offset.y * 100}%) rotate(${phase === "ready" && !held ? -3 : 0}deg) scale(${held ? 1.05 : 1})`,
    transition: animate ? "transform 260ms cubic-bezier(.3,.7,.3,1)" : "none",
    opacity: phase === "burning" || phase === "done" ? 0 : 1,
    visibility: swapped ? ("hidden" as const) : ("visible" as const),
    pointerEvents: phase === "ready" ? ("auto" as const) : ("none" as const)
  };

  return (
    <div className="consume-layout">
      <div ref={stage} className={`feed-stage ${shaking ? "shake" : ""}`}>
        <Gargoyle ref={gargoyle} variant={view.tier} fire={fire} open={0.14} hungry={phase === "ready"}
          above={<>
            <div className="burnbox" style={{ ...place(BOX), zIndex: 3 }}><canvas ref={emberCanvas} /></div>
            <div className={`relic-card draggable ${held ? "held" : ""}`} style={cardStyle} role="button" tabIndex={0} aria-label={`Thy confession. Drag it into ${abyssal ? "Malphas's" : "the Gargoyle's"} maw, or press Enter to feed it.`}
              onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
              onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && phase === "ready") { event.preventDefault(); begin(); } }}>
              <canvas ref={cardCanvas} />
            </div>
          </>}>
          <div className="burnbox" style={place(BOX)}><canvas ref={fireCanvas} /></div>
        </Gargoyle>
      </div>
      <div className="feed-panel" aria-live="polite">
        {phase === "loading" && !error && <p className="italic">The relic is brought to the altar…</p>}
        {phase === "ready" && (
          <>
            <h2 className="blackletter">{abyssal ? "Feed Malphas" : "Feed the Gargoyle"}</h2>
            <p>Drag thy confession into its maw — or, if thou art faint of heart:</p>
            <button type="button" className="plaque" onClick={begin}>☞ Cast it in</button>
          </>
        )}
        {(phase === "devouring" || phase === "burning") && <h2 className="blackletter">{phase === "devouring" ? "It feedeth" : "It burneth"}</h2>}
        {phase === "done" && <h2 className="blackletter rubric">Absolved</h2>}
        {error && (
          <p className="error" role="alert">{error} {retry.current && <button type="button" className="textlink" onClick={() => retry.current?.()}>Try the purge again</button>}</p>
        )}
        {log.length > 0 && (
          <ol className="scribe" aria-label="The scribe's record of the purge">
            {log.map(step => <li key={step.label}>{step.label}<span className="ms">{step.ms.toFixed(1)} ms</span></li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
