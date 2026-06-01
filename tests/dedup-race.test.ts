import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Race-guard tests for the dedup and autopilot idempotency fixes
 * landed in pass-12. Use a temp SQLite copy of the dev.db so tests
 * can write rows without polluting the working database.
 *
 * These tests exercise REAL Prisma operations against the unique
 * constraint, which is the only way to verify the catch in
 * src/lib/rfp-crawl.ts actually distinguishes P2002 from other
 * errors.
 */

let prisma: PrismaClient;
let tmpDbPath: string;
let tenantId: string;

beforeAll(async () => {
  // Copy dev.db to a tmp file so the tests can mutate it without
  // affecting development state. If dev.db doesn't exist, skip.
  const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
  if (!fs.existsSync(devDb)) {
    throw new Error("dev.db not found — run `npx prisma db push` first");
  }
  tmpDbPath = path.join(os.tmpdir(), `bcon-test-dedup-${Date.now()}.db`);
  fs.copyFileSync(devDb, tmpDbPath);

  const adapter = new PrismaBetterSqlite3({ url: `file:${tmpDbPath}` });
  prisma = new PrismaClient({ adapter });

  // Use an existing tenant if there is one, otherwise create a fresh
  // throwaway tenant for this test run. Either way we clean up at the
  // end by dropping the tmp DB file, not by deleting rows.
  const existing = await prisma.tenant.findFirst();
  if (existing) {
    tenantId = existing.id;
  } else {
    const created = await prisma.tenant.create({
      data: { name: "test-dedup-race", slug: `dedup-race-${Date.now()}`, primaryMode: "SIMPLE" },
    });
    tenantId = created.id;
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
});

describe("RfpListing unique-constraint dedup", () => {
  it("rejects a duplicate (tenantId, agency, solicitationNo) on create", async () => {
    const sol = `RACE-TEST-${Date.now()}-A`;
    await prisma.rfpListing.create({
      data: {
        tenantId,
        title: "first insert",
        agency: "Test Agency",
        solicitationNo: sol,
        postedAt: new Date(),
      },
    });

    let caught: Error | null = null;
    try {
      await prisma.rfpListing.create({
        data: {
          tenantId,
          title: "second insert (should fail)",
          agency: "Test Agency",
          solicitationNo: sol,
          postedAt: new Date(),
        },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/Unique constraint failed/i);
  });

  it("treats NULL solicitationNo as distinct (multiple null-rows allowed)", async () => {
    // SQLite treats NULL as distinct in unique indexes, so two
    // listings without a solicitation number should co-exist.
    const a = await prisma.rfpListing.create({
      data: {
        tenantId,
        title: "no-sol-a",
        agency: "Anonymous Agency",
        solicitationNo: null,
        postedAt: new Date(),
      },
    });
    const b = await prisma.rfpListing.create({
      data: {
        tenantId,
        title: "no-sol-b",
        agency: "Anonymous Agency",
        solicitationNo: null,
        postedAt: new Date(),
      },
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe("Autopilot idempotency guard", () => {
  it("excludes already-auto-drafted listings from unscored query", async () => {
    const sol = `RACE-TEST-${Date.now()}-B`;
    const listing = await prisma.rfpListing.create({
      data: {
        tenantId,
        title: "already-drafted listing",
        agency: "Test Agency",
        solicitationNo: sol,
        postedAt: new Date(),
        score: null,
        autoDraftedAt: new Date(),
      },
    });
    const found = await prisma.rfpListing.findMany({
      where: {
        tenantId,
        score: null,
        autoDraftedAt: null,
      },
    });
    expect(found.find((l) => l.id === listing.id)).toBeUndefined();
  });

  it("atomic score-write skips when another sweep beat it", async () => {
    const sol = `RACE-TEST-${Date.now()}-C`;
    const listing = await prisma.rfpListing.create({
      data: {
        tenantId,
        title: "racy score listing",
        agency: "Test Agency",
        solicitationNo: sol,
        postedAt: new Date(),
        score: null,
      },
    });

    // Simulate sweep #1 winning by writing the score first.
    await prisma.rfpListing.update({
      where: { id: listing.id },
      data: { score: 88 },
    });

    // Sweep #2 attempts the guarded updateMany; should match 0 rows.
    const result = await prisma.rfpListing.updateMany({
      where: { id: listing.id, score: null, autoDraftedAt: null },
      data: { score: 42 },
    });
    expect(result.count).toBe(0);

    // Score should still be 88 — sweep #2 didn't overwrite.
    const fresh = await prisma.rfpListing.findUnique({ where: { id: listing.id } });
    expect(fresh?.score).toBe(88);
  });
});

describe("SubBid award idempotency guard", () => {
  // awardSubBid (src/lib/subcontract-award.ts) creates an EXECUTED Contract +
  // ContractCommitment — real committed dollars with no unique key. A
  // double-submit on the award button would create a duplicate subcontract.
  // The fix claims the winning SubBid via a conditional updateMany that only
  // matches a pre-award status; a second attempt matches zero rows and bails.
  async function makeSubBid(status: "SUBMITTED" | "SELECTED") {
    const project = await prisma.project.create({
      data: { tenantId, name: "award-race", code: `AR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode: "SIMPLE" },
    });
    const pkg = await prisma.bidPackage.create({
      data: { projectId: project.id, name: "Concrete", trade: "Concrete" },
    });
    const vendor = await prisma.vendor.create({
      data: { tenantId, name: `Vendor-${Math.random().toString(36).slice(2, 6)}` },
    });
    const bid = await prisma.subBid.create({
      data: { bidPackageId: pkg.id, vendorId: vendor.id, bidAmount: 100000, status },
    });
    return bid.id;
  }

  it("claim matches one row on first award, zero on the second", async () => {
    const bidId = await makeSubBid("SUBMITTED");

    // First award: the conditional claim should flip SUBMITTED -> SELECTED.
    const first = await prisma.subBid.updateMany({
      where: { id: bidId, status: { in: ["SUBMITTED", "BIDDING", "INVITED"] } },
      data: { status: "SELECTED" },
    });
    expect(first.count).toBe(1);

    // Second award (re-submit / concurrent): bid is already SELECTED, so the
    // same guarded claim matches nothing and the contract-creation path bails.
    const second = await prisma.subBid.updateMany({
      where: { id: bidId, status: { in: ["SUBMITTED", "BIDDING", "INVITED"] } },
      data: { status: "SELECTED" },
    });
    expect(second.count).toBe(0);
  });

  it("awardSubBid creates exactly one contract even when called twice", async () => {
    vi.resetModules();
    // Point the lib's prisma client at the temp DB used by this test.
    vi.doMock("@/lib/prisma", () => ({ prisma }));
    const { awardSubBid } = await import("@/lib/subcontract-award");

    const bidId = await makeSubBid("SUBMITTED");

    const r1 = await awardSubBid(bidId, tenantId);
    const r2 = await awardSubBid(bidId, tenantId);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.note).toMatch(/already been awarded/i);

    // Only ONE contract should exist for this bid's commitment.
    const bid = await prisma.subBid.findUnique({
      where: { id: bidId },
      include: { bidPackage: true },
    });
    const contracts = await prisma.contract.findMany({
      where: { projectId: bid!.bidPackage.projectId, type: "SUBCONTRACT" },
    });
    expect(contracts.length).toBe(1);

    vi.doUnmock("@/lib/prisma");
  });
});
