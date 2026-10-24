/**
 * The Gargoyle, drawn once as path data on a 400×460 grid and shared by the on-screen SVG
 * and the woodcut card (via Path2D). Symmetric parts are authored as a left half and mirrored.
 */
export const VIEW = { width: 400, height: 460 } as const;

type Point = [number, number];
type Segment = [Point, Point, Point];
const fmt = ([x, y]: Point) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
const mirrorPoint = ([x, y]: Point): Point => [VIEW.width - x, y];

/** A closed symmetric outline from a left half running from the top centre to the bottom centre. */
function symmetric(start: Point, segments: Segment[]) {
  const ends = [start, ...segments.map(segment => segment[2])];
  let d = `M ${fmt(start)}`;
  for (const [c1, c2, end] of segments) d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(end)}`;
  for (let index = segments.length - 1; index >= 0; index--) {
    const [c1, c2] = segments[index];
    d += ` C ${fmt(mirrorPoint(c2))} ${fmt(mirrorPoint(c1))} ${fmt(mirrorPoint(ends[index]))}`;
  }
  return `${d} Z`;
}

const PAIR = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
/** Mirrors an absolute M/L/C/Q/Z path across the vertical centre line. */
export function mirror(d: string) {
  return d.replace(PAIR, (_, x: string, y: string) => `${+(VIEW.width - Number(x)).toFixed(2)} ${y}`);
}
const pair = (d: string) => [d, mirror(d)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Eye { cx: number; cy: number; rx: number; ry: number; tilt: number; pupil: number }

export interface GargoyleShape {
  wings: string[];
  wingBones: string[];
  /** The recoil: each wing folded across its side of the face, wrist up by the ear, fingers over the eyes. */
  shield: string[];
  shieldBones: string[];
  shieldThumbs: string[];
  horns: string[];
  hornRings: string[];
  ears: string[];
  earInner: string[];
  head: string;
  cheekShadows: string[];
  brow: string;
  furrows: string[];
  sockets: string[];
  eyes: Eye[];
  /** Malphas's four further eyes: a pair on the forehead and a pair on the cheeks. */
  abyssalEyes: Eye[];
  snout: string;
  snarl: string[];
  nostrils: string[];
  folds: string[];
  maw: string;
  tongue: string;
  upperTeeth: string[];
  /** Malphas's second pair of long fangs, in place of the teeth beside the canines. */
  fangs: string[];
  jaw: string;
  jawShadow: string;
  jawLines: string[];
  lowerTeeth: string[];
  tusks: string[];
  beard: string[];
  hands: string[];
  claws: string[];
  knuckles: string[];
  ledge: string;
  ledgeCracks: string[];
  /** Where the bite lands, in grid units, for aiming the confession. */
  mouth: { x: number; y: number; width: number; height: number };
  jawDrop: number;
}

/** `open` runs from 0 (shut) to 1 (agape); the lower jaw drops and the maw stretches with it. */
export function gargoyle(open = 0): GargoyleShape {
  const o = Math.max(0, Math.min(1, open));
  const drop = o * 58;
  const shift = (d: string) => (drop ? d.replace(PAIR, (_, x: string, y: string) => `${x} ${+(Number(y) + drop).toFixed(2)}`) : d);

  const head = symmetric([200, 106], [
    [[172, 104], [146, 110], [130, 122]],
    [[120, 130], [112, 139], [107, 150]],
    [[99, 168], [89, 186], [82, 205]],
    [[89, 223], [103, 238], [111, 252]],
    [[115, 263], [117, 273], [121, 283]],
    [[146, 290], [176, 286], [200, 281]]
  ]);
  const brow = symmetric([200, 188], [
    [[186, 177], [166, 160], [147, 153]],
    [[130, 148], [111, 150], [97, 163]],
    [[109, 171], [126, 174], [141, 176]],
    [[162, 180], [184, 194], [200, 203]]
  ]);
  const snout = symmetric([200, 200], [
    [[195, 212], [191, 226], [187, 239]],
    [[178, 242], [168, 247], [166, 256]],
    [[170, 261], [181, 261], [189, 257]],
    [[194, 261], [198, 265], [200, 267]]
  ]);
  const mawBottom = 300 + drop * 1.02;
  const maw = symmetric([200, 279], [
    [[174, 284], [146, 287], [121, 283]],
    [[118, lerp(298, 330, o)], [150, mawBottom + 4], [200, mawBottom + 8]]
  ]);
  const jaw = shift(symmetric([200, 300], [
    [[176, 300], [148, 298], [125, 292]],
    [[123, 304], [124, 324], [128, 346]],
    [[136, 358], [152, 371], [170, 380]],
    [[182, 386], [192, 387], [200, 384]]
  ]));
  const jawShadow = shift(symmetric([200, 358], [
    [[184, 358], [164, 352], [150, 344]],
    [[156, 358], [166, 370], [180, 380]],
    [[189, 384], [195, 385], [200, 384]]
  ]));

  return {
    wings: pair("M 152 246 C 126 168 78 84 2 26 C 13 66 13 104 3 142 C 25 134 45 142 53 162 C 63 146 85 148 95 168 C 105 156 121 160 129 178 C 137 172 147 182 149 198 Z"),
    shield: pair("M 84 250 C 78 205 82 160 96 128 L 208 150 Q 185 164 206 196 Q 178 197 190 232 Q 159 219 160 252 Q 117 226 84 250 Z"),
    shieldBones: ["M 84 250 C 78 205 82 160 96 128", "M 96 128 Q 152 132 208 150", "M 96 128 Q 150 158 206 196", "M 96 128 Q 138 178 190 232", "M 96 128 Q 118 198 160 252"].flatMap(pair),
    shieldThumbs: pair("M 94 130 C 88 120 90 110 98 102 C 98 112 101 121 104 128 Z"),
    wingBones: ["M 146 208 C 118 148 70 76 4 28", "M 146 210 C 104 182 54 152 4 141", "M 146 212 C 116 196 82 176 53 161", "M 146 214 C 126 200 108 184 95 167", "M 147 216 C 140 204 134 190 129 177"].flatMap(pair),
    horns: pair("M 175 111 C 151 93 120 84 101 64 C 90 52 88 36 96 15 C 76 30 71 54 81 75 C 95 101 124 117 150 128 Z"),
    hornRings: ["M 160 101 C 154 108 150 116 148 124", "M 141 92 C 134 100 129 109 127 116", "M 122 82 C 115 89 110 97 108 104", "M 105 70 C 98 75 92 82 89 89", "M 96 54 C 89 56 84 61 81 66", "M 93 37 C 87 38 82 41 79 45"].flatMap(pair),
    ears: pair("M 110 152 C 86 141 56 129 20 124 C 42 141 66 163 98 192 Z"),
    earInner: pair("M 104 160 C 84 153 62 145 40 139 C 59 153 77 168 97 183"),
    head,
    cheekShadows: [
      ...pair("M 82 205 C 89 223 103 238 111 252 C 115 263 117 273 121 283 C 128 270 130 254 126 236 C 120 222 104 210 82 205 Z"),
      "M 150 255 C 166 268 184 274 200 274 C 216 274 234 268 250 255 C 238 276 220 286 200 286 C 180 286 162 276 150 255 Z"
    ],
    brow,
    furrows: ["M 156 126 C 172 118 188 118 200 122", "M 166 139 C 180 133 192 133 200 136", "M 174 152 C 185 148 194 148 200 150"].flatMap(pair),
    sockets: pair("M 148 179 C 131 179 119 187 117 198 C 128 208 150 210 166 202 C 177 195 173 183 161 179 C 156 178 152 178 148 179 Z"),
    eyes: [
      { cx: 145, cy: 193, rx: 13, ry: 7, tilt: 0.28, pupil: 2.4 },
      { cx: VIEW.width - 145, cy: 193, rx: 13, ry: 7, tilt: -0.28, pupil: 2.4 }
    ],
    abyssalEyes: [
      { cx: 177, cy: 141, rx: 7.5, ry: 3.6, tilt: 0.2, pupil: 1.5 },
      { cx: VIEW.width - 177, cy: 141, rx: 7.5, ry: 3.6, tilt: -0.2, pupil: 1.5 },
      { cx: 121, cy: 222, rx: 8, ry: 3.8, tilt: 0.5, pupil: 1.6 },
      { cx: VIEW.width - 121, cy: 222, rx: 8, ry: 3.8, tilt: -0.5, pupil: 1.6 }
    ],
    snout,
    snarl: ["M 188 214 C 194 211 206 211 212 214", "M 186 223 C 193 219 207 219 214 223", "M 186 232 C 193 229 207 229 214 232"],
    nostrils: pair("M 188 247 C 181 246 173 250 172 257 C 178 256 184 253 189 251 Z"),
    folds: ["M 158 242 C 145 255 135 270 129 284", "M 91 202 C 106 207 120 215 131 227", "M 106 166 C 112 176 116 186 118 196"].flatMap(pair),
    maw,
    tongue: shift("M 166 300 C 176 290 224 290 234 300 C 230 316 214 324 200 324 C 186 324 170 316 166 300 Z"),
    upperTeeth: [
      "M 131 286 C 135 305 140 321 146 341 C 150 321 154 305 157 288 Z",
      "M 160 287 C 162 294 164 300 166 305 C 168 300 170 294 172 287 Z",
      "M 175 285 C 177 291 179 297 181 301 C 183 297 185 291 187 285 Z",
      "M 189 283 C 191 289 193 294 195 298 C 197 294 198 289 199 283 Z"
    ].flatMap(pair),
    fangs: pair("M 159 287 C 162 305 165 320 168 335 C 171 320 174 305 177 287 Z"),
    jaw,
    jawShadow,
    jawLines: ["M 131 300 C 136 320 144 338 157 352", "M 172 372 C 182 377 192 378 200 376", "M 140 296 C 160 304 182 306 200 306"].flatMap(d => pair(shift(d))),
    lowerTeeth: [
      "M 150 301 C 152 295 154 290 156 286 C 158 290 160 295 162 301 Z",
      "M 166 302 C 168 297 170 292 172 289 C 174 292 176 297 178 302 Z",
      "M 182 302 C 184 298 186 294 188 291 C 190 294 192 298 193 302 Z"
    ].flatMap(d => pair(shift(d))),
    tusks: pair(shift("M 127 296 C 123 276 117 256 104 239 C 123 247 138 268 142 294 Z")),
    beard: ["M 170 378 C 172 389 174 399 176 409 C 180 398 183 389 186 383 Z", "M 152 366 C 153 375 154 383 153 391 C 158 383 163 376 167 372 Z"]
      .flatMap(d => pair(shift(d))).concat(shift("M 191 384 C 195 398 198 410 200 424 C 202 410 205 398 209 384 Z")),
    hands: pair("M 66 428 C 64 410 76 398 94 397 C 114 396 132 404 138 420 C 140 428 134 432 124 432 L 72 432 C 68 432 66 431 66 428 Z"),
    claws: ["M 72 430 C 69 438 67 446 69 456 C 74 448 78 440 80 432 Z", "M 88 431 C 86 440 85 448 87 458 C 92 449 95 441 96 432 Z", "M 105 431 C 104 440 104 448 106 458 C 110 449 112 441 113 432 Z", "M 122 430 C 122 439 123 446 126 454 C 129 446 130 438 130 430 Z"].flatMap(pair),
    knuckles: ["M 80 418 C 82 412 86 410 90 412", "M 96 416 C 98 410 103 408 107 410", "M 112 416 C 114 410 119 409 123 412"].flatMap(pair),
    ledge: "M 0 430 L 400 430 L 400 460 L 0 460 Z",
    ledgeCracks: ["M 34 430 L 46 446 L 40 460", "M 200 430 L 194 444", "M 300 430 L 310 448 L 304 460", "M 376 430 L 368 440"],
    mouth: { x: 200, y: 292 + drop / 2, width: 150, height: 22 + drop },
    jawDrop: drop
  };
}

export type Variant = "parish" | "abyssal";

/** The teeth and eyes a variant shows: Malphas trades the inner teeth for fangs and opens four more eyes. */
export function features(shape: GargoyleShape, variant: Variant = "parish") {
  if (variant === "parish") return { upperTeeth: shape.upperTeeth, eyes: shape.eyes };
  return { upperTeeth: [...shape.upperTeeth.filter((_, index) => index !== 2 && index !== 3), ...shape.fangs], eyes: [...shape.eyes, ...shape.abyssalEyes] };
}
