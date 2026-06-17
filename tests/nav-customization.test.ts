/**
 * Unit tests for the pure sidebar personalization logic (no DOM / no DB).
 * Covers the stable-sort reorder, hide filtering, defensive parse, and the
 * stable id builder. localStorage read/write is exercised against a tiny
 * in-memory stub so the typeof-window guard path is also covered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ROOT_KEY,
  STORAGE_KEY,
  applyOrder,
  itemIdOf,
  navCustomizationFrom,
  emptyNavCustomization,
  isHidden,
  readNavCustomization,
  writeNavCustomization,
} from "@/lib/nav-customization";

type Node = { title: string };
const idOf = (n: Node) => n.title;

describe("itemIdOf / ROOT_KEY", () => {
  it("builds stable group::href item ids", () => {
    expect(itemIdOf("Home", "/alerts")).toBe("Home::/alerts");
    expect(ROOT_KEY).toBe("__root__");
  });
});

describe("applyOrder (stable reorder)", () => {
  const nodes: Node[] = [{ title: "A" }, { title: "B" }, { title: "C" }];

  it("returns input unchanged when no saved order", () => {
    expect(applyOrder(nodes, idOf)).toEqual(nodes);
    expect(applyOrder(nodes, idOf, [])).toEqual(nodes);
  });

  it("applies saved order first, defaults appended in original order", () => {
    expect(applyOrder(nodes, idOf, ["C", "A"]).map(idOf)).toEqual(["C", "A", "B"]);
  });

  it("tolerates ids that no longer exist (removed) and new ids (added)", () => {
    // "Z" removed since save; "B"/"C" newly added keep default relative order.
    expect(applyOrder(nodes, idOf, ["Z", "A"]).map(idOf)).toEqual(["A", "B", "C"]);
  });

  it("is stable for ties (equal saved position never happens; default index breaks order)", () => {
    const many: Node[] = [{ title: "X" }, { title: "Y" }, { title: "Z" }];
    expect(applyOrder(many, idOf, ["Y"]).map(idOf)).toEqual(["Y", "X", "Z"]);
  });
});

describe("navCustomizationFrom (defensive parse)", () => {
  it("returns empty for junk", () => {
    expect(navCustomizationFrom(null)).toEqual(emptyNavCustomization());
    expect(navCustomizationFrom(42)).toEqual(emptyNavCustomization());
    expect(navCustomizationFrom("nope")).toEqual(emptyNavCustomization());
  });

  it("filters non-string ids out of order arrays and hidden", () => {
    const parsed = navCustomizationFrom({
      order: { [ROOT_KEY]: ["A", 5, "B", null], bad: "notArray" },
      hidden: ["A", 1, "B"],
    });
    expect(parsed.order[ROOT_KEY]).toEqual(["A", "B"]);
    expect(parsed.order.bad).toBeUndefined();
    expect(parsed.hidden).toEqual(["A", "B"]);
  });
});

describe("isHidden", () => {
  it("reflects membership", () => {
    const c = { order: {}, hidden: ["Home"] };
    expect(isHidden(c, "Home")).toBe(true);
    expect(isHidden(c, "Finance")).toBe(false);
  });
});

describe("localStorage read/write", () => {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", { localStorage: stub });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips through localStorage", () => {
    const c = { order: { [ROOT_KEY]: ["B", "A"] }, hidden: ["X"] };
    writeNavCustomization(c);
    expect(store.get(STORAGE_KEY)).toBe(JSON.stringify(c));
    expect(readNavCustomization()).toEqual(c);
  });

  it("returns empty for missing / malformed stored value", () => {
    expect(readNavCustomization()).toEqual(emptyNavCustomization());
    store.set(STORAGE_KEY, "{not json");
    expect(readNavCustomization()).toEqual(emptyNavCustomization());
  });
});
