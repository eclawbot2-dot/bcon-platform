/**
 * One-shot data backfills for Tenant fields added after seed.
 *
 * Currently:
 *   - preferredProvider: any tenant pre-pass-15 has NULL here. Set
 *     it to "openai" (the schema default) so the resolveKey logic in
 *     src/lib/ai.ts gets a deterministic value to read.
 *
 * Run: `npx tsx scripts/backfill-tenant-fields.ts`. Idempotent.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required (postgresql://).");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const r = await prisma.tenant.updateMany({
      where: { preferredProvider: null },
      data: { preferredProvider: "openai" },
    });
    console.log(`backfill: preferredProvider set on ${r.count} tenant(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
