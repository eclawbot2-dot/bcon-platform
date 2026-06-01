import { describe, it, expect } from "vitest";
import {
  isApprovedCo,
  isPendingCo,
  approvedCoValue,
  pendingCoValue,
} from "../src/lib/change-order-totals";

describe("change-order classification — value bucketing", () => {
  const cos = [
    { status: "DRAFT", amount: 100 },
    { status: "PENDING", amount: 200 },
    { status: "APPROVED", amount: 400 },
    { status: "EXECUTED", amount: 800 }, // terminal-approved: MUST count as approved
    { status: "REJECTED", amount: 1600 }, // dead: counts toward neither
    { status: "VOID", amount: 3200 }, // dead: counts toward neither
  ];

  it("treats EXECUTED as approved (not pending, not dropped)", () => {
    expect(isApprovedCo("EXECUTED")).toBe(true);
    expect(isApprovedCo("APPROVED")).toBe(true);
    expect(isPendingCo("EXECUTED")).toBe(false);
  });

  it("treats only DRAFT/PENDING as pending", () => {
    expect(isPendingCo("DRAFT")).toBe(true);
    expect(isPendingCo("PENDING")).toBe(true);
    expect(isPendingCo("APPROVED")).toBe(false);
    expect(isPendingCo("REJECTED")).toBe(false);
    expect(isPendingCo("VOID")).toBe(false);
  });

  it("excludes REJECTED and VOID from both approved and pending", () => {
    expect(isApprovedCo("REJECTED")).toBe(false);
    expect(isApprovedCo("VOID")).toBe(false);
    expect(isPendingCo("REJECTED")).toBe(false);
    expect(isPendingCo("VOID")).toBe(false);
  });

  it("approvedCoValue sums APPROVED + EXECUTED only", () => {
    expect(approvedCoValue(cos)).toBe(1200); // 400 + 800
  });

  it("pendingCoValue sums DRAFT + PENDING only (no REJECTED/VOID/EXECUTED)", () => {
    expect(pendingCoValue(cos)).toBe(300); // 100 + 200
  });
});
