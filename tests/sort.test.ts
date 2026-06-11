import { describe, expect, it } from "vitest";
import { compareSortValues, isEmptySortValue, sortRows } from "@/lib/sort";

describe("isEmptySortValue", () => {
  it("treats null, undefined and empty string as empty", () => {
    expect(isEmptySortValue(null)).toBe(true);
    expect(isEmptySortValue(undefined)).toBe(true);
    expect(isEmptySortValue("")).toBe(true);
  });

  it("treats 0, false and whitespace as NOT empty", () => {
    expect(isEmptySortValue(0)).toBe(false);
    expect(isEmptySortValue(false)).toBe(false);
    expect(isEmptySortValue(" ")).toBe(false);
  });
});

describe("compareSortValues", () => {
  it("compares numbers numerically, not lexically", () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    expect(compareSortValues(100, 99)).toBeGreaterThan(0);
    expect(compareSortValues(-5, 5)).toBeLessThan(0);
  });

  it("compares Date objects by real time value", () => {
    const older = new Date("2025-01-15T00:00:00Z");
    const newer = new Date("2025-11-02T00:00:00Z");
    expect(compareSortValues(older, newer)).toBeLessThan(0);
    expect(compareSortValues(newer, older)).toBeGreaterThan(0);
    expect(compareSortValues(older, new Date(older.getTime()))).toBe(0);
  });

  it("does NOT compare dates as display strings (Apr < Jan lexically)", () => {
    // "Apr 1, 2026" < "Jan 1, 2025" as strings — epoch values must win.
    const apr2026 = new Date("2026-04-01");
    const jan2025 = new Date("2025-01-01");
    expect(compareSortValues(apr2026, jan2025)).toBeGreaterThan(0);
  });

  it("compares strings case-insensitively with numeric awareness", () => {
    expect(compareSortValues("Item 9", "Item 10")).toBeLessThan(0); // numeric: true
    expect(compareSortValues("alpha", "Beta")).toBeLessThan(0);
    expect(compareSortValues("abc", "abc")).toBe(0);
  });

  it("orders booleans false before true", () => {
    expect(compareSortValues(false, true)).toBeLessThan(0);
    expect(compareSortValues(true, false)).toBeGreaterThan(0);
    expect(compareSortValues(true, true)).toBe(0);
  });
});

describe("sortRows", () => {
  type Row = { id: string; amount: number | null; when: Date | null; label: string };
  const rows: Row[] = [
    { id: "a", amount: 250, when: new Date("2026-02-01"), label: "Sitework" },
    { id: "b", amount: 10, when: new Date("2025-12-31"), label: "concrete" },
    { id: "c", amount: null, when: null, label: "Electrical" },
    { id: "d", amount: 1000, when: new Date("2026-01-15"), label: "Plumbing" },
  ];

  it("sorts numbers ascending and descending by real value", () => {
    expect(sortRows(rows, (r) => r.amount, "asc").map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortRows(rows, (r) => r.amount, "desc").map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("sorts dates by epoch in both directions, empties last either way", () => {
    expect(sortRows(rows, (r) => r.when, "asc").map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortRows(rows, (r) => r.when, "desc").map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("sorts strings A-Z / Z-A case-insensitively", () => {
    expect(sortRows(rows, (r) => r.label, "asc").map((r) => r.label)).toEqual([
      "concrete",
      "Electrical",
      "Plumbing",
      "Sitework",
    ]);
    expect(sortRows(rows, (r) => r.label, "desc").map((r) => r.label)).toEqual([
      "Sitework",
      "Plumbing",
      "Electrical",
      "concrete",
    ]);
  });

  it("never mutates the input array (spec §8)", () => {
    const original = [...rows];
    sortRows(rows, (r) => r.amount, "desc");
    expect(rows).toEqual(original);
  });

  it("returns a new array even when already sorted", () => {
    const out = sortRows(rows, () => 1, "asc");
    expect(out).not.toBe(rows);
    expect(out).toHaveLength(rows.length);
  });

  it("keeps all-empty columns stable (everything equal)", () => {
    const out = sortRows(rows, () => null, "asc");
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});
