"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { features, gargoyle, VIEW, type Variant } from "@/lib/art/gargoyle-paths";

export interface GargoyleHandle {
  /** Tweens the jaw to `target` (0 shut, 1 agape) over `ms`; resolves when it lands. */
  setJaw(target: number, ms?: number): Promise<void>;
  exhale(): void;
  /** The maw in client pixels, for aiming whatever is fed to it. */
  mouthRect(): { x: number; y: number; width: number; height: number } | null;
  /** Grid units (400×460) to client pixels. */
  toClient(x: number, y: number): { x: number; y: number } | null;
}

interface Props {
  open?: number; fire?: number; track?: boolean; hungry?: boolean; children?: ReactNode; above?: ReactNode; className?: string;
  /** "recoil" snaps the wings over its eyes: the parish refuses to eat. */
  mood?: "calm" | "recoil";
  /** "abyssal" is Malphas: obsidian, six rubric eyes, double fangs. */
  variant?: Variant;
}

/** Gradient stops per variant. Rendered as style so a change of variant transitions in place. */
const STONE = {
  parish: {
    wing: ["#433b34", "#2a241f", "#171310"], horn: ["#3b342e", "#7a7064", "#c9bca6"], ear: ["#4d453e", "#221d19"],
    skin: ["#8f8478", "#5d554c", "#302a25", "#1a1612"], fire: ["#fff3c9", "#ffc35a", "#ff7a1a", "#7d1904", "#100302"], light: ["#ff9a3c", "#ff7a1a"],
    eye: ["#fffbe8", "#ffd27a", "#ff7a1a", "#7a1d06"], tooth: ["#f3e9d1", "#ad9a77"], jaw: ["#7a7064", "#4a423b", "#1e1a16"], brow: ["#5b5249", "#15120f"],
    snout: ["#7a7064", "#3a332d"], ledge: ["#4f473f", "#1f1a16"], bone: "#7a7064", beard: "#2f2924", tongue: "#4a100c", ember: "#ffb347"
  },
  abyssal: {
    wing: ["#2b2631", "#16131a", "#08070a"], horn: ["#141216", "#3a3540", "#9a8fa4"], ear: ["#2a2530", "#0b0a0d"],
    skin: ["#57505f", "#2c2832", "#141217", "#060507"], fire: ["#ffe0d6", "#ff5a3c", "#c41e12", "#4a0603", "#0a0101"], light: ["#ff3b2a", "#c41e12"],
    eye: ["#ffe6dc", "#ff6a4a", "#d0221a", "#4a0603"], tooth: ["#ece2cf", "#8f8270"], jaw: ["#3e3945", "#221f27", "#0b0a0d"], brow: ["#332e39", "#060507"],
    snout: ["#3e3945", "#1b1820"], ledge: ["#2c2832", "#0c0b0e"], bone: "#4a4452", beard: "#16131a", tongue: "#5a0d08", ember: "#ff4a32"
  }
} as const;
const stops = (colours: readonly string[], offsets: number[], opacities?: number[]) =>
  colours.map((colour, index) => <stop key={index} offset={offsets[index]} style={{ stopColor: colour, stopOpacity: opacities?.[index] ?? 1 }} />);

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const pairs = <T,>(items: T[]) => ({ left: items.filter((_, index) => index % 2 === 0), right: items.filter((_, index) => index % 2 === 1) });

