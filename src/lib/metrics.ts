import { db, utcDay } from "./db";
import { price, type Tier } from "./env";

/**
 * The click-to-buy funnel, as cohorts by the day of confession: a sin confessed on Monday and
 * paid for on Tuesday counts on Monday. Sins are never deleted, so expired ones still count.
 */
export interface TierFunnel {
  /** Parish: a verdict landed. Abyss: Malphas judged it (rejected and damned ones excluded). */
  roasted: number;
  /** Abyss only: the Papal Bull was broken. */
  summoned?: number;
  /** At least one Stripe Checkout was opened: the click to buy. */
  checkout: number;
  paid: number;
  /** Development dispensations: free, so excluded from revenue. */
  dispensed: number;
  eaten: number;
  /** Paid sins times today's price, before Stripe's fees. */
  revenueCents: number;
}

export interface DayRow { day: string; confessions: number; roasted: number; recoiled: number; checkout: number; paid: number }

export interface Funnel {
  since: string;
  days: number;
  confessions: number;
  parish: TierFunnel;
  /** The parish recoiled: every confession Claude refused. */
  recoiled: number;
  rejected: number;
  damned: number;
  abyss: TierFunnel;
  /** Measured Claude and Malphas spend over the same days, in cents. */
  aiSpendCents: number;
  daily: DayRow[];
}

const opened = "EXISTS (SELECT 1 FROM checkouts c WHERE c.sin_id = s.id)";
const landed = "judged_at IS NOT NULL AND status NOT IN ('uploaded', 'judging')";

export function funnel(days = 7, now = Date.now()): Funnel {
  const since = utcDay(now - (days - 1) * 86_400_000);
  const from = Date.parse(`${since}T00:00:00Z`);
  const row = db().prepare(`SELECT
      COUNT(*) AS confessions,
      COALESCE(SUM(tier = 'parish' AND ${landed}), 0) AS parish_roasted,
      COALESCE(SUM(tier = 'parish' AND ${opened}), 0) AS parish_checkout,
      COALESCE(SUM(tier = 'parish' AND payment_mode = 'paid'), 0) AS parish_paid,
      COALESCE(SUM(tier = 'parish' AND payment_mode = 'dispensation'), 0) AS parish_dispensed,
      COALESCE(SUM(tier = 'parish' AND consumed_at IS NOT NULL), 0) AS parish_eaten,
      COALESCE(SUM(tier = 'abyssal'), 0) AS recoiled,
      COALESCE(SUM(status = 'refused'), 0) AS rejected,
      COALESCE(SUM(status = 'damned'), 0) AS damned,
      COALESCE(SUM(tier = 'abyssal' AND ${landed} AND status NOT IN ('refused', 'damned')), 0) AS abyss_roasted,
      COALESCE(SUM(summoned_at IS NOT NULL), 0) AS abyss_summoned,
      COALESCE(SUM(tier = 'abyssal' AND ${opened}), 0) AS abyss_checkout,
      COALESCE(SUM(tier = 'abyssal' AND payment_mode = 'paid'), 0) AS abyss_paid,
      COALESCE(SUM(tier = 'abyssal' AND payment_mode = 'dispensation'), 0) AS abyss_dispensed,
      COALESCE(SUM(tier = 'abyssal' AND consumed_at IS NOT NULL), 0) AS abyss_eaten
    FROM sins s WHERE created_at >= ?`).get(from) as Record<string, number>;
  const tier = (name: Tier, prefix: "parish" | "abyss"): TierFunnel => ({
    roasted: row[`${prefix}_roasted`],
    ...(name === "abyssal" ? { summoned: row.abyss_summoned } : {}),
    checkout: row[`${prefix}_checkout`],
    paid: row[`${prefix}_paid`],
    dispensed: row[`${prefix}_dispensed`],
    eaten: row[`${prefix}_eaten`],
    revenueCents: row[`${prefix}_paid`] * price(name).cents
  });
  const spend = db().prepare("SELECT COALESCE(SUM(micros), 0) AS micros FROM spend WHERE day >= ?").get(since) as { micros: number };
  const daily = db().prepare(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
      COUNT(*) AS confessions,
      COALESCE(SUM(${landed} AND status NOT IN ('refused', 'damned')), 0) AS roasted,
      COALESCE(SUM(tier = 'abyssal'), 0) AS recoiled,
      COALESCE(SUM(${opened}), 0) AS checkout,
      COALESCE(SUM(payment_mode = 'paid'), 0) AS paid
    FROM sins s WHERE created_at >= ? GROUP BY day ORDER BY day`).all(from) as DayRow[];
  return {
    since, days, confessions: row.confessions,
    parish: tier("parish", "parish"),
    recoiled: row.recoiled, rejected: row.rejected, damned: row.damned,
    abyss: tier("abyssal", "abyss"),
    aiSpendCents: Math.round(spend.micros / 10_000),
    daily
  };
}

const rate = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "n/a");
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The funnel as a plain-text report for the terminal. */
export function formatFunnel(report: Funnel) {
  const { parish, abyss } = report;
  const line = (label: string, count: number, of?: [number, string]) => `  ${label.padEnd(26)}${String(count).padStart(7)}${of ? `   ${rate(count, of[0]).padStart(6)} of ${of[1]}` : ""}`;
  return [
    `Absolvo funnel, ${report.days} day${report.days === 1 ? "" : "s"} from ${report.since} (UTC, by day of confession)`,
    "",
    line("Confessions", report.confessions),
    "",
    "Parish ($" + (price("parish").cents / 100).toFixed(2) + ")",
    line("Roasted", parish.roasted, [report.confessions, "confessions"]),
    line("Opened checkout", parish.checkout, [parish.roasted, "roasted"]),
    line("Paid", parish.paid, [parish.checkout, "checkouts"]),
    line("Eaten", parish.eaten),
    "",
    "Abyss ($" + (price("abyssal").cents / 100).toFixed(2) + ")",
    line("Recoiled", report.recoiled, [report.confessions, "confessions"]),
    line("Rejected by the Abyss", report.rejected, [report.recoiled, "recoils"]),
    line("Damned", report.damned, [report.recoiled, "recoils"]),
    line("Judged by Malphas", abyss.roasted, [report.recoiled, "recoils"]),
    line("Summoned", abyss.summoned ?? 0, [abyss.roasted, "judged"]),
    line("Opened checkout", abyss.checkout, [abyss.summoned ?? 0, "summoned"]),
    line("Paid", abyss.paid, [abyss.checkout, "checkouts"]),
    line("Eaten", abyss.eaten),
    "",
    `  Revenue at today's prices  ${dollars(parish.revenueCents + abyss.revenueCents)} (before Stripe fees)`,
    `  AI spend, measured         ${dollars(report.aiSpendCents)}`,
    ...(parish.dispensed + abyss.dispensed ? [`  Dispensations (free, dev)  ${parish.dispensed + abyss.dispensed}`] : []),
    "",
    "  Day          Confessed  Roasted  Recoiled  Checkout  Paid",
    ...report.daily.map(day => `  ${day.day}  ${String(day.confessions).padStart(9)}  ${String(day.roasted).padStart(7)}  ${String(day.recoiled).padStart(8)}  ${String(day.checkout).padStart(8)}  ${String(day.paid).padStart(4)}`)
  ].join("\n");
}
