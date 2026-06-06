import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * The app runs on PostgreSQL (16) via @prisma/adapter-pg. DATABASE_URL must
 * be a postgresql:// connection string (see .env / .env.example). The driver
 * adapter owns connection pooling, so a single `pg` pool is shared across the
 * Prisma client for the lifetime of the process.
 *
 * In development Next.js hot-reloads modules, which would otherwise spin up a
 * fresh pool (and exhaust Postgres connections) on every edit — so the client
 * is cached on globalThis outside production, matching the standard Prisma +
 * Next.js singleton pattern.
 */
function resolvePostgresUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) {
    throw new Error("DATABASE_URL is not set; expected a postgresql:// connection string.");
  }
  if (!configured.startsWith("postgres://") && !configured.startsWith("postgresql://")) {
    throw new Error(
      `DATABASE_URL must be a postgresql:// URL (this app runs on Postgres), got scheme "${configured.split(":")[0]}".`,
    );
  }
  return configured;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: resolvePostgresUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
