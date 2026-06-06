/**
 * Shared test-DB helper (PostgreSQL).
 *
 * Tests run against a DEDICATED Postgres test database — never the primary
 * dev/seeded database. Each DB-touching test creates its own tenants/
 * projects with unique slugs and cleans them up, so files can run against
 * the same database without colliding (unlike the old SQLite file-copy
 * pattern, Postgres handles concurrent connections cleanly; vitest is also
 * configured non-parallel so connection counts stay small).
 *
 * Resolution of the test database URL:
 *   1. TEST_DATABASE_URL (CI sets this to the disposable service DB), else
 *   2. a conventional local `bcon_test` database. Create + migrate it once:
 *        createdb -O bcon bcon_test
 *        DATABASE_URL=postgresql://bcon:bcon_dev@127.0.0.1:5432/bcon_test \
 *          npx prisma migrate deploy
 *
 * Two usage modes:
 *
 *  1. Own-client tests (no lib-singleton dependency):
 *       const { prisma, cleanup } = freshPrisma("reports");
 *       // ... use prisma ...
 *       await cleanup();   // disconnect
 *
 *  2. Singleton-backed tests (function under test imports @/lib/prisma):
 *       const { cleanupFile } = useTempDevDb("alerts");
 *       // ^ sets process.env.DATABASE_URL to the test DB. Call this at
 *       //   module top-level BEFORE importing @/lib/prisma.
 *       const { prisma } = await import("@/lib/prisma");
 *       // in afterAll: await prisma.$disconnect(); cleanupFile();
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Postgres connection string for the throwaway test database. */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit && explicit.trim()) return explicit.trim();
  return "postgresql://bcon:bcon_dev@127.0.0.1:5432/bcon_test?schema=public";
}

/** Small connection pool — many test files share one server. */
function makeAdapter() {
  return new PrismaPg({ connectionString: testDatabaseUrl(), max: 3 });
}

/**
 * Singleton-backed mode. Points process.env.DATABASE_URL at the test DB.
 * MUST be called at module top-level before any import of @/lib/prisma so
 * the singleton binds to the test database. Returns the URL + a no-op
 * cleanup (kept for source-compat with the former SQLite file helper).
 */
export function useTempDevDb(_label: string): { dbUrl: string; cleanupFile: () => void } {
  const dbUrl = testDatabaseUrl();
  process.env.DATABASE_URL = dbUrl;
  return { dbUrl, cleanupFile: () => {} };
}

/**
 * Own-client mode. Returns a fresh PrismaClient bound to the test DB plus a
 * cleanup that disconnects it. Does NOT touch process.env, so it's safe
 * alongside the lib singleton.
 */
export function freshPrisma(_label: string): { prisma: PrismaClient; cleanup: () => Promise<void> } {
  const prisma = new PrismaClient({ adapter: makeAdapter() });
  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect().catch(() => {});
    },
  };
}
