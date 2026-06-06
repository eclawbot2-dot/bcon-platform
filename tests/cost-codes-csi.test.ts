import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { useTempDevDb, freshPrisma } from "./_db";

// seedDefaultCostCodes (imported dynamically below) uses the @/lib/prisma
// singleton; bind DATABASE_URL to the test DB before that module loads so
// the singleton and this test's own client hit the same database.
const { cleanupFile } = useTempDevDb("cost-codes-csi");

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let tenantId: string;

beforeAll(async () => {
  ({ prisma, cleanup } = freshPrisma("cost-codes-csi"));
  const t = await prisma.tenant.create({ data: { name: `CC test ${Date.now()}`, slug: `cc-${Date.now()}`, primaryMode: "VERTICAL" } });
  tenantId = t.id;
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => { /* cleanup */ });
  await cleanup?.();
  cleanupFile();
});

describe("seedDefaultCostCodes — idempotency", () => {
  it("creates 25 CSI divisions on first run for a fresh tenant", async () => {
    const { seedDefaultCostCodes } = await import("../src/lib/cost-codes-csi");
    const result = await seedDefaultCostCodes(tenantId);
    expect(result.created).toBe(25);
    const count = await prisma.costCode.count({ where: { tenantId } });
    expect(count).toBe(25);
  });

  it("creates zero new rows on a second run (idempotent)", async () => {
    const { seedDefaultCostCodes } = await import("../src/lib/cost-codes-csi");
    const result = await seedDefaultCostCodes(tenantId);
    expect(result.created).toBe(0);
    const count = await prisma.costCode.count({ where: { tenantId } });
    expect(count).toBe(25);
  });

  it("doesn't disturb tenant-custom rows added between seed runs", async () => {
    await prisma.costCode.create({
      data: { tenantId, code: "01-100", name: "Custom GR sub", description: "tenant-specific", level: 1 },
    });
    const { seedDefaultCostCodes } = await import("../src/lib/cost-codes-csi");
    await seedDefaultCostCodes(tenantId);
    const custom = await prisma.costCode.findFirst({ where: { tenantId, code: "01-100" } });
    expect(custom?.name).toBe("Custom GR sub");
  });
});
