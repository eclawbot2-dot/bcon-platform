/**
 * Shared test-DB isolation helper.
 *
 * The platform's dev SQLite file (prisma/dev.db) is the live developer
 * database. Tests must NEVER write to it: a failed cleanup leaves junk
 * tenants/projects behind, and parallel test files racing on the same
 * file produce flaky failures. The tenant-isolation test established the
 * right pattern — copy dev.db to an OS-temp file and point a throwaway
 * Prisma client (or the lib singleton) at the copy. This module makes
 * that pattern reusable so no test rolls its own (and gets it wrong, the
 * way reports.test.ts originally pointed straight at dev.db).
 *
 * Two usage modes:
 *
 *  1. Own-client tests (no lib-singleton dependency):
 *       const { prisma, cleanup } = freshPrisma("reports");
 *       // ... use prisma ...
 *       await cleanup();   // disconnect + unlink temp file
 *
 *  2. Singleton-backed tests (function under test imports @/lib/prisma):
 *       const { dbPath, cleanupFile } = useTempDevDb("alerts");
 *       // ^ sets process.env.DATABASE_URL to the temp copy. Call this at
 *       //   module top-level BEFORE importing @/lib/prisma.
 *       const { prisma } = await import("@/lib/prisma");
 *       // ... in afterAll: await prisma.$disconnect(); cleanupFile();
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/** Absolute path to the developer SQLite database. */
export function devDbPath(): string {
  return path.resolve(__dirname, "..", "prisma", "dev.db");
}

/**
 * Copy dev.db to a unique OS-temp file and return its path. The label +
 * timestamp + random suffix avoid collisions when multiple test files
 * run concurrently. Throws if dev.db is missing (CI/local must run
 * `npx prisma db push` first).
 */
export function copyDevDb(label: string): string {
  const src = devDbPath();
  if (!fs.existsSync(src)) {
    throw new Error("dev.db missing — run `npx prisma db push` first");
  }
  const tmp = path.join(
    os.tmpdir(),
    `bcon-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
  );
  fs.copyFileSync(src, tmp);
  return tmp;
}

/**
 * Singleton-backed mode. Copies dev.db to a temp file and points
 * process.env.DATABASE_URL at it. MUST be called at module top-level
 * before any import of @/lib/prisma so the singleton binds to the copy.
 * Returns the temp path + a cleanup that unlinks it.
 */
export function useTempDevDb(label: string): { dbPath: string; cleanupFile: () => void } {
  const dbPath = copyDevDb(label);
  process.env.DATABASE_URL = `file:${dbPath}`;
  return {
    dbPath,
    cleanupFile: () => {
      try {
        fs.unlinkSync(dbPath);
      } catch {
        /* best-effort */
      }
    },
  };
}

/**
 * Own-client mode. Returns a fresh PrismaClient bound to a throwaway copy
 * of dev.db plus a cleanup that disconnects and unlinks the file. Does
 * NOT touch process.env, so it's safe alongside the lib singleton.
 */
export function freshPrisma(label: string): { prisma: PrismaClient; dbPath: string; cleanup: () => Promise<void> } {
  const dbPath = copyDevDb(label);
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    dbPath,
    cleanup: async () => {
      await prisma.$disconnect().catch(() => {});
      try {
        fs.unlinkSync(dbPath);
      } catch {
        /* best-effort */
      }
    },
  };
}
