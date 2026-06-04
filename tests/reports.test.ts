import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { useTempDevDb } from "./_db";

/**
 * Report-correctness tests. The lib functions in src/lib/reports.ts use
 * the singleton prisma client. Previously this test seeded + read against
 * the LIVE prisma/dev.db, polluting the developer database. Now it copies
 * dev.db to an OS-temp file (via the shared _db helper) and points BOTH
 * the singleton (DATABASE_URL, set before any prisma import) and the
 * test's own seeding client at that throwaway copy.
 */

// Set DATABASE_URL to a temp copy BEFORE @/lib/reports (and its prisma
// singleton) is dynamically imported inside the test bodies.
const { cleanupFile } = useTempDevDb("reports");

let prisma: PrismaClient;
const createdTenantIds: string[] = [];

beforeAll(() => {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
  prisma = new PrismaClient({ adapter });
});

afterAll(async () => {
  await prisma?.$disconnect();
  cleanupFile();
});

async function newTenant(slug: string): Promise<string> {
  const t = await prisma.tenant.create({ data: { name: `Report test ${slug}`, slug, primaryMode: "VERTICAL" } });
  createdTenantIds.push(t.id);
  return t.id;
}

describe("WIP report (R1) — over/under billed math", () => {
  it("computes over-billed when billings exceed earned revenue", async () => {
    const tenantId = await newTenant(`wip-over-${Date.now()}`);
    const project = await prisma.project.create({
      data: { tenantId, name: "Over-billed test", code: `OB-${Date.now()}`, mode: "VERTICAL", contractValue: 1_000_000 },
    });
    await prisma.projectPnlSnapshot.create({
      data: {
        projectId: project.id,
        contractValue: 1_000_000,
        totalContractValue: 1_000_000,
        approvedCOValue: 0,
        billedToDate: 700_000,
        costsToDate: 500_000,
        committedCost: 0,
        forecastFinalCost: 1_000_000,
        forecastGrossMargin: 0,
        wipOverUnder: 200_000,
        percentComplete: 50,
        asOf: new Date(),
      },
    });
    const { wipReport } = await import("../src/lib/reports");
    const rows = await wipReport(tenantId);
    const row = rows.find((r) => r.projectId === project.id);
    expect(row).toBeDefined();
    expect(row!.percentComplete).toBeCloseTo(0.5, 2);
    expect(row!.earnedRevenue).toBeCloseTo(500_000, 0);
    expect(row!.overBilled).toBeCloseTo(200_000, 0);
    expect(row!.underBilled).toBe(0);
  });

  it("computes under-billed when earned revenue exceeds billings", async () => {
    const tenantId = await newTenant(`wip-under-${Date.now()}`);
    const project = await prisma.project.create({
      data: { tenantId, name: "Under-billed test", code: `UB-${Date.now()}`, mode: "VERTICAL", contractValue: 1_000_000 },
    });
    await prisma.projectPnlSnapshot.create({
      data: {
        projectId: project.id,
        contractValue: 1_000_000,
        totalContractValue: 1_000_000,
        approvedCOValue: 0,
        billedToDate: 300_000,
        costsToDate: 500_000,
        committedCost: 0,
        forecastFinalCost: 1_000_000,
        forecastGrossMargin: 0,
        wipOverUnder: -200_000,
        percentComplete: 50,
        asOf: new Date(),
      },
    });
    const { wipReport } = await import("../src/lib/reports");
    const rows = await wipReport(tenantId);
    const row = rows.find((r) => r.projectId === project.id);
    expect(row).toBeDefined();
    expect(row!.earnedRevenue).toBeCloseTo(500_000, 0);
    expect(row!.underBilled).toBeCloseTo(200_000, 0);
    expect(row!.overBilled).toBe(0);
  });
});

describe("Win rate report (R4) — denominator math", () => {
  it("computes win rate as won / (won + lost), excluding undecided", async () => {
    const tenantId = await newTenant(`wr-decided-${Date.now()}`);
    await prisma.opportunity.createMany({
      data: [
        { tenantId, name: "Won 1", ownerName: "Alice WR", stage: "AWARDED" },
        { tenantId, name: "Won 2", ownerName: "Alice WR", stage: "AWARDED" },
        { tenantId, name: "Won 3", ownerName: "Alice WR", stage: "AWARDED" },
        { tenantId, name: "Lost 1", ownerName: "Alice WR", stage: "LOST" },
        { tenantId, name: "Pending 1", ownerName: "Alice WR", stage: "PROPOSAL" },
        { tenantId, name: "Pending 2", ownerName: "Alice WR", stage: "BID" },
      ],
    });
    const { winRateAnalytics } = await import("../src/lib/reports");
    const result = await winRateAnalytics(tenantId);
    const alice = result.byOwner.find((r) => r.scope === "Alice WR");
    expect(alice).toBeDefined();
    expect(alice!.total).toBe(6);
    expect(alice!.won).toBe(3);
    expect(alice!.lost).toBe(1);
    expect(alice!.winRate).toBeCloseTo(0.75, 2);
  });

  it("reports 0 win rate when nothing decided yet", async () => {
    const tenantId = await newTenant(`wr-none-${Date.now()}`);
    await prisma.opportunity.create({
      data: { tenantId, name: "P1", ownerName: "Bob WR", stage: "PROPOSAL" },
    });
    const { winRateAnalytics } = await import("../src/lib/reports");
    const r = await winRateAnalytics(tenantId);
    const bob = r.byOwner.find((row) => row.scope === "Bob WR");
    expect(bob).toBeDefined();
    expect(bob!.total).toBe(1);
    expect(bob!.winRate).toBe(0);
  });
});
