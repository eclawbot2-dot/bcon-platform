/**
 * Standalone catalog refresh — `npx tsx prisma/seed-portals.ts`.
 * Idempotent. Safe to run against a live database; will not touch tenant
 * data. Run this whenever portal-catalog.ts is updated to push the new
 * entries into production without re-seeding tenants.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { upsertPortalCatalog } from "./portal-catalog";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL must be a postgresql:// connection string.");
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const { created, updated } = await upsertPortalCatalog(prisma);
    console.log(`portal catalog: ${created} created, ${updated} updated`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
