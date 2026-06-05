import { describe, it, expect } from "vitest";
import { buildLevelingMatrix, buildBidderSummaries, OUTLIER_THRESHOLD, type LevelingBidder } from "../src/lib/leveling";

function bidder(id: string, lines: Array<[string, number, boolean?]>, statedTotal?: number, days?: number): LevelingBidder {
  return {
    subBidId: `sb-${id}`,
    vendorId: `v-${id}`,
    vendorName: `Vendor ${id}`,
    statedTotal: statedTotal ?? lines.reduce((s, [, amt, incl]) => s + (incl === false ? 0 : amt), 0),
    daysToComplete: days ?? null,
    lines: lines.map(([scopeItemKey, amount, inclusion]) => ({
      scopeItemKey,
      description: `desc ${scopeItemKey}`,
      amount,
      inclusion: inclusion !== false,
    })),
  };
}

describe("leveling — matrix", () => {
  it("groups bidders' lines by shared scope-item key into one row each", () => {
    const rows = buildLevelingMatrix([
      bidder("a", [["100", 1000], ["200", 2000]]),
      bidder("b", [["100", 1100], ["200", 1900]]),
    ]);
    expect(rows.map((r) => r.scopeItemKey)).toEqual(["100", "200"]);
    expect(rows[0].cells.size).toBe(2);
  });

  it("flags the lowest INCLUDED amount per row as low", () => {
    const rows = buildLevelingMatrix([
      bidder("a", [["100", 1000]]),
      bidder("b", [["100", 800]]),
      bidder("c", [["100", 1200]]),
    ]);
    const row = rows[0];
    expect(row.lowVendorId).toBe("v-b");
    expect(row.cells.get("v-b")!.isLow).toBe(true);
    expect(row.cells.get("v-a")!.isLow).toBe(false);
  });

  it("never picks an excluded line as the low even if its number is smaller", () => {
    const rows = buildLevelingMatrix([
      bidder("a", [["100", 0, false]]), // excluded — $0
      bidder("b", [["100", 900]]),
    ]);
    expect(rows[0].lowVendorId).toBe("v-b");
    expect(rows[0].cells.get("v-a")!.isLow).toBe(false);
  });

  it("flags a high outlier above the threshold over the included average", () => {
    // avg of 1000,1000 = 1000; c at 2000 is +100% > 40% threshold
    const rows = buildLevelingMatrix([
      bidder("a", [["100", 1000]]),
      bidder("b", [["100", 1000]]),
      bidder("c", [["100", 2000]]),
    ]);
    expect(rows[0].cells.get("v-c")!.isOutlier).toBe(true);
    expect(rows[0].cells.get("v-a")!.isOutlier).toBe(false);
  });

  it("does not flag the low bidder as an outlier", () => {
    const rows = buildLevelingMatrix([
      bidder("a", [["100", 100]]),
      bidder("b", [["100", 1000]]),
      bidder("c", [["100", 1000]]),
    ]);
    expect(rows[0].cells.get("v-a")!.isOutlier).toBe(false);
    expect(rows[0].cells.get("v-a")!.isLow).toBe(true);
  });

  it("threshold constant is a sane fraction", () => {
    expect(OUTLIER_THRESHOLD).toBeGreaterThan(0);
    expect(OUTLIER_THRESHOLD).toBeLessThan(1);
  });
});

describe("leveling — bidder summaries", () => {
  it("leveled total sums only INCLUDED lines", () => {
    const s = buildBidderSummaries([bidder("a", [["100", 1000], ["200", 500, false]])]);
    expect(s[0].leveledTotal).toBe(1000);
    expect(s[0].exclusionCount).toBe(1);
  });

  it("falls back to stated total when a bidder has no line items", () => {
    const s = buildBidderSummaries([{ subBidId: "x", vendorId: "vx", vendorName: "X", statedTotal: 4200, lines: [] }]);
    expect(s[0].leveledTotal).toBe(4200);
    expect(s[0].lineCount).toBe(0);
  });

  it("marks the lowest leveled total as low overall and computes deltaVsLow", () => {
    const s = buildBidderSummaries([
      bidder("a", [["100", 1000]]),
      bidder("b", [["100", 1500]]),
    ]);
    const a = s.find((x) => x.vendorId === "v-a")!;
    const b = s.find((x) => x.vendorId === "v-b")!;
    expect(a.isLowOverall).toBe(true);
    expect(a.deltaVsLow).toBe(0);
    expect(b.isLowOverall).toBe(false);
    expect(b.deltaVsLow).toBe(500);
  });

  it("zero-priced bidders are neither low nor have a delta", () => {
    const s = buildBidderSummaries([{ subBidId: "x", vendorId: "vx", vendorName: "X", statedTotal: 0, lines: [] }]);
    expect(s[0].isLowOverall).toBe(false);
    expect(s[0].deltaVsLow).toBe(0);
  });
});
