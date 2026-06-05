import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { useTempDevDb } from "./_db";

/**
 * reconcileSov is a pure function but lives in src/lib/reports.ts, which
 * imports the @/lib/prisma singleton at module load. Point DATABASE_URL at
 * a throwaway dev.db copy BEFORE importing so the singleton never touches
 * the live developer database (it's never queried here — the function is
 * fed in-memory rows).
 */
const { cleanupFile } = useTempDevDb("sov-recon");

type ReconcileSov = typeof import("../src/lib/reports")["reconcileSov"];
let reconcileSov: ReconcileSov;

beforeAll(async () => {
  ({ reconcileSov } = await import("../src/lib/reports"));
});

afterAll(() => cleanupFile());

function line(lineNumber: number, scheduledValue: number, totalCompleted: number, retainage = 0, costCode: string | null = null, description = `Line ${lineNumber}`) {
  return { lineNumber, costCode, description, scheduledValue, totalCompleted, retainage };
}

describe("reconcileSov — SOV vs pay-app", () => {
  it("returns empty totals when there are no pay apps", () => {
    const r = reconcileSov([]);
    expect(r.lines).toEqual([]);
    expect(r.totals.scheduledValue).toBe(0);
    expect(r.totals.percentComplete).toBe(0);
    expect(r.hasOverBilling).toBe(false);
  });

  it("uses the latest period's cumulative totals for each SOV line", () => {
    const r = reconcileSov([
      { periodNumber: 1, status: "PAID", lines: [line(1, 1000, 300, 30)] },
      { periodNumber: 2, status: "SUBMITTED", lines: [line(1, 1000, 600, 60)] },
    ]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].billedToDate).toBe(600); // latest period, not summed
    expect(r.lines[0].retainageHeld).toBe(60);
    expect(r.lines[0].percentComplete).toBe(60);
    expect(r.lines[0].balanceToFinish).toBe(400);
  });

  it("computes % complete and balance per line", () => {
    const r = reconcileSov([{ periodNumber: 1, status: "SUBMITTED", lines: [line(1, 2000, 500)] }]);
    expect(r.lines[0].percentComplete).toBe(25);
    expect(r.lines[0].balanceToFinish).toBe(1500);
  });

  it("flags over-billing when billed exceeds the scheduled value", () => {
    const r = reconcileSov([{ periodNumber: 1, status: "SUBMITTED", lines: [line(1, 1000, 1200)] }]);
    expect(r.lines[0].overBilled).toBe(200);
    expect(r.hasOverBilling).toBe(true);
    expect(r.totals.overBilled).toBe(200);
  });

  it("rolls up project totals across lines", () => {
    const r = reconcileSov([
      {
        periodNumber: 1,
        status: "SUBMITTED",
        lines: [line(1, 1000, 500, 50), line(2, 3000, 1500, 150)],
      },
    ]);
    expect(r.totals.scheduledValue).toBe(4000);
    expect(r.totals.billedToDate).toBe(2000);
    expect(r.totals.retainageHeld).toBe(200);
    expect(r.totals.percentComplete).toBe(50);
    expect(r.totals.balanceToFinish).toBe(2000);
    expect(r.totals.underBilled).toBe(2000);
  });

  it("sorts lines by line number", () => {
    const r = reconcileSov([
      { periodNumber: 1, status: "SUBMITTED", lines: [line(3, 100, 0), line(1, 100, 0), line(2, 100, 0)] },
    ]);
    expect(r.lines.map((l) => l.lineNumber)).toEqual([1, 2, 3]);
  });

  it("does not double-count a line that appears across multiple periods", () => {
    const r = reconcileSov([
      { periodNumber: 1, status: "PAID", lines: [line(1, 5000, 1000)] },
      { periodNumber: 2, status: "PAID", lines: [line(1, 5000, 2500)] },
      { periodNumber: 3, status: "SUBMITTED", lines: [line(1, 5000, 4000)] },
    ]);
    expect(r.lines).toHaveLength(1);
    expect(r.totals.billedToDate).toBe(4000);
  });
});
