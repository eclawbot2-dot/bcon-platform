/**
 * Money-safety helpers. Accept any of:
 *   - number (legacy Float fields)
 *   - Decimal (new Prisma Decimal columns) — duck-typed by .toNumber()
 *   - null / undefined / NaN — treated as zero
 *
 * Helpers work in integer cents internally to avoid IEEE-754 drift
 * across accumulated sums. Output is always a number rounded to 2
 * decimals, suitable for display + DB write-back. If a caller wants
 * to keep full Decimal precision through a chain of operations,
 * they should use .add() / .mul() on the Decimal directly; these
 * helpers are for end-stage rollup + display.
 */

export type MoneyLike = number | { toNumber: () => number } | null | undefined;

/** Coerce a MoneyLike to a finite number, treating non-finite as 0. */
export function toNum(v: MoneyLike): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber: () => number }).toNumber === "function") {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Round a dollar amount to 2 decimals (HALF_UP matches AIA + Sage + QB). */
export function roundCents(n: MoneyLike): number {
  const v = toNum(n);
  return Math.round(v * 100) / 100;
}

/** Sum a list of dollar amounts without floating-point drift. */
export function sumMoney(values: ReadonlyArray<MoneyLike>): number {
  let cents = 0;
  for (const v of values) {
    cents += Math.round(toNum(v) * 100);
  }
  return cents / 100;
}

/** Multiply a dollar amount by a unit-less factor with safe rounding. */
export function multiplyMoney(amount: MoneyLike, factor: MoneyLike): number {
  return roundCents(toNum(amount) * toNum(factor));
}

/** Subtract one dollar amount from another with safe rounding. */
export function subtractMoney(a: MoneyLike, b: MoneyLike): number {
  return sumMoney([toNum(a), -toNum(b)]);
}

/** Add two dollar amounts with safe rounding. */
export function addMoney(a: MoneyLike, b: MoneyLike): number {
  return sumMoney([a, b]);
}

/** Compute a percentage (rate × 100) of a dollar amount, rounded. */
export function percentOf(amount: MoneyLike, ratePct: MoneyLike): number {
  return multiplyMoney(amount, toNum(ratePct) / 100);
}

/**
 * Burdened labor cost = base labor + (base labor × burden%).
 *
 * `baseLabor` is the gross hourly-rate × hours figure (dollars). `burdenPct`
 * is the employer-tax + benefits load expressed as a percentage of base
 * (e.g. 32 means 32%), matching Employee.burdenRate. Both legs route through
 * the cents-safe primitives so the burden leg never drifts and the sum is
 * exact — this is what hits PayrollRunLine.burden / totalCost.
 */
export function burdenedLaborCost(baseLabor: MoneyLike, burdenPct: MoneyLike): number {
  const base = roundCents(baseLabor);
  const burden = percentOf(base, burdenPct);
  return addMoney(base, burden);
}

/** Convert dollars to integer cents (useful for cents-only models). */
export function toCents(dollars: MoneyLike): number {
  return Math.round(toNum(dollars) * 100);
}

/** Convert integer cents back to dollars. */
export function fromCents(cents: MoneyLike): number {
  return toNum(cents) / 100;
}

/** Compare two dollar amounts for equality within a 1-cent tolerance. */
export function eqMoney(a: MoneyLike, b: MoneyLike, toleranceCents: number = 1): boolean {
  return Math.abs(toCents(a) - toCents(b)) <= toleranceCents;
}

// ---------------------------------------------------------------------------
// Money-field validation
//
// Edit routes (record-actions.ts) previously spread a client-supplied
// `patch` straight into prisma.update with no bounds, so a negative or
// absurd amount (or a NaN/Infinity smuggled through JSON) would persist and
// corrupt every downstream rollup (WIP, AP aging, bonding capacity). These
// validators reject such values BEFORE the write.
// ---------------------------------------------------------------------------

import { z } from "zod";

/** Hard ceiling for any single money field. $1e12 (a trillion dollars) is
 *  comfortably above any real construction line item while still catching
 *  fat-finger / overflow garbage. */
export const MONEY_CEILING = 1_000_000_000_000;

/** A non-negative, finite dollar amount with at most a trillion-dollar
 *  ceiling. Rejects NaN/Infinity (zod's .finite()) and negatives. */
export const moneyAmount = z
  .number({ error: "must be a number" })
  .finite("must be a finite number")
  .nonnegative("must be ≥ 0")
  .max(MONEY_CEILING, `must be ≤ ${MONEY_CEILING}`);

/** A percentage field (markup, retainage). 0–100, finite. */
export const percentValue = z
  .number({ error: "must be a number" })
  .finite("must be a finite number")
  .min(0, "must be ≥ 0")
  .max(100, "must be ≤ 100");

export type MoneyValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate the money/percent fields present in an edit patch. Only the
 * keys listed in `moneyFields` / `percentFields` are checked; non-money
 * keys (notes, titles, dates) pass through untouched. `undefined` values
 * are skipped (partial patch — not being changed). Returns the first
 * failure as a human-readable message so callers can surface it.
 */
export function validateMoneyPatch(
  patch: Record<string, unknown>,
  fields: { money?: readonly string[]; percent?: readonly string[] },
): MoneyValidationResult {
  for (const key of fields.money ?? []) {
    const v = patch[key];
    if (v === undefined) continue;
    const parsed = moneyAmount.safeParse(v);
    if (!parsed.success) {
      return { ok: false, error: `${key} ${parsed.error.issues[0]?.message ?? "is invalid"}.` };
    }
  }
  for (const key of fields.percent ?? []) {
    const v = patch[key];
    if (v === undefined) continue;
    const parsed = percentValue.safeParse(v);
    if (!parsed.success) {
      return { ok: false, error: `${key} ${parsed.error.issues[0]?.message ?? "is invalid"}.` };
    }
  }
  return { ok: true };
}
