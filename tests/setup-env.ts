/**
 * Vitest global setup (runs before each test file's modules load).
 *
 * Binds DATABASE_URL to the dedicated Postgres TEST database so that:
 *   - the @/lib/prisma singleton — instantiated at import time by many libs
 *     under test — always has a valid (lazy) connection string, and
 *   - tests can NEVER accidentally touch the primary/seeded dev database,
 *     even if a developer has DATABASE_URL exported in their shell.
 *
 * Individual tests may still call useTempDevDb()/freshPrisma() (which point
 * at the same test DB); this just guarantees a sane default for the pure
 * logic tests that import a DB-backed lib without seeding anything.
 */
import { testDatabaseUrl } from "./_db";

process.env.DATABASE_URL = testDatabaseUrl();