export const Gargoyle = forwardRef<GargoyleHandle, Props>(function Gargoyle({ open: idle = 0.12, fire = 0, track = true, hungry = false, children, above, className, mood = "calm", variant = "parish" }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(idle);
  const openRef = useRef(idle);
  const tween = useRef(0);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [puffs, setPuffs] = useState<number[]>([]);
  const shape = useMemo(() => gargoyle(open), [open]);
  const { upperTeeth, eyes } = features(shape, variant);
  const stone = STONE[variant];
  const [transfiguring, setTransfiguring] = useState(false);
  const firstVariant = useRef(variant);
  useEffect(() => {
    if (variant === firstVariant.current) return;
    firstVariant.current = variant;
    setTransfiguring(true);
    const timer = setTimeout(() => setTransfiguring(false), 1200);
    return () => clearTimeout(timer);
  }, [variant]);

  useEffect(() => { if (!tween.current) { openRef.current = idle; setOpen(idle); } }, [idle]);

  useImperativeHandle(ref, () => ({
    setJaw(target, ms = 200) {
      cancelAnimationFrame(tween.current);
      const from = openRef.current, start = performance.now();
      return new Promise<void>(resolve => {
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / Math.max(1, ms));
          openRef.current = from + (target - from) * easeOut(t);
          setOpen(openRef.current);
          if (t < 1) tween.current = requestAnimationFrame(step);
          else { tween.current = 0; resolve(); }
        };
        tween.current = requestAnimationFrame(step);
      });
    },
    exhale() { setPuffs(previous => [...previous, Date.now()].slice(-3)); },
    mouthRect() {
      const rect = box.current?.getBoundingClientRect();
      if (!rect) return null;
      const scale = rect.width / VIEW.width;
      const mouth = gargoyle(openRef.current).mouth;
      return { x: rect.left + (mouth.x - mouth.width / 2) * scale, y: rect.top + (mouth.y - mouth.height / 2) * scale, width: mouth.width * scale, height: mouth.height * scale };
    },
    toClient(x, y) {
      const rect = box.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: rect.left + (x / VIEW.width) * rect.width, y: rect.top + (y / VIEW.height) * rect.height };
    }
  }), []);

  useEffect(() => {
    if (!track) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + (200 / VIEW.width) * rect.width, cy = rect.top + (193 / VIEW.height) * rect.height;
        const dx = event.clientX - cx, dy = event.clientY - cy, distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 260);
        setPupil({ x: (dx / distance) * 3.4 * reach, y: (dy / distance) * 1.8 * reach });
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, [track]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); schedule(); }, 2800 + Math.random() * 4600);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  const wings = pairs(shape.wings), bones = pairs(shape.wingBones);
  const glow = Math.max(fire, hungry ? 0.35 : 0);
  const wing = (side: "left" | "right") => (
    <>
      {wings[side].map(d => <g key={d}><path d={d} fill="url(#g-wing)" /><path d={d} fill="url(#p-hatch)" opacity="0.6" /><path d={d} fill="none" stroke="#0b0908" strokeWidth="2.4" strokeLinejoin="round" /></g>)}
      {bones[side].map((d, index) => <g key={d}>{index === 0 && <path d={d} fill="none" style={{ stroke: stone.bone }} strokeWidth="4.6" strokeLinecap="round" />}<path d={d} fill="none" stroke="#0b0908" strokeWidth="3" strokeLinecap="round" /></g>)}
    </>
  );
  const label = variant === "abyssal"
    ? "Malphas, an obsidian gargoyle with six red eyes and double fangs"
    : "A stone gargoyle with ember eyes, horns and bat wings, its jaws ready to eat sins";

  return (
    <div ref={box} className={`gargoyle ${variant} ${mood === "recoil" ? "recoil" : ""} ${transfiguring ? "transfigure" : ""} ${className ?? ""}`} role="img" aria-label={mood === "recoil" ? `${label}, hiding its eyes behind its wings` : label}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} aria-hidden="true">
        <defs>
          <linearGradient id="g-wing" x1="1" y1="1" x2="0" y2="0">{stops(stone.wing, [0, 0.6, 1])}</linearGradient>
          <linearGradient id="g-horn" x1="0.9" y1="1" x2="0.1" y2="0">{stops(stone.horn, [0, 0.55, 1])}</linearGradient>
          <linearGradient id="g-ear" x1="1" y1="0.6" x2="0" y2="0.3">{stops(stone.ear, [0, 1])}</linearGradient>
          <radialGradient id="g-skin" cx="0.42" cy="0.22" r="0.85">{stops(stone.skin, [0, 0.45, 0.8, 1])}</radialGradient>
          <radialGradient id="g-fire" cx="0.5" cy="0.62" r="0.62">{stops(stone.fire, [0, 0.22, 0.5, 0.8, 1])}</radialGradient>
          <radialGradient id="g-uplight" cx="0.5" cy="0.62" r="0.5">{stops([stone.light[0], stone.light[1], stone.light[1]], [0, 0.6, 1], [0.62, 0.16, 0])}</radialGradient>
          <radialGradient id="g-eye" cx="0.5" cy="0.5" r="0.5">{stops(stone.eye, [0, 0.35, 0.75, 1])}</radialGradient>
          <linearGradient id="g-tooth" x1="0" y1="0" x2="0" y2="1">{stops(stone.tooth, [0, 1])}</linearGradient>
          <linearGradient id="g-jaw" x1="0" y1="0" x2="0" y2="1">{stops(stone.jaw, [0, 0.55, 1])}</linearGradient>
          <linearGradient id="g-brow" x1="0" y1="0" x2="0" y2="1">{stops(stone.brow, [0, 1])}</linearGradient>
          <linearGradient id="g-snout" x1="0" y1="0" x2="0" y2="1">{stops(stone.snout, [0, 1])}</linearGradient>
          <linearGradient id="g-ledge" x1="0" y1="0" x2="0" y2="1">{stops(stone.ledge, [0, 1])}</linearGradient>
          <pattern id="p-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(42)"><line x1="0" y1="0" x2="0" y2="5" stroke="#0b0908" strokeWidth="1.3" strokeOpacity="0.55" /></pattern>
          <filter id="f-stone" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="noise" />
            <feColorMatrix in="noise" values="0 0 0 0 0.5  0 0 0 0 0.47  0 0 0 0 0.44  0 0 0 0.55 0" result="grain" />
            <feComposite in="grain" in2="SourceGraphic" operator="in" result="clipped" />
            <feBlend in="SourceGraphic" in2="clipped" mode="multiply" />
          </filter>
          <filter id="f-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="f-smoke" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>

        <g className="wing-l">{wing("left")}</g>
        <g className="wing-r">{wing("right")}</g>

        <g className="breathe">
          {shape.horns.map(d => <path key={d} d={d} fill="url(#g-horn)" stroke="#0b0908" strokeWidth="2.2" strokeLinejoin="round" />)}
          {shape.hornRings.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />)}
          {shape.ears.map(d => <path key={d} d={d} fill="url(#g-ear)" stroke="#0b0908" strokeWidth="2.2" strokeLinejoin="round" />)}
          {shape.earInner.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.6" strokeWidth="1.5" />)}
          <path d={shape.head} fill="url(#g-skin)" filter="url(#f-stone)" />
          {shape.cheekShadows.map(d => <g key={d}><path d={d} fill="#0a0807" opacity="0.42" /><path d={d} fill="url(#p-hatch)" /></g>)}
          <path d={shape.head} fill="url(#g-uplight)" style={{ opacity: glow, mixBlendMode: "screen", transition: "opacity 400ms" }} />
          <path d={shape.head} fill="none" stroke="#0b0908" strokeWidth="2.6" strokeLinejoin="round" />
          <path d={shape.maw} fill="#060302" />
          <path d={shape.maw} fill="url(#g-fire)" style={{ opacity: glow, transition: "opacity 400ms" }} />
          <path d={shape.tongue} style={{ fill: stone.tongue }} opacity={Math.min(1, open * 1.6)} />
          {hungry && fire === 0 && [0, 1, 2, 3, 4].map(index => (
            <circle key={index} cx={178 + index * 11} cy={shape.mouth.y} r={1.3} style={{ fill: stone.ember }} filter="url(#f-glow)">
              <animate attributeName="cy" values={`${shape.mouth.y};${shape.mouth.y - 70}`} dur={`${2.4 + index * 0.37}s`} repeatCount="indefinite" begin={`${index * 0.5}s`} />
              <animate attributeName="opacity" values="0;1;0" dur={`${2.4 + index * 0.37}s`} repeatCount="indefinite" begin={`${index * 0.5}s`} />
            </circle>
          ))}
          <path d={shape.jaw} fill="url(#g-jaw)" filter="url(#f-stone)" />
          <path d={shape.jawShadow} fill="#080605" opacity="0.5" />
          <path d={shape.jaw} fill="url(#p-hatch)" opacity="0.35" />
          <path d={shape.jaw} fill="url(#g-uplight)" style={{ opacity: glow * 0.8, mixBlendMode: "screen" }} />
          <path d={shape.jaw} fill="none" stroke="#0b0908" strokeWidth="2.6" strokeLinejoin="round" />
          {shape.jawLines.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />)}
          {shape.lowerTeeth.map(d => <path key={d} d={d} fill="url(#g-tooth)" stroke="#1b1410" strokeWidth="1.1" />)}
          {shape.tusks.map(d => <path key={d} d={d} fill="url(#g-tooth)" stroke="#1b1410" strokeWidth="1.6" />)}
          {shape.beard.map(d => <path key={d} d={d} style={{ fill: stone.beard }} stroke="#0b0908" strokeWidth="1.6" />)}
        </g>
        <path d={shape.ledge} fill="url(#g-ledge)" filter="url(#f-stone)" />
        <path d="M 0 430.6 L 400 430.6" stroke="#8f857a" strokeOpacity="0.35" strokeWidth="1.2" />
        {shape.ledgeCracks.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeWidth="1.6" />)}
        {shape.hands.map(d => <path key={d} d={d} fill="url(#g-jaw)" stroke="#0b0908" strokeWidth="2.2" strokeLinejoin="round" />)}
        {shape.knuckles.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.6" strokeWidth="1.4" />)}
        {shape.claws.map(d => <path key={d} d={d} fill="url(#g-tooth)" stroke="#0b0908" strokeWidth="1.4" />)}
      </svg>

      <div className="jaws">{children}</div>

      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} aria-hidden="true">
        <g className="breathe">
          {upperTeeth.map(d => <path key={d} d={d} fill="url(#g-tooth)" stroke="#1b1410" strokeWidth="1.2" strokeLinejoin="round" />)}
          <path d={shape.brow} fill="url(#g-brow)" />
          <path d={shape.brow} fill="url(#p-hatch)" opacity="0.5" />
          <path d={shape.brow} fill="none" stroke="#0b0908" strokeWidth="2.4" strokeLinejoin="round" />
          {shape.furrows.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />)}
          {shape.sockets.map(d => <path key={d} d={d} fill="#030202" />)}
          {eyes.slice(2).map(eye => <ellipse key={`socket-${eye.cx}`} cx={eye.cx} cy={eye.cy} rx={eye.rx + 3.5} ry={eye.ry + 3} transform={`rotate(${(eye.tilt * 180) / Math.PI} ${eye.cx} ${eye.cy})`} fill="#030202" />)}
          {eyes.map(eye => (
            <g key={eye.cx} transform={`translate(${eye.cx} ${eye.cy}) rotate(${(eye.tilt * 180) / Math.PI}) scale(1 ${blink || mood === "recoil" ? 0.12 : 1})`} style={{ transition: "transform 90ms" }}>
              <ellipse className="eye-glow" rx={eye.rx} ry={eye.ry} fill="url(#g-eye)" filter="url(#f-glow)" />
              <ellipse cx={pupil.x} cy={pupil.y * 0.6} rx={eye.pupil} ry={eye.ry * 0.92} fill="#120400" />
            </g>
          ))}
          <path d={shape.snout} fill="url(#g-snout)" filter="url(#f-stone)" />
          <path d={shape.snout} fill="url(#g-uplight)" style={{ opacity: glow * 0.7, mixBlendMode: "screen" }} />
          <path d={shape.snout} fill="none" stroke="#0b0908" strokeWidth="2" strokeLinejoin="round" />
          {shape.snarl.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.65" strokeWidth="1.4" strokeLinecap="round" />)}
          {shape.nostrils.map(d => <path key={d} d={d} fill="#050302" />)}
          {shape.folds.map(d => <path key={d} d={d} fill="none" stroke="#0b0908" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />)}
          {puffs.map(id => (
            <g key={id} filter="url(#f-smoke)">
              {[-14, 0, 14].map(dx => (
                <circle key={dx} cx={200 + dx} cy={250} r={10} fill="#8f857a" opacity="0">
                  <animate attributeName="cy" from="250" to="120" dur="2.4s" fill="freeze" />
                  <animate attributeName="r" from="8" to="34" dur="2.4s" fill="freeze" />
                  <animate attributeName="opacity" values="0;0.55;0" dur="2.4s" fill="freeze" />
                  <animate attributeName="cx" from={200 + dx} to={200 + dx * 3.4} dur="2.4s" fill="freeze" />
                </circle>
              ))}
            </g>
          ))}
        </g>
        {mood === "recoil" && (
          <g className="shield">
            {(["left", "right"] as const).map(side => {
              const folded = pairs(shape.shield)[side], fingers = pairs(shape.shieldBones)[side], thumb = pairs(shape.shieldThumbs)[side];
              return (
                <g key={side} className={`shield-${side === "left" ? "l" : "r"}`}>
                  {folded.map(d => <g key={d}><path d={d} fill="url(#g-wing)" /><path d={d} fill="url(#p-hatch)" opacity="0.5" /><path d={d} fill="none" stroke="#0b0908" strokeWidth="2.4" strokeLinejoin="round" /></g>)}
                  {fingers.map((d, index) => <g key={d}>{index === 0 && <path d={d} fill="none" style={{ stroke: stone.bone }} strokeWidth="5" strokeLinecap="round" />}<path d={d} fill="none" stroke="#0b0908" strokeWidth={index === 0 ? 3.2 : 2.4} strokeLinecap="round" /></g>)}
                  {thumb.map(d => <path key={d} d={d} fill="url(#g-tooth)" stroke="#0b0908" strokeWidth="1.4" />)}
                </g>
              );
            })}
          </g>
        )}
      </svg>
      {above && <div className="jaws above">{above}</div>}
    </div>
  );
});
