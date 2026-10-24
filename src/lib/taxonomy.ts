export const CARDINALS = ["gula", "acedia", "luxuria", "superbia", "avaritia", "invidia", "ira"] as const;
export type Cardinal = (typeof CARDINALS)[number];

export const CARDINAL: Record<Cardinal, { latin: string; english: string }> = {
  gula: { latin: "Gula", english: "Gluttony" },
  acedia: { latin: "Acedia", english: "Sloth" },
  luxuria: { latin: "Luxuria", english: "Lust" },
  superbia: { latin: "Superbia", english: "Pride" },
  avaritia: { latin: "Avaritia", english: "Greed" },
  invidia: { latin: "Invidia", english: "Envy" },
  ira: { latin: "Ira", english: "Wrath" }
};

export interface Order {
  id: string;
  /** Null for the miscellany, which may sit under any capital sin. */
  cardinal: Cardinal | null;
  latin: string;
  epithet: string;
  covers: string;
}

export const ORDERS = [
  { id: "gula_deliverandi", cardinal: "gula", latin: "Gula Deliverandi", epithet: "The Delivery-Fee Pilgrimage", covers: "delivery apps, fees larger than the meal, one item delivered at ruinous cost" },
  { id: "gula_nocturna", cardinal: "gula", latin: "Gula Nocturna", epithet: "The Midnight Feast", covers: "late-night snacking, drive-thrus after midnight, 2 AM fridge raids" },
  { id: "gula_liquida", cardinal: "gula", latin: "Gula Liquida", epithet: "The Tithe to the Barista", covers: "coffee, boba, energy drinks, bar tabs, daily beverage spending" },
  { id: "acedia_scrollandi", cardinal: "acedia", latin: "Acedia Scrollandi", epithet: "The Endless Scroll", covers: "screen-time reports, doomscrolling, hours of short videos" },
  { id: "acedia_responsionis", cardinal: "acedia", latin: "Acedia Responsionis", epithet: "The Unanswered Thousand", covers: "unread email counts, ignored messages, left on read, notification badges" },
  { id: "acedia_procrastinationis", cardinal: "acedia", latin: "Acedia Procrastinationis", epithet: "The Deferred Labour", covers: "missed deadlines, dozens of open tabs, overdue tasks, snoozed alarms" },
  { id: "acedia_lecti", cardinal: "acedia", latin: "Acedia Lecti", epithet: "The Rotting Couch", covers: "bed-rotting, binge-watching, 'are you still watching?'" },
  { id: "luxuria_nocturna_textualis", cardinal: "luxuria", latin: "Luxuria Nocturna Textualis", epithet: "The 2 AM Missive", covers: "late-night 'u up?' texts, drunk texts, regrettable direct messages" },
  { id: "luxuria_exis", cardinal: "luxuria", latin: "Luxuria Exis", epithet: "The Return to the Former Flame", covers: "texting an ex, liking an ex's old photos, attempts at rekindling" },
  { id: "luxuria_digitorum", cardinal: "luxuria", latin: "Luxuria Digitorum", epithet: "The Ten Thousand Swipes", covers: "dating-app swipe marathons, match counts, unanswered openers" },
  { id: "superbia_speculi", cardinal: "superbia", latin: "Superbia Speculi", epithet: "The Two Hundred Selfies", covers: "selfie volume, filters, retakes, a camera roll of one's own face" },
  { id: "vanagloria_linkedinensis", cardinal: "superbia", latin: "Vanagloria Linkedinensis", epithet: "The Thrilled Announcement", covers: "humblebrags, 'thrilled to announce', engagement-bait posts" },
  { id: "superbia_disputationis", cardinal: "superbia", latin: "Superbia Disputationis", epithet: "The Unyielding 'Well, Actually'", covers: "arguing to win online, being confidently wrong at length" },
  { id: "avaritia_subscriptionum", cardinal: "avaritia", latin: "Avaritia Subscriptionum", epithet: "The Forgotten Tithes", covers: "unused subscriptions, auto-renewals, free trials never cancelled" },
  { id: "avaritia_impulsus", cardinal: "avaritia", latin: "Avaritia Impulsus", epithet: "The 3 AM Cart", covers: "impulse purchases, overflowing carts, flash sales, buying at odd hours" },
  { id: "avaritia_aleae", cardinal: "avaritia", latin: "Avaritia Aleae", epithet: "The Meme-Coin Wager", covers: "crypto losses, sports bets, gacha spending, lottery tickets" },
  { id: "invidia_instagrammatica", cardinal: "invidia", latin: "Invidia Instagrammatica", epithet: "The Deep Scroll", covers: "stalking profiles, deep-liking old photos, comparing oneself to influencers" },
  { id: "invidia_vicinorum", cardinal: "invidia", latin: "Invidia Vicinorum", epithet: "The Neighbour's Feast", covers: "comparing salaries, houses, holidays and friends' milestones" },
  { id: "ira_epistolaris", cardinal: "ira", latin: "Ira Epistolaris", epithet: "Per My Last Email", covers: "passive-aggressive email, reply-all fury, curt messages" },
  { id: "ira_commentorum", cardinal: "ira", latin: "Ira Commentorum", epithet: "The Comment-Section Crusade", covers: "online arguments, all-caps replies, one-star review rampages" },
  { id: "ira_ludorum", cardinal: "ira", latin: "Ira Ludorum", epithet: "The Rage-Quit", covers: "gaming tilt, trash talk, defeats that end in thrown controllers" },
  { id: "acedia_confessionis_vacuae", cardinal: "acedia", latin: "Acedia Confessionis Vacuae", epithet: "The Empty Confession", covers: "a confession with no discernible sin; wasting the Inquisitor's time" },
  { id: "peccatum_veniale_miscellaneum", cardinal: null, latin: "Peccatum Veniale Miscellaneum", epithet: "The Uncatalogued Trespass", covers: "any petty modern sin the other orders do not fit" },
  { id: "casus_reservatus", cardinal: null, latin: "Casus Reservatus", epithet: "The Reserved Sin", covers: "a transgression too foul for the parish, reserved to the Arch-Prelate of the Abyss" }
] as const satisfies readonly Order[];

