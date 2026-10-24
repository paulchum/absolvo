import { randomInt } from "node:crypto";
import { EventEmitter } from "node:events";
import { db, utcDay } from "./db";
import { wallDelayRange, wallMaxStreams } from "./env";
import { HttpError } from "./http";
import { placeFromTimezone, soulPhrase } from "./places";
import { every5s } from "./scheduler";
import { keyedMac } from "./session";
import { ownedSin, verdictOf } from "./sins";
import { CARDINAL, CARDINALS, className, order, type Cardinal } from "./taxonomy";

export type Choice = "carve" | "class" | "secret";

interface InscriptionRow { id: number; cardinal: string; sin_order: string; severity: number; label: string | null; place: string | null; published_at: number | null; publish_at: number; moderated_at: number | null }

export interface Inscription { id: number; line: string; latin: string; className: string; english: string; place: string | null; label: string | null; at: number }

export function lineFor(entry: { place: string | null; severity: number; cardinal: string; label: string | null }) {
  const sin = `${className(entry.severity)} ${CARDINAL[entry.cardinal as Cardinal]?.english ?? entry.cardinal}`;
  return `${soulPhrase(entry.place)} was absolved of ${sin}${entry.label ? `: ${entry.label}` : "."}`;
}

const toInscription = (row: InscriptionRow): Inscription => ({
  id: row.id,
  line: lineFor(row),
  latin: order(row.sin_order).latin,
  className: className(row.severity),
  english: CARDINAL[row.cardinal as Cardinal]?.english ?? row.cardinal,
  place: row.place,
  label: row.label,
  at: row.published_at ?? row.publish_at
});

/** The exact public lines the penitent chooses between: nothing is carved without that choice. */
export function preview(sinId: string, owner: string) {
  const sin = ownedSin(sinId, owner);
  const verdict = verdictOf(sin);
  if (sin.status !== "consumed" || !verdict) return null;
  const place = placeFromTimezone(sin.tz);
  const base = { place, severity: verdict.sin.severity, cardinal: verdict.sin.cardinal };
  const carved = db().prepare("SELECT label, moderated_at FROM inscriptions WHERE sin_mac = ?").get(keyedMac("wall", sinId)) as { label: string | null; moderated_at: number | null } | undefined;
  return {
    carve: lineFor({ ...base, label: verdict.wallLabel }),
    classOnly: lineFor({ ...base, label: null }),
    chosen: carved ? (carved.moderated_at ? "struck" : carved.label ? "carve" : "class") : null
  };
}

export function inscribe(sinId: string, owner: string, choice: Choice, now = Date.now()) {
  const sin = ownedSin(sinId, owner);
  const verdict = verdictOf(sin);
  if (sin.status !== "consumed" || !verdict) throw new HttpError(409, "Only an absolved sin may be carved.");
  const mac = keyedMac("wall", sinId);
  const existing = db().prepare("SELECT moderated_at FROM inscriptions WHERE sin_mac = ?").get(mac) as { moderated_at: number | null } | undefined;
  if (existing?.moderated_at) throw new HttpError(409, "The keeper of the Graveyard hath struck this stone.");
  if (choice === "secret") {
    db().prepare("DELETE FROM inscriptions WHERE sin_mac = ?").run(mac);
    return null;
  }
  const [min, max] = wallDelayRange();
  const publishAt = now + (max > min ? randomInt(min, max + 1) : min);
  const label = choice === "carve" ? verdict.wallLabel : null;
  db().prepare(`INSERT INTO inscriptions (sin_mac, cardinal, sin_order, severity, label, place, created_at, publish_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sin_mac) DO UPDATE SET label = excluded.label`)
    .run(mac, verdict.sin.cardinal, verdict.sin.order, verdict.sin.severity, label, placeFromTimezone(sin.tz), now, publishAt);
  return lineFor({ place: placeFromTimezone(sin.tz), severity: verdict.sin.severity, cardinal: verdict.sin.cardinal, label });
}

/** Moderation is separate from the owner's own choices, so re-carving can never undo it. */
export function hide(id: number, now = Date.now()) {
  return db().prepare("UPDATE inscriptions SET moderated_at = ? WHERE id = ? AND moderated_at IS NULL").run(now, id).changes > 0;
}

interface WallState { emitter: EventEmitter; streams: number; perClient: Map<string, number> }
const holder = globalThis as typeof globalThis & { __absolvoWall?: WallState };
const state: WallState = (holder.__absolvoWall ??= { emitter: new EventEmitter().setMaxListeners(0), streams: 0, perClient: new Map() });
const STREAMS_PER_CLIENT = 4;

export function publishDue(now = Date.now()) {
  const due = db().prepare("SELECT * FROM inscriptions WHERE published_at IS NULL AND moderated_at IS NULL AND publish_at <= ? ORDER BY publish_at").all(now) as InscriptionRow[];
  for (const row of due) {
    db().prepare("UPDATE inscriptions SET published_at = ? WHERE id = ?").run(now, row.id);
    state.emitter.emit("inscription", toInscription({ ...row, published_at: now }));
  }
  return due.length;
}
every5s("wall:publish", () => publishDue());

export function recent({ limit = 40, before, after }: { limit?: number; before?: number; after?: number } = {}) {
  const rows = db().prepare(`SELECT * FROM inscriptions WHERE published_at IS NOT NULL AND moderated_at IS NULL
    AND id < ? AND id > ? ORDER BY id DESC LIMIT ?`).all(before ?? Number.MAX_SAFE_INTEGER, after ?? 0, Math.min(100, Math.max(1, limit))) as InscriptionRow[];
  return rows.map(toInscription);
}

/** Aggregate totals over every consumed sin (consent is not needed for a count), never individual rows. */
export function census(now = Date.now()) {
  const today = utcDay(now);
  const rows = db().prepare("SELECT cardinal, SUM(count) AS total FROM absolutions WHERE day = ? GROUP BY cardinal").all(today) as { cardinal: string; total: number }[];
  const counts = Object.fromEntries(CARDINALS.map(cardinal => [cardinal, 0])) as Record<Cardinal, number>;
  for (const row of rows) if (row.cardinal in counts) counts[row.cardinal as Cardinal] = row.total;
  const souls = (db().prepare("SELECT COALESCE(SUM(count), 0) AS total FROM absolutions").get() as { total: number }).total;
  return { day: today, counts, today: Object.values(counts).reduce((sum, value) => sum + value, 0), souls };
}

export function subscribe(listener: (entry: Inscription) => void, client: string | null = null) {
  state.perClient ??= new Map();
  const held = client ? state.perClient.get(client) ?? 0 : 0;
  if (state.streams >= wallMaxStreams() || held >= STREAMS_PER_CLIENT) return null;
  state.streams++;
  if (client) state.perClient.set(client, held + 1);
  state.emitter.on("inscription", listener);
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    state.streams--;
    if (client) {
      const left = (state.perClient.get(client) ?? 1) - 1;
      if (left > 0) state.perClient.set(client, left); else state.perClient.delete(client);
    }
    state.emitter.off("inscription", listener);
  };
}
export function streamCount() { return state.streams; }
