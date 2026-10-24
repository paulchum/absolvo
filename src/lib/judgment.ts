import * as z from "zod";
import { CARDINALS, ORDER_IDS, clampSeverity, order, type Cardinal, type OrderId } from "./taxonomy";

export const VERDICTS = ["judged", "no_sin_found"] as const;
export const EVIDENCE_KINDS = ["time", "money", "battery", "screen_time", "text", "app", "count", "other"] as const;
export type VerdictKind = (typeof VERDICTS)[number];

/** What the Inquisitor returns. Length limits live in the prompt and in finalizeJudgment, not the schema. */
export const JudgmentSchema = z.object({
  verdict: z.enum(VERDICTS).describe("judged for a sin; no_sin_found when nothing sinful is visible"),
  title: z.string().describe("The sin's title, 3 to 8 words, e.g. 'The Fifty-Five Dollar Burrito'"),
  evidence: z.array(z.object({
    kind: z.enum(EVIDENCE_KINDS),
    value: z.string().describe("The exact detail as it appears, e.g. '2:13 AM', '$55.12', '4%'"),
    detail: z.string().describe("Where it appears and why it damns the penitent, one short sentence")
  })).describe("1 to 6 exact details read from the confession"),
  sin: z.object({
    cardinal: z.enum(CARDINALS),
    order: z.enum(ORDER_IDS),
    severity: z.number().int().describe("1 to 7")
  }),
  wall_label: z.string().describe("At most 5 words for the public wall. Foods, brands and apps are fine; never people, handles, quotes or places"),
  roast: z.string().describe("80 to 140 words of early-modern English"),
  penance: z.string().describe("One sentence"),
  epitaph: z.string().describe("At most 12 words for the certificate")
});
export type Judgment = z.infer<typeof JudgmentSchema>;
export interface Evidence { kind: (typeof EVIDENCE_KINDS)[number]; value: string; detail: string }

export interface Verdict {
  verdict: VerdictKind;
  title: string;
  evidence: Evidence[];
  sin: { cardinal: Cardinal; order: OrderId; severity: number };
  wallLabel: string;
  roast: string;
  penance: string;
  epitaph: string;
  servedBy: string;
}

/** Keeps the characters the card's typefaces carry: Latin-1, Latin Extended-A and common punctuation. */
export function printable(text: string) {
  return text.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^ -~ -ſ‐-‧‰-›€™☞]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const HANDLE_RE = /(^|[\s(])@[\w.]{2,}/g;

/** Strikes out links, addresses, phone and long identifier numbers, and @handles. */
export function scrub(text: string) {
  return text
    .replace(URL_RE, "[struck out]")
    .replace(EMAIL_RE, "[struck out]")
    .replace(PHONE_RE, match => (match.replace(/\D/g, "").length >= 9 ? "[struck out]" : match))
    .replace(HANDLE_RE, "$1thy correspondent");
}

export function limitWords(text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  const cut = words.slice(0, max).join(" ");
  const sentence = cut.match(/^(.*[.!?])\s/);
  return sentence && sentence[1].split(/\s+/).length >= max * 0.6 ? sentence[1] : `${cut.replace(/[,;:]$/, "")}…`;
}
export function limitChars(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.5 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:\s]+$/, "")}…`;
}
/** Straight quotes become a typesetter's curly ones. */
export function smartQuotes(text: string) {
  return text
    .replace(/(^|[\s(\[—–-])"/g, "$1\u201c").replace(/"/g, "\u201d")
    .replace(/(^|[\s(\[—–-])'/g, "$1\u2018").replace(/'/g, "\u2019");
}
const clean = (text: string) => smartQuotes(printable(scrub(text)));

/** A public wall label must be short, abstract and share nothing with what the penitent's messages said. */
export function filterWallLabel(raw: string, evidence: Evidence[], fallback: string) {
  const label = printable(raw).replace(/["“”«»]/g, "").replace(/[.!]+$/, "").trim();
  const words = label.split(/\s+/).filter(Boolean);
  if (!label || words.length > 5 || label.length > 40) return fallback;
  if (/[@#]|https?:|www\.|\.(com|net|org|io|app)\b|\[struck out\]/i.test(label)) return fallback;
  if (/\d{3,}/.test(label.replace(/\$\d+(?:\.\d{1,2})?/g, ""))) return fallback;
  const spoken = evidence.filter(item => item.kind === "text").map(item => ` ${item.value} ${item.detail} `.toLowerCase());
  const lower = words.map(word => word.toLowerCase().replace(/[^\p{L}\p{N}$']/gu, ""));
  for (let index = 0; index + 1 < lower.length; index++) {
    if (spoken.some(text => text.includes(` ${lower[index]} ${lower[index + 1]}`))) return fallback;
  }
  for (const [index, word] of words.entries()) {
    if (index > 0 && /^\p{Lu}/u.test(word) && spoken.some(text => new RegExp(`[^\\p{L}]${lower[index]}[^\\p{L}]`, "u").test(text))) return fallback;
  }
  return label;
}

export function finalizeJudgment(raw: Judgment, servedBy: string): Verdict {
  const empty = raw.verdict === "no_sin_found";
  const chosen = order(empty ? "acedia_confessionis_vacuae" : raw.sin.order);
  const cardinal: Cardinal = chosen.cardinal ?? raw.sin.cardinal;
  const severity = empty ? Math.min(2, clampSeverity(raw.sin.severity)) : clampSeverity(raw.sin.severity);
  const evidence: Evidence[] = raw.evidence.slice(0, 6).map(item => ({
    kind: item.kind,
    value: limitChars(clean(item.value), 60),
    detail: limitChars(clean(item.detail), 160)
  })).filter(item => item.value);
  return {
    verdict: raw.verdict,
    title: limitChars(clean(raw.title), 60) || chosen.epithet,
    evidence,
    sin: { cardinal, order: chosen.id as OrderId, severity },
    wallLabel: filterWallLabel(raw.wall_label, raw.evidence, chosen.epithet),
    penance: limitWords(clean(raw.penance), 40),
    epitaph: limitWords(clean(raw.epitaph), 12),
    roast: limitWords(clean(raw.roast), 160),
    servedBy
  };
}

/** Raw quotations are burned with the confession; the verdict printed on the certificate stays. */
export function withoutEvidence(verdict: Verdict): Verdict { return { ...verdict, evidence: [] }; }
