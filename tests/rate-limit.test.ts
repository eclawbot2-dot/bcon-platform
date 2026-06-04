import { describe, it, expect, beforeEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Point the limiter's persistent SQLite store at a throwaway temp file
// BEFORE importing the module, so the test never touches the dev database
// (the limiter lazily CREATE-TABLE-IF-NOT-EXISTS, so an empty file is fine).
const tmpDb = path.join(os.tmpdir(), `bcon-test-ratelimit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
process.env.DATABASE_URL = `file:${tmpDb}`;

const { consumeRateLimit, resetRateLimit, _resetAllRateLimits } = await import("../src/lib/rate-limit");

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(tmpDb + suffix); } catch { /* ignore */ }
  }
});

describe("consumeRateLimit", () => {
  beforeEach(() => {
    _resetAllRateLimits();
  });

  it("allows up to limit requests then denies", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
    expect(consumeRateLimit("k", opts).allowed).toBe(false);
  });

  it("returns remaining count correctly", () => {
    const opts = { limit: 5, windowMs: 60_000 };
    expect(consumeRateLimit("k", opts).remaining).toBe(4);
    expect(consumeRateLimit("k", opts).remaining).toBe(3);
  });

  it("scopes per key", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(consumeRateLimit("k1", opts).allowed).toBe(true);
    expect(consumeRateLimit("k2", opts).allowed).toBe(true);
    expect(consumeRateLimit("k1", opts).allowed).toBe(false);
    expect(consumeRateLimit("k2", opts).allowed).toBe(false);
  });

  it("resetRateLimit clears the bucket", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    consumeRateLimit("k", opts);
    consumeRateLimit("k", opts);
    expect(consumeRateLimit("k", opts).allowed).toBe(false);
    resetRateLimit("k");
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
  });

  it("expires hits after the window passes", async () => {
    const opts = { limit: 2, windowMs: 50 };
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
    expect(consumeRateLimit("k", opts).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 70));
    expect(consumeRateLimit("k", opts).allowed).toBe(true);
  });

  it("resetAt is the oldest hit + window when blocked", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const t0 = Date.now();
    consumeRateLimit("k", opts);
    const blocked = consumeRateLimit("k", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetAt).toBeGreaterThanOrEqual(t0 + 1000 - 50);
    expect(blocked.resetAt).toBeLessThanOrEqual(t0 + 1000 + 50);
  });

  it("persists attempts to SQLite (survives a process restart)", async () => {
    const opts = { limit: 5, windowMs: 60_000 };
    consumeRateLimit("persist-key", opts);
    consumeRateLimit("persist-key", opts);

    // Simulate a fresh process: open the same file with a brand-new handle
    // and confirm the attempt rows are still there (an in-memory Map would
    // have lost them on restart).
    const Database = (await import("better-sqlite3")).default;
    const fresh = new Database(tmpDb);
    try {
      const row = fresh.prepare(`SELECT COUNT(*) AS n FROM "RateLimitHit" WHERE "key" = ?`).get("persist-key") as { n: number };
      expect(row.n).toBe(2);
    } finally {
      fresh.close();
    }
  });
});
