import { db, tx, utcDay } from "./db";
import { dailySpendMicros, tokenPrices } from "./env";

export function consumeLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  return tx(() => {
    const database = db();
    database.prepare("DELETE FROM rate_limits WHERE expires < ?").run(now);
    const row = database.prepare("SELECT count FROM rate_limits WHERE key = ?").get(key) as { count: number } | undefined;
    if (!row) {
      database.prepare("INSERT INTO rate_limits (key, count, expires) VALUES (?, 1, ?)").run(key, now + windowMs);
      return true;
    }
    if (row.count >= max) return false;
    database.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
    return true;
  });
}

/** A lease that expires on its own, so a crashed request never wedges the key. Returns a token, or 0 if held. */
export function acquireLock(key: string, ttlMs: number, now = Date.now()) {
  return tx(() => {
    const database = db();
    const row = database.prepare("SELECT expires FROM locks WHERE key = ?").get(key) as { expires: number } | undefined;
    if (row && row.expires > now) return 0;
    const token = now + ttlMs;
    database.prepare("INSERT INTO locks (key, expires) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET expires = excluded.expires").run(key, token);
    return token;
  });
}
/** Releases only the lease this caller took, never one a later request acquired after it expired. */
export function releaseLock(key: string, token: number) { db().prepare("DELETE FROM locks WHERE key = ? AND expires = ?").run(key, token); }

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Tokens × USD-per-million is exactly micro-dollars. Cache writes bill at 1.25×, reads at 0.05× of input. */
export function costMicros(usage: Usage, prices = tokenPrices()) {
  const { input, output } = prices;
  return Math.round(usage.input_tokens * input + (usage.cache_creation_input_tokens ?? 0) * input * 1.25 + (usage.cache_read_input_tokens ?? 0) * input * 0.05 + usage.output_tokens * output);
}
export function spentToday(now = Date.now()) {
  return (db().prepare("SELECT micros FROM spend WHERE day = ?").get(utcDay(now)) as { micros: number } | undefined)?.micros ?? 0;
}
/** Books a call's worst-case cost before it is made, so concurrent judgments cannot all slip under the cap. */
export function reserveSpend(micros: number, now = Date.now()) {
  return tx(() => {
    if (spentToday(now) + micros > dailySpendMicros()) return false;
    db().prepare("INSERT INTO spend (day, micros) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET micros = micros + excluded.micros").run(utcDay(now), micros);
    return true;
  });
}
/** Swaps a reservation for the measured cost. Pass null only for a call that was never billed; a call lost mid-flight keeps its reservation. */
export function settleSpend(reserved: number, usage: Usage | null, prices = tokenPrices(), now = Date.now()) {
  const actual = usage ? costMicros(usage, prices) : 0;
  db().prepare("UPDATE spend SET micros = MAX(0, micros + ?) WHERE day = ?").run(actual - reserved, utcDay(now));
}
