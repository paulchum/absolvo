import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./env";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sins (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','text')),
  media_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  seal TEXT NOT NULL,
  vault_file TEXT,
  status TEXT NOT NULL,
  verdict TEXT,
  local_time TEXT,
  tz TEXT,
  created_at INTEGER NOT NULL,
  judged_at INTEGER,
  expires_at INTEGER NOT NULL,
  stripe_session TEXT UNIQUE,
  checkout_url TEXT,
  checkout_expires_at INTEGER,
  stripe_payment_intent TEXT,
  paid_at INTEGER,
  payment_mode TEXT,
  consumed_at INTEGER,
  purged_at INTEGER,
  receipt TEXT,
  tier TEXT NOT NULL DEFAULT 'parish',
  summoned_at INTEGER
);
CREATE INDEX IF NOT EXISTS sins_owner ON sins(owner_hash, created_at);
CREATE INDEX IF NOT EXISTS sins_sweep ON sins(status, expires_at);
CREATE TABLE IF NOT EXISTS certificates (
  serial TEXT PRIMARY KEY,
  sin_id TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid',
  issued_at INTEGER NOT NULL,
  revoked_at INTEGER,
  tier TEXT NOT NULL DEFAULT 'parish',
  summoned_at INTEGER
);
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS checkouts (session_id TEXT PRIMARY KEY, sin_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, micros INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS absolutions (day TEXT NOT NULL, sin_order TEXT NOT NULL, cardinal TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, sin_order));
CREATE TABLE IF NOT EXISTS inscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sin_mac TEXT NOT NULL UNIQUE,
  cardinal TEXT NOT NULL,
  sin_order TEXT NOT NULL,
  severity INTEGER NOT NULL,
  label TEXT,
  place TEXT,
  created_at INTEGER NOT NULL,
  publish_at INTEGER NOT NULL,
  published_at INTEGER,
  moderated_at INTEGER
);
CREATE INDEX IF NOT EXISTS inscriptions_publish ON inscriptions(published_at, publish_at);
`;

interface Holder { db?: Database.Database; dir?: string }
const holder = globalThis as typeof globalThis & { __absolvo?: Holder };
holder.__absolvo ??= {};

export function db() {
  const state = holder.__absolvo!;
  const dir = dataDir();
  if (state.db && state.dir === dir) return state.db;
  state.db?.close();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const database = new Database(path.join(dir, "absolvo.db"));
  database.pragma("journal_mode = WAL");
  database.pragma("secure_delete = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA);
  const migrate = (table: string, column: string, definition: string) => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(existing => existing.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  migrate("inscriptions", "moderated_at", "INTEGER");
  migrate("sins", "tier", "TEXT NOT NULL DEFAULT 'parish'");
  migrate("sins", "summoned_at", "INTEGER");
  migrate("certificates", "tier", "TEXT NOT NULL DEFAULT 'parish'");
  state.db = database;
  state.dir = dir;
  return database;
}

export function closeDb() {
  const state = holder.__absolvo!;
  state.db?.close();
  state.db = undefined;
  state.dir = undefined;
}

export function tx<T>(fn: () => T): T { return db().transaction(fn)(); }

export function utcDay(at = Date.now()) { return new Date(at).toISOString().slice(0, 10); }
