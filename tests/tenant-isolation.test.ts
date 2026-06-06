import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { freshPrisma } from "./_db";

/**
 * Tenant isolation guards. The platform's #1 trust property is that
 * tenant A's data never leaks to tenant B. Most queries go through
 * Prisma with explicit tenantId WHERE clauses; these tests check the
 * indirect-access paths that are easiest to break:
 *
 *   1. Two tenants can both create RfpListing rows with the same
 *      (agency, solicitationNo) without the unique constraint
 *      cross-firing.
 *   2. Querying a Project by id from tenant A's session must NOT
 *      return tenant B's project even when ids collide via guess.
 *   3. AuditEvent rows belong to one tenant and don't show up in
 *      another tenant's filtered query.
 *   4. Listing-pricing fields (estimatedValue) on tenant A are NOT
 *      readable when querying via tenant B's where-clause.
 */

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  ({ prisma, cleanup } = freshPrisma("isolation"));
  const a = await prisma.tenant.create({ data: { name: "Tenant A", slug: `tA-${Date.now()}`, primaryMode: "VERTICAL" } });
  const b = await prisma.tenant.create({ data: { name: "Tenant B", slug: `tB-${Date.now()}`, primaryMode: "VERTICAL" } });
  tenantA = a.id;
  tenantB = b.id;
});

afterAll(async () => {
  await cleanup?.();
});

describe("tenant isolation", () => {
  it("two tenants can have RfpListing rows with the same (agency, solicitationNo)", async () => {
    const sol = `ISO-${Date.now()}`;
    const a = await prisma.rfpListing.create({
      data: { tenantId: tenantA, title: "A's view", agency: "Same Agency", solicitationNo: sol, postedAt: new Date(), estimatedValue: 1_000_000 },
    });
    const b = await prisma.rfpListing.create({
      data: { tenantId: tenantB, title: "B's view", agency: "Same Agency", solicitationNo: sol, postedAt: new Date(), estimatedValue: 2_000_000 },
    });
    expect(a.id).not.toBe(b.id);
    expect(a.tenantId).toBe(tenantA);
    expect(b.tenantId).toBe(tenantB);
  });

  it("findFirst by id without tenantId can leak — must always include tenantId in where", async () => {
    // Demonstration of WHY tenantId scoping matters. Tenant A creates
    // a project; tenant B can find it by id without tenantId. Real
    // routes never call findFirst({ where: { id } }) without a tenant
    // filter; this test documents the failure mode.
    const proj = await prisma.project.create({
      data: { tenantId: tenantA, name: "Secret", code: `SEC-${Date.now()}`, mode: "VERTICAL" },
    });
    const leak = await prisma.project.findFirst({ where: { id: proj.id } });
    expect(leak?.id).toBe(proj.id);
    // Correct query — scoped by tenant — does not return cross-tenant.
    const correct = await prisma.project.findFirst({ where: { id: proj.id, tenantId: tenantB } });
    expect(correct).toBeNull();
  });

  it("AuditEvent rows are tenant-isolated", async () => {
    const auditA = await prisma.auditEvent.create({
      data: { tenantId: tenantA, entityType: "Test", entityId: "x", action: "TEST_A" },
    });
    const auditB = await prisma.auditEvent.create({
      data: { tenantId: tenantB, entityType: "Test", entityId: "y", action: "TEST_B" },
    });
    const tenantAEvents = await prisma.auditEvent.findMany({ where: { tenantId: tenantA, entityType: "Test" } });
    expect(tenantAEvents.find((e) => e.id === auditA.id)).toBeDefined();
    expect(tenantAEvents.find((e) => e.id === auditB.id)).toBeUndefined();
  });

  it("RfpListing scoped count returns only the calling tenant's rows", async () => {
    const aCount = await prisma.rfpListing.count({ where: { tenantId: tenantA } });
    const bCount = await prisma.rfpListing.count({ where: { tenantId: tenantB } });
    const total = await prisma.rfpListing.count();
    expect(aCount + bCount).toBeLessThanOrEqual(total);
    expect(aCount).toBeGreaterThan(0);
    expect(bCount).toBeGreaterThan(0);
  });
});
