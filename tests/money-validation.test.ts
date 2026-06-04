import { describe, it, expect } from "vitest";
import { validateMoneyPatch, moneyAmount, percentValue, MONEY_CEILING } from "../src/lib/money";

/**
 * Money-field validation for record edit routes. Before this guard the
 * edit routes spread a client patch straight into prisma.update, so a
 * negative / NaN / Infinity / absurd amount would persist and poison every
 * downstream rollup. These tests pin the accept/reject boundaries.
 */

describe("moneyAmount schema", () => {
  it("accepts zero and positive finite values", () => {
    expect(moneyAmount.safeParse(0).success).toBe(true);
    expect(moneyAmount.safeParse(1234.56).success).toBe(true);
    expect(moneyAmount.safeParse(MONEY_CEILING).success).toBe(true);
  });
  it("rejects negatives, NaN, Infinity, and over-ceiling", () => {
    expect(moneyAmount.safeParse(-0.01).success).toBe(false);
    expect(moneyAmount.safeParse(NaN).success).toBe(false);
    expect(moneyAmount.safeParse(Infinity).success).toBe(false);
    expect(moneyAmount.safeParse(MONEY_CEILING + 1).success).toBe(false);
  });
  it("rejects non-number types", () => {
    expect(moneyAmount.safeParse("100" as unknown).success).toBe(false);
    expect(moneyAmount.safeParse(null as unknown).success).toBe(false);
  });
});

describe("percentValue schema", () => {
  it("accepts 0..100", () => {
    expect(percentValue.safeParse(0).success).toBe(true);
    expect(percentValue.safeParse(10).success).toBe(true);
    expect(percentValue.safeParse(100).success).toBe(true);
  });
  it("rejects <0, >100, NaN", () => {
    expect(percentValue.safeParse(-1).success).toBe(false);
    expect(percentValue.safeParse(100.01).success).toBe(false);
    expect(percentValue.safeParse(NaN).success).toBe(false);
  });
});

describe("validateMoneyPatch", () => {
  it("passes when money/percent fields are valid", () => {
    const r = validateMoneyPatch(
      { amount: 5000, markupPct: 12, notes: "hi" },
      { money: ["amount"], percent: ["markupPct"] },
    );
    expect(r.ok).toBe(true);
  });

  it("ignores fields not in the money/percent lists", () => {
    const r = validateMoneyPatch({ title: "anything", notes: "-9999" }, { money: ["amount"] });
    expect(r.ok).toBe(true);
  });

  it("skips undefined (partial patch) values", () => {
    const r = validateMoneyPatch({ amount: undefined }, { money: ["amount"] });
    expect(r.ok).toBe(true);
  });

  it("rejects a negative money field with a field-named message", () => {
    const r = validateMoneyPatch({ amount: -5 }, { money: ["amount"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/amount/);
  });

  it("rejects an out-of-range percent field", () => {
    const r = validateMoneyPatch({ retainagePct: 150 }, { percent: ["retainagePct"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/retainagePct/);
  });

  it("rejects NaN/Infinity smuggled into a money field", () => {
    expect(validateMoneyPatch({ netDue: NaN }, { money: ["netDue"] }).ok).toBe(false);
    expect(validateMoneyPatch({ netDue: Infinity }, { money: ["netDue"] }).ok).toBe(false);
  });
});
