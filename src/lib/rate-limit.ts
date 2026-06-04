/**
 * Persistent sliding-window rate limiter — keyed by an arbitrary string
 * (typically `login:${ip}:${email}`).
 *
 * Pass-8 flagged the credentials login endpoint as having no brute-force
 * protection; the first cut used an in-process Map. That bucket evaporated
 * on every service restart, so an attacker could reset the throttle simply
 * by causing (or waiting for) a `bcon-next` restart. This version persists
 * the attempt timestamps to a small SQLite table so the window survives
 * restarts, while keeping the SAME synchronous API (consumeRateLimit /
 * resetRateLimit) the call sites in auth.ts already use.
 *
 * Implementation notes:
 *   - Backed by a dedicated better-sqlite3 handle on the same DATABASE_URL
 *     file as Prisma. We use a raw table (RateLimitHit) created lazily with
 *     CREATE TABLE IF NOT EXISTS, so no Prisma migration / `db push` is
 *     required and the limiter can't be broken by a schema drift.
 *   - better-sqlite3 is synchronous, which is exactly what the existing
 *     (non-async) API needs — NextAuth's authorize() calls consume()
 *     without awaiting.
 *   - Each row is one attempt: (key, ts). consume() prunes rows older than
 *     the window, counts what remains, and inserts a new row if under the
 *     cap. O(N) per call where N is the per-key cap (small).
 *   - If the DB can't be opened (e.g. a unit test with no file), we fall
 *     back to an in-process Map so behaviour degrades gracefully rather
 *     than throwing inside the auth hot path.
 */

import path from "node:path";
import Database from "better-sqlite3";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

// ---- Persistent backend (better-sqlite3) -------------------------------

type Db = import("better-sqlite3").Database;

let db: Db | null = null;
let dbInitFailed = false;

function resolveDbFile(): string {
  const configured = process.env.DATABASE_URL;
  if (configured && configured.startsWith("file:")) return configured.slice("file:".length);
  if (configured && !configured.includes("://")) return configured;
  return path.join(process.cwd(), "prisma", "dev.db");
}

function getDb(): Db | null {
  if (db) return db;
  if (dbInitFailed) return null;
  try {
    const file = resolveDbFile();
    const handle = new Database(file);
    handle.pragma("journal_mode = WAL");
    handle.exec(
      `CREATE TABLE IF NOT EXISTS "RateLimitHit" (
         "key" TEXT NOT NULL,
         "ts"  INTEGER NOT NULL
       );
       CREATE INDEX IF NOT EXISTS "RateLimitHit_key_ts_idx" ON "RateLimitHit" ("key", "ts");`,
    );
    db = handle;
    return db;
  } catch (err) {
    // Don't let a storage failure take down login; fall back to memory.
    console.error("[rate-limit] could not open persistent store; using in-memory fallback", err);
    dbInitFailed = true;
    return null;
  }
}

// ---- In-memory fallback ------------------------------------------------

type Bucket = { hits: number[] };
const memStore = new Map<string, Bucket>();

function consumeMemory(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = memStore.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0] ?? now;
    return { allowed: false, remaining: 0, resetAt: oldest + opts.windowMs };
  }
  bucket.hits.push(now);
  memStore.set(key, bucket);
  return { allowed: true, remaining: opts.limit - bucket.hits.length, resetAt: now + opts.windowMs };
}

// ---- Public API (unchanged signatures) ---------------------------------

/**
 * Consume one token from the bucket for `key`. Returns `{ allowed: false }`
 * once the bucket is exhausted within the window. The caller should not
 * proceed with the rate-limited action; the credentials login uses this to
 * short-circuit `authorize()` and return null without running bcrypt.
 */
export function consumeRateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const handle = getDb();
  if (!handle) return consumeMemory(key, opts);

  const now = Date.now();
  const cutoff = now - opts.windowMs;
  try {
    // Prune expired attempts for this key, then count what remains.
    handle.prepare(`DELETE FROM "RateLimitHit" WHERE "key" = ? AND "ts" <= ?`).run(key, cutoff);
    const rows = handle
      .prepare(`SELECT "ts" FROM "RateLimitHit" WHERE "key" = ? ORDER BY "ts" ASC`)
      .all(key) as Array<{ ts: number }>;

    if (rows.length >= opts.limit) {
      const oldest = rows[0]?.ts ?? now;
      return { allowed: false, remaining: 0, resetAt: oldest + opts.windowMs };
    }

    handle.prepare(`INSERT INTO "RateLimitHit" ("key", "ts") VALUES (?, ?)`).run(key, now);
    return { allowed: true, remaining: opts.limit - (rows.length + 1), resetAt: now + opts.windowMs };
  } catch (err) {
    console.error("[rate-limit] consume failed; falling back to memory for this call", err);
    return consumeMemory(key, opts);
  }
}

/**
 * Reset the bucket for a key — call after a successful login so the counter
 * doesn't lock out a legitimate user who fat-fingered a password a few
 * times before getting it right.
 */
export function resetRateLimit(key: string): void {
  memStore.delete(key);
  const handle = getDb();
  if (!handle) return;
  try {
    handle.prepare(`DELETE FROM "RateLimitHit" WHERE "key" = ?`).run(key);
  } catch (err) {
    console.error("[rate-limit] reset failed", err);
  }
}

/**
 * Test-only: clear all buckets (both backends). Not for production use.
 */
export function _resetAllRateLimits(): void {
  memStore.clear();
  const handle = getDb();
  if (!handle) return;
  try {
    handle.exec(`DELETE FROM "RateLimitHit"`);
  } catch {
    /* ignore */
  }
}
