import { describe, it, expect } from "vitest";
import { reconcileChangeExposure, type ExposureRfiLike } from "../src/lib/reports";

/**
 * Change-exposure reconciler — RFI cost impact → linked change orders.
 * Pure function; no DB. Covers bucketing, cents→dollar conversion,
 * deductive (negative) impacts, the leakage total, and edge inputs.
 */

function rfi(partial: Partial<ExposureRfiLike> & { id: string }): ExposureRfiLike {
  return {
    number: partial.id,
    subject: "Subject",
    status: "APPROVED",
    projectId: "p1",
    projectName: "Project One",
    costImpactCents: null,
    changeOrders: [],
    ...partial,
  };
}

describe("reconcileChangeExposure — bucketing", () => {
  it("buckets an RFI with an APPROVED linked CO as CAPTURED", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 500_00, changeOrders: [{ status: "APPROVED", amount: 600 }] }),
    ]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].bucket).toBe("CAPTURED");
    expect(out.rows[0].estimatedImpact).toBe(500);
    expect(out.rows[0].approvedCoValue).toBe(600);
    // Realized CO grew $100 past the early RFI estimate.
    expect(out.rows[0].capturedDelta).toBe(100);
  });

  it("treats EXECUTED as captured (terminal-approved)", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 100_00, changeOrders: [{ status: "EXECUTED", amount: 100 }] }),
    ]);
    expect(out.rows[0].bucket).toBe("CAPTURED");
    expect(out.rows[0].approvedCoValue).toBe(100);
  });

  it("buckets an RFI whose only CO is DRAFT/PENDING as IN_FLIGHT", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 250_00, changeOrders: [{ status: "PENDING", amount: 240 }] }),
    ]);
    expect(out.rows[0].bucket).toBe("IN_FLIGHT");
    expect(out.rows[0].pendingCoValue).toBe(240);
    expect(out.rows[0].approvedCoValue).toBe(0);
    // Delta only reported for captured rows; raw value is approved − estimate.
    expect(out.rows[0].capturedDelta).toBe(-250);
  });

  it("buckets a cost-impact RFI with no live CO as UNCAPTURED (leakage)", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 750_00, changeOrders: [] }),
    ]);
    expect(out.rows[0].bucket).toBe("UNCAPTURED");
    expect(out.totals.uncapturedExposure).toBe(750);
  });

  it("treats an RFI whose only COs are REJECTED/VOID as UNCAPTURED", () => {
    const out = reconcileChangeExposure([
      rfi({
        id: "1",
        costImpactCents: 300_00,
        changeOrders: [
          { status: "REJECTED", amount: 300 },
          { status: "VOID", amount: 300 },
        ],
      }),
    ]);
    expect(out.rows[0].bucket).toBe("UNCAPTURED");
    expect(out.rows[0].approvedCoValue).toBe(0);
    expect(out.rows[0].pendingCoValue).toBe(0);
    expect(out.totals.uncapturedExposure).toBe(300);
  });

  it("prefers CAPTURED over IN_FLIGHT when both approved and pending COs exist", () => {
    const out = reconcileChangeExposure([
      rfi({
        id: "1",
        costImpactCents: 1000_00,
        changeOrders: [
          { status: "APPROVED", amount: 400 },
          { status: "PENDING", amount: 700 },
        ],
      }),
    ]);
    expect(out.rows[0].bucket).toBe("CAPTURED");
    expect(out.rows[0].approvedCoValue).toBe(400);
    expect(out.rows[0].pendingCoValue).toBe(700);
  });
});

describe("reconcileChangeExposure — inclusion + edge cases", () => {
  it("drops RFIs with neither a cost impact nor a linked CO", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: null, changeOrders: [] }),
      rfi({ id: "2", costImpactCents: 0, changeOrders: [] }),
    ]);
    expect(out.rows).toHaveLength(0);
    expect(out.totals.estimatedImpact).toBe(0);
  });

  it("includes a zero-cost RFI that nonetheless has a linked CO", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 0, changeOrders: [{ status: "APPROVED", amount: 500 }] }),
    ]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].estimatedImpact).toBe(0);
    expect(out.rows[0].approvedCoValue).toBe(500);
    expect(out.rows[0].capturedDelta).toBe(500);
  });

  it("handles a deductive (negative) cost impact without forcing it positive", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: -150_00, changeOrders: [] }),
    ]);
    expect(out.rows[0].estimatedImpact).toBe(-150);
    expect(out.rows[0].bucket).toBe("UNCAPTURED");
    expect(out.totals.uncapturedExposure).toBe(-150);
  });

  it("is cents-exact across many small impacts (no float drift)", () => {
    const rfis = Array.from({ length: 3 }, (_, i) =>
      rfi({ id: String(i), costImpactCents: 10 }), // $0.10 each
    );
    const out = reconcileChangeExposure(rfis);
    expect(out.totals.estimatedImpact).toBe(0.3);
    expect(out.totals.uncapturedExposure).toBe(0.3);
  });

  it("orders rows leakage-first, then by absolute impact desc", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "captured", costImpactCents: 900_00, changeOrders: [{ status: "APPROVED", amount: 900 }] }),
      rfi({ id: "small-leak", costImpactCents: 100_00, changeOrders: [] }),
      rfi({ id: "big-leak", costImpactCents: 800_00, changeOrders: [] }),
      rfi({ id: "inflight", costImpactCents: 999_00, changeOrders: [{ status: "DRAFT", amount: 999 }] }),
    ]);
    expect(out.rows.map((r) => r.rfiId)).toEqual(["big-leak", "small-leak", "inflight", "captured"]);
  });

  it("rolls up totals and per-bucket counts correctly", () => {
    const out = reconcileChangeExposure([
      rfi({ id: "1", costImpactCents: 100_00, changeOrders: [{ status: "APPROVED", amount: 110 }] }),
      rfi({ id: "2", costImpactCents: 200_00, changeOrders: [{ status: "PENDING", amount: 180 }] }),
      rfi({ id: "3", costImpactCents: 300_00, changeOrders: [] }),
      rfi({ id: "4", costImpactCents: 400_00, changeOrders: [] }),
    ]);
    expect(out.totals.estimatedImpact).toBe(1000);
    expect(out.totals.approvedCoValue).toBe(110);
    expect(out.totals.pendingCoValue).toBe(180);
    expect(out.totals.uncapturedExposure).toBe(700); // 300 + 400
    expect(out.totals.capturedCount).toBe(1);
    expect(out.totals.inFlightCount).toBe(1);
    expect(out.totals.uncapturedCount).toBe(2);
  });
});