/** Heard only by Malphas; the parish Inquisitor's table leaves it out. */
export const RESERVED_ORDER = "casus_reservatus";

export type OrderId = (typeof ORDERS)[number]["id"];
export const ORDER_IDS = ORDERS.map(order => order.id) as [OrderId, ...OrderId[]];
export function order(id: string): Order {
  const found = ORDERS.find(item => item.id === id);
  if (!found) throw new Error(`Unknown order ${id}.`);
  return found;
}
export function isCardinal(value: string): value is Cardinal { return (CARDINALS as readonly string[]).includes(value); }

/** Seven classes of severity, printed as "Class IV". */
export const CLASSES = ["Peccadillo", "Venial Trifle", "Grievous Folly", "Grave Indulgence", "Wanton Excess", "Mortal Disgrace", "Abomination"] as const;
export type Gravity = "venial" | "grievous" | "mortal";
export function clampSeverity(value: number) { return Math.min(7, Math.max(1, Math.round(Number.isFinite(value) ? value : 3))); }
export function gravity(severity: number): Gravity { const s = clampSeverity(severity); return s <= 2 ? "venial" : s <= 5 ? "grievous" : "mortal"; }
export function className(severity: number) { const s = clampSeverity(severity); return `Class ${roman(s)}`; }

export function roman(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 4000) throw new Error("Roman numerals cover 1–3999.");
  const table: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = value, out = "";
  for (const [amount, glyph] of table) while (rest >= amount) { out += glyph; rest -= amount; }
  return out;
}

export interface Remission { plenary: boolean; years: number; quarantines: number; days: number; text: string; short: string }

/**
 * Historical indulgences were denominated in days, years and "quarantines" (forty-day fasts),
 * e.g. "seven years and seven quarantines". The seal adds a deterministic flourish.
 */
export function remission(severity: number, seal: string): Remission {
  const s = clampSeverity(severity);
  const n = parseInt(seal.slice(0, 8), 16) || 0;
  if (s === 7) return { plenary: true, years: 0, quarantines: 0, days: 0, text: "A Plenary Indulgence", short: "PLENARY" };
  const plans: Record<number, [number, number, number]> = {
    1: [0, 0, 40],
    2: [0, 0, 100 + (n % 3) * 40],
    3: [0, 3 + (n % 5), 0],
    4: [1 + (n % 3), n % 4, 0],
    5: [3 + (n % 4), 1 + (n % 7), 0],
    6: [7, 7, 0]
  };
  const [years, quarantines, days] = plans[s];
  const parts = [
    years ? `${roman(years)} year${years === 1 ? "" : "s"}` : "",
    quarantines ? `${roman(quarantines)} quarantine${quarantines === 1 ? "" : "s"}` : "",
    days ? `${roman(days)} days` : ""
  ].filter(Boolean);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}` : parts[0];
  const short = [years ? `${roman(years)} YRS` : "", quarantines ? `${roman(quarantines)} QUAR` : "", days ? `${roman(days)} DAYS` : ""].filter(Boolean).join(" · ");
  return { plenary: false, years, quarantines, days, text: `Remission of ${text}`, short };
}

const MONTHS = ["Ianuarii", "Februarii", "Martii", "Aprilis", "Maii", "Iunii", "Iulii", "Augusti", "Septembris", "Octobris", "Novembris", "Decembris"];
export function latinDate(at: number | Date) {
  const date = new Date(at);
  return `die ${roman(date.getUTCDate())} mensis ${MONTHS[date.getUTCMonth()]}, anno Domini ${roman(date.getUTCFullYear())}`;
}

/** The table an Inquisitor classifies against. Stable text so the system prompt caches. */
export function taxonomyTable({ reserved = false } = {}) {
  const lines: string[] = [];
  for (const cardinal of CARDINALS) {
    lines.push(`${CARDINAL[cardinal].latin} (${CARDINAL[cardinal].english}) — cardinal "${cardinal}":`);
    for (const item of ORDERS.filter(entry => entry.cardinal === cardinal)) lines.push(`  - order "${item.id}": ${item.latin}, "${item.epithet}" — ${item.covers}`);
  }
  for (const misc of ORDERS.filter(entry => entry.cardinal === null && (reserved || entry.id !== RESERVED_ORDER))) {
    lines.push(`Any cardinal — order "${misc.id}": ${misc.latin}, "${misc.epithet}" — ${misc.covers}`);
  }
  lines.push("Severity classes: " + CLASSES.map((name, index) => `${index + 1} = Class ${roman(index + 1)} (${name})`).join("; ") + ".");
  return lines.join("\n");
}
